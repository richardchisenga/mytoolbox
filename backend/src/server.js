// src/server.js - Complete application with DeepSeek AI integration, manual payments, Notes, Assessments, Admin routes, and Export routes
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, TextRun } = require('docx');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { getCurriculumContext, getCurriculumContextAsync, formatContext, listCurriculumSources, listCurriculumRows, catalogSubjects, getReferenceTitles, getRegisteredOfficialSource } = require('./utils/curriculumContext');
const { getCBCSubjectProfile } = require('./utils/cbcSubjectProfiles');
const { listCDCResources, loadCDCRows } = require('./utils/cdcLibrary');

const app = express();
const PORT = process.env.PORT || 3000;

// Safe term label used by Word/PDF exporters.
function termWord(term) {
  const raw = String(term ?? '').trim();
  const n = raw.match(/\d+/)?.[0];
  if (n === '1') return 'ONE';
  if (n === '2') return 'TWO';
  if (n === '3') return 'THREE';
  if (/^first$/i.test(raw)) return 'ONE';
  if (/^second$/i.test(raw)) return 'TWO';
  if (/^third$/i.test(raw)) return 'THREE';
  return raw || '';
}

// ============ ONLINE RESEARCH ENRICHMENT ============
async function getOnlineResearchContext({ curriculum, grade, subject, term = '', topic = '', subtopic = '' } = {}) {
  return '';
}

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

// ============ DEEPSEEK AI CLIENT ============
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  timeout: 60000,
  maxRetries: 0
});

// ============ CORS CONFIGURATION ============
const corsOptions = {
  origin: [
    'https://mytoolbox-1.onrender.com',
    'https://mytoolbox.onrender.com',
    /\.onrender\.com$/,
    'https://mytoolbox-nine.vercel.app',
    'https://mytoolbox-0e80w147vy-ryichietechn.vercel.app',
    /\.vercel\.app$/,
    'https://mytoolbox-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:5000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
};

// ============ MIDDLEWARE ============
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    dnsPrefetchControl: false,
    frameguard: false,
    hsts: false,
    ieNoOpen: false,
    noSniff: false,
    referrerPolicy: false,
    xssFilter: false,
  })
);

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Notes uploads: keep files in memory so no permanent server disk is required.
const notesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
      'application/json', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]);
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    const allowedExt = ['pdf','txt','md','csv','json','doc','docx'];
    if (allowed.has(file.mimetype) || allowedExt.includes(ext)) return cb(null, true);
    cb(new Error('Unsupported file type. Upload PDF, DOC, DOCX, TXT, MD, CSV or JSON.'));
  }
});

// ============ AUTHENTICATION MIDDLEWARE ============
const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============ ROOT ENDPOINT ============
app.get('/', (req, res) => {
  res.json({ message: 'MyToolbox API is running' });
});

// ============ ROBUST DEEPSEEK JSON PARSER ============
function safeParseJSON(content) {
  if (!content || typeof content !== 'string') {
    console.error('❌ DeepSeek returned empty or invalid content');
    return null;
  }
  try { return JSON.parse(content.trim()); } catch (firstError) {
    console.warn('⚠️ Direct JSON.parse failed:', firstError.message);
  }
  try {
    let cleaned = content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      console.error('❌ No JSON object found in DeepSeek response');
      return null;
    }
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    try { return JSON.parse(cleaned); } catch (secondError) {
      console.warn('⚠️ Cleaned JSON.parse failed:', secondError.message);
      return null;
    }
  } catch (error) {
    console.error('❌ JSON cleanup failed:', error.message);
    return null;
  }
}

// ============ IMPROVED DEEPSEEK GENERATE FUNCTION ============
async function generateDeepSeekJSON(messages, options = {}) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🤖 DeepSeek attempt ${attempt}/${maxAttempts}`);
      const maxTokens = options.max_tokens || 4000;
      const response = await deepseek.chat.completions.create({
        model: options.model || 'deepseek-chat',
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      });
      const choices = Array.isArray(response?.choices) ? response.choices : [];
      const choice = choices[0];
      if (!choice) {
        const responseKeys = response && typeof response === 'object' ? Object.keys(response).join(', ') : typeof response;
        const status = response?.status || response?.status_code || 'unknown';
        const finish = response?.finish_reason || response?.output?.finish_reason || 'unknown';
        console.error(`❌ DeepSeek response contained no choices (status=${status}, finish=${finish}, keys=${responseKeys})`);
        throw new Error('DeepSeek returned no choices; API response was incomplete');
      }
      console.log(`🤖 Finish reason: ${choice.finish_reason || 'unknown'}`);
      if (choice.finish_reason === 'length') {
        console.warn('⚠️ DeepSeek response was truncated, trying to parse partial response...');
      }
      const content = choice?.message?.content;
      if (!content) throw new Error('DeepSeek returned empty content');
      let parsed = null;
      try { parsed = JSON.parse(content.trim()); }
      catch (parseError) {
        console.warn('⚠️ Direct JSON.parse failed, trying to clean...');
        let cleaned = content
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          try { parsed = JSON.parse(cleaned); }
          catch (e) { console.error('❌ Cleaned JSON.parse also failed:', e.message); }
        }
      }
      if (!parsed) throw new Error('DeepSeek returned invalid JSON');
      return parsed;
    } catch (error) {
      console.error(`⚠️ DeepSeek attempt ${attempt} failed:`, error.message);
      if (attempt === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
    }
  }
}

// ============================================================
// GENERIC CONTENT DETECTION (shared by CBC + OBC quality gate)
// ============================================================
const GENERIC_PHRASES = [
  /using appropriate examples/i,
  /appropriate examples/i,
  /appropriate classroom task/i,
  /appropriate activities/i,
  /subject-appropriate activity/i,
  /subject-appropriate learning activities/i,
  /relevant subject questions or activities/i,
  /relevant subject question or activity/i,
  /main concepts, terms, processes/i,
  /key ideas of .* using appropriate/i,
  /investigate or classify information related to/i,
  /apply the new knowledge to the activity/i,
  /main content of .* using appropriate examples/i,
  /key points of .* and identify/i,
  /appropriate OBC teaching methods/i,
  /demonstrate understanding of .* through subject-appropriate/i,
  /application task based on/i,
  /complete an application task/i,
  /apply the concept correctly/i,
  /apply your knowledge of .* to a relevant/i,
  /explain the main idea, relationship or process/i,
  /give evidence that demonstrates the stated competence/i,
  /complete an appropriate .* task/i,
  /appropriate teaching methods/i,
  /various teaching methods/i,
  /relevant examples? of/i,
  /discuss the topic/i,
  /explain the concept of \w+$/i,
  /apply the concepts? to/i,
  /important topic in/i,
  /essential topic in/i,
  /key points covered in the lesson/i,
  /common applications in daily life/i,
  /develops critical thinking and problem-solving skills/i,
  /work through detailed examples showing how to apply/i,
  /identify the key information/i,
  /apply the appropriate formula\/method/i,
  /solve step by step/i,
  /check your answer/i,
];

function countGenericMatches(text) {
  const t = String(text || '');
  let hits = 0;
  for (const re of GENERIC_PHRASES) {
    if (re.test(t)) hits++;
  }
  return hits;
}

function normalizeForCompare(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function topicTokens(value) {
  const stop = new Set([
    'the','and','of','in','to','for','on','a','an','with','by','from','use','using',
    'understanding','demonstrate','explain','apply','learners','learner','lesson',
    'introduction','definition','concept','concepts','topic','subtopic','activities',
    'activity','examples','example','state','identify','describe','discuss','their',
    'this','that','these','those','which','what','when','where','who','why','how'
  ]);
  return new Set(
    normalizeForCompare(value)
      .split(' ')
      .filter(t => t.length > 2 && !stop.has(t))
  );
}

function topicOverlapScore(topic, subtopic, text) {
  const focus = `${topic} ${subtopic}`.trim();
  const focusTokens = topicTokens(focus);
  if (!focusTokens.size) return 1;
  const textTokens = topicTokens(text);
  if (!textTokens.size) return 0;
  let common = 0;
  for (const t of focusTokens) if (textTokens.has(t)) common++;
  return common / focusTokens.size;
}

function detectGenericLesson(aiContent, { curriculumType, topic, subtopic }) {
  const reasons = [];
  if (!aiContent || typeof aiContent !== 'object') {
    return { generic: true, reasons: ['empty lesson object'] };
  }

  const focus = `${topic || ''} ${subtopic || ''}`.trim();

  const parts = [];
  const pushText = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) { v.forEach(pushText); return; }
    if (typeof v === 'object') { Object.values(v).forEach(pushText); return; }
    parts.push(String(v));
  };

  if (curriculumType === 'cbc') {
    pushText(aiContent.specificCompetence);
    pushText(aiContent.expectedStandard);
    pushText(aiContent.lessonGoal);
    pushText(aiContent.rationale);
    pushText(aiContent.priorKnowledge);
    pushText(aiContent.learningOutcomes);
    pushText(aiContent.learnersEvaluation);
    pushText(aiContent.homework);
    pushText(aiContent.lessonProgression);
  } else {
    pushText(aiContent.rationale);
    pushText(aiContent.learningOutcomes);
    pushText(aiContent.learnersEvaluation);
    pushText(aiContent.expectedAnswers);
    pushText(aiContent.prerequisiteKnowledge);
    pushText(aiContent.lessonIntroduction);
    pushText(aiContent.lessonConclusion);
    pushText(aiContent.lessonDevelopment);
  }

  const combined = parts.join('\n');
  const genericHits = countGenericMatches(combined);
  if (genericHits >= 3) {
    reasons.push(`filler phrases detected (${genericHits} matches)`);
  }

  if (curriculumType === 'cbc') {
    const lp = Array.isArray(aiContent.lessonProgression) ? aiContent.lessonProgression : [];
    if (lp.length < 6) reasons.push('CBC lessonProgression has fewer than 6 stages');
    const emptyStages = lp.filter(r =>
      !String(r?.teacherRole || '').trim() ||
      !String(r?.learnerRole || '').trim() ||
      !String(r?.assessmentCriteria || '').trim()
    );
    if (emptyStages.length) reasons.push('some CBC progression stages have empty roles or criteria');
  } else {
    const ld = Array.isArray(aiContent.lessonDevelopment) ? aiContent.lessonDevelopment : [];
    if (ld.length < 4) reasons.push('OBC lessonDevelopment has fewer than 4 rows');
    const emptyRows = ld.filter(r =>
      !String(r?.learningPoints || r?.content || '').trim() ||
      !String(r?.teacherActivities || r?.teacherActivity || '').trim() ||
      !String(r?.pupilActivities || r?.pupilActivity || '').trim()
    );
    if (emptyRows.length) reasons.push('some OBC development rows are missing learning points, teacher or pupil activities');
  }

  const focusNorm = normalizeForCompare(focus);
  const substantiveNorm = normalizeForCompare(parts.join(' '));
  const overlap = topicOverlapScore(topic, subtopic, substantiveNorm);
  const containsFocus =
    focusNorm.length >= 4 &&
    (substantiveNorm.includes(focusNorm) || overlap >= 0.5);
  if (focusNorm && !containsFocus && overlap < 0.4) {
    reasons.push(`content is not anchored to the selected topic/subtopic (overlap=${overlap.toFixed(2)})`);
  }

  return { generic: reasons.length > 0, reasons };
}

// ============================================================
// STRICTER REPAIR PROMPT (sent back to DeepSeek)
// ============================================================
function buildStrictRepairPrompt({ curriculumType, topic, subtopic, grade, subject, term, previousContent, reasons }) {
  const focus = subtopic ? `"${topic}" → sub-topic "${subtopic}"` : `"${topic}"`;
  const structure = curriculumType === 'cbc'
    ? `"lessonProgression": array of EXACTLY 6 stages named INTRODUCTION, LESSON DEVELOPMENT, ACTIVITY 1, ACTIVITY 2, EXERCISE, CONCLUSION (total = 80 minutes). Each stage MUST contain: stage, time, teacherRole, learnerRole, assessmentCriteria.`
    : `"lessonDevelopment": array of 4-6 rows. Each row MUST contain: time, learningPoints, teacherActivities, pupilActivities, methods.`;

  return `You previously produced a GENERIC lesson plan that was REJECTED by the quality gate.

REJECTION REASONS:
${reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}

You MUST now rewrite the lesson so it is CONCRETE and TOPIC-SPECIFIC.

FOCUS (do not drift from this):
- Grade/Form: ${grade}
- Subject: ${subject}
- Term: ${term || 'not supplied'}
- Topic: ${topic}
- Sub-topic: ${subtopic || '(none — use the topic only)'}
- Curriculum family: ${curriculumType.toUpperCase()}

HARD RULES — ANY VIOLATION WILL BE REJECTED AGAIN:
1. Every stage/row must contain ACTUAL subject content (definitions, facts, formulas, processes, examples, cases, worked calculations, texts, procedures) drawn from the exact topic and sub-topic.
2. NEVER use these filler phrases (or anything similar):
   - "using appropriate examples"
   - "appropriate classroom task"
   - "subject-appropriate activity"
   - "relevant subject questions or activities"
   - "main concepts, terms, processes"
   - "key ideas of X using appropriate examples"
   - "investigate or classify information related to"
   - "apply the new knowledge to the activity"
   - "apply your knowledge of X to a relevant subject question or activity"
   - "explain the main idea, relationship or process"
   - "give evidence that demonstrates the stated competence"
   - "complete an application task"
   - "discuss the topic"
   - "work through detailed examples"
3. Teacher roles must say EXACTLY what the teacher does, writes, draws, asks, demonstrates or corrects.
4. Learner roles must say EXACTLY what learners do, calculate, draw, label, discuss, produce or answer.
5. The EXERCISE stage must contain REAL questions/tasks with real values, terms, cases or items — not instructions to invent questions.
6. If the sub-topic names a specific case (e.g. "Eye Disorders"), the content must stay inside that case for the whole lesson. Do not drift back to the parent topic.
7. Return ONLY valid JSON matching the required structure for ${curriculumType.toUpperCase()}.
8. Required structure: ${structure}
9. Do not include any commentary, markdown fences, or explanation outside the JSON.

PREVIOUS REJECTED OUTPUT (for reference — do NOT copy it):
${JSON.stringify(previousContent).slice(0, 4000)}

NOW RETURN THE REWRITTEN JSON ONLY.`;
}

// ============================================================
// OFFLINE TOPIC-SPECIFIC TEMPLATES
// ============================================================
// Each family returns a full CBC-style progression (6 stages) and an
// OBC-style development (5 rows). The focus (topic + subtopic) is injected
// into every stage so the offline fallback is genuinely topic-anchored.

function familyMatch(text, patterns) {
  const t = String(text || '').toLowerCase();
  return patterns.some(p => p.test(t));
}

// ---------- BIOLOGY ----------
function biologyTemplate(focus) {
  return {
    cbc: [
      { stage: 'INTRODUCTION', time: '5 min', teacherRole: `Ask learners what they already know about ${focus}. Write the term on the board and connect learner responses to the day's focus.`, learnerRole: `Answer the opening questions and share prior knowledge about ${focus}.`, assessmentCriteria: `Learners give at least one accurate statement about ${focus}.` },
      { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: `Explain ${focus} using a labelled diagram on the board. Define the key terms and give one local Zambian example.`, learnerRole: `Listen, ask questions, copy the definition and label the diagram in their books.`, assessmentCriteria: `Learners copy the definition accurately and label the diagram correctly.` },
      { stage: 'ACTIVITY 1', time: '15 min', teacherRole: `Give groups a chart or specimen related to ${focus}. Ask them to identify and describe the main features or processes.`, learnerRole: `In groups, examine the chart/specimen, identify features and record findings about ${focus}.`, assessmentCriteria: `Groups correctly identify at least two features of ${focus}.` },
      { stage: 'ACTIVITY 2', time: '15 min', teacherRole: `Ask each group to present their findings about ${focus}. Correct misconceptions and reinforce the correct scientific language.`, learnerRole: `Present findings to the class, answer peer questions and correct their notes.`, assessmentCriteria: `Presentations use correct terms about ${focus} and answer questions.` },
      { stage: 'EXERCISE', time: '25 min', teacherRole: `Give individual questions on ${focus}: definitions, labelling, short explanations and one application question. Mark and give feedback.`, learnerRole: `Answer the questions individually, then correct their work after feedback.`, assessmentCriteria: `Learners correctly answer most questions on ${focus}.` },
      { stage: 'CONCLUSION', time: '10 min', teacherRole: `Summarise the key points about ${focus}, ask an exit question and identify learners who need remedial support.`, learnerRole: `State two key facts about ${focus} and answer the exit question.`, assessmentCriteria: `Learners state two accurate facts about ${focus}.` }
    ],
    obc: [
      { time: '10 min', learningPoints: `INTRODUCTION TO ${focus.toUpperCase()}\n\nDefine ${focus} in biology. State why it is important in the study of living things. Give one everyday example.`, teacherActivities: `Teacher revises previous work, writes the definition of ${focus} on the board and gives one local example.`, pupilActivities: `Learners listen, write the definition and give their own examples of ${focus}.`, methods: 'Question and Answer, Teacher Exposition' },
      { time: '25 min', learningPoints: `MAIN CONTENT: ${focus.toUpperCase()}\n\nExplain the structure, function or process involved in ${focus}. Use a labelled diagram. Give at least two examples relevant to Zambia.`, teacherActivities: `Teacher explains ${focus} using a labelled diagram, defines each key term and gives two Zambian examples.`, pupilActivities: `Learners draw and label the diagram, copy the notes and ask questions about ${focus}.`, methods: 'Teacher Exposition, Demonstration, Question and Answer' },
      { time: '20 min', learningPoints: `GUIDED PRACTICE ON ${focus.toUpperCase()}\n\nLearners match terms to descriptions and complete a short table on ${focus}.`, teacherActivities: `Teacher gives a matching exercise on ${focus}, moves around the class and corrects misconceptions.`, pupilActivities: `Learners complete the matching exercise and table in pairs and present their answers.`, methods: 'Group Work, Discussion, Guided Practice' },
      { time: '15 min', learningPoints: `INDIVIDUAL ASSESSMENT ON ${focus.toUpperCase()}\n\nShort questions: define, label, explain and apply ${focus}.`, teacherActivities: `Teacher sets individual questions on ${focus}, supervises and marks selected responses.`, pupilActivities: `Learners answer the questions individually and correct their work after marking.`, methods: 'Individual Work, Assessment' },
      { time: '10 min', learningPoints: `SUMMARY: ${focus.toUpperCase()}\n\nRecap the definition, key features and one application of ${focus}.`, teacherActivities: `Teacher summarises the main points of ${focus}, asks an exit question and gives remedial work where needed.`, pupilActivities: `Learners state the key points of ${focus} and answer the exit question.`, methods: 'Review, Question and Answer' }
    ]
  };
}

// ---------- MATHEMATICS ----------
function mathTemplate(focus, topic) {
  const t = String(topic || '').toLowerCase();
  const isSets = /set/.test(t);
  const isQuadratic = /quadratic/.test(t);
  const isMensuration = /mensuration|area|perimeter|volume/.test(t);
  const isTrig = /trig|sine|cosine|tangent/.test(t);
  const isCalculus = /calculus|differenti/.test(t);
  const isLinear = /linear equation|simultaneous/.test(t);

  let introduction, development, activity1, activity2, exercise, conclusion;
  let obcIntro, obcMain, obcGuided, obcAssess, obcSummary;

  if (isSets) {
    introduction = `Ask: "What is a set?" Explain that a set is a collection of well-defined objects and introduce the notation { }.`;
    development = `Define elements, universal set and empty set. Show A = {1,2,3,4,5} and introduce ∈ and ∉. Introduce finite, infinite, equal and equivalent sets.`;
    activity1 = `Give groups different objects (bottle tops, stones, counters). Ask them to form a set, name it and list its elements.`;
    activity2 = `Groups present their sets. Consolidate on the board: set notation, ∈, ∉ and the five types of sets with one example each.`;
    exercise = `Individual exercise: 1) Write the set of even numbers less than 12. 2) Write the set of factors of 18. 3) State whether A={2,4,6,8}, B={all prime numbers}, C={ } are finite, infinite or empty. 4) If A={1,2,3,4,5}, state whether 5 ∈ A and 7 ∈ A.`;
    conclusion = `Summarise: definition of a set, notation { }, ∈ and ∉, and the five types of sets.`;
    obcIntro = `Define a set. Introduce the notation { } and elements.`;
    obcMain = `Explain elements, universal set, empty set, ∈ and ∉. List finite, infinite, equal and equivalent sets with examples: A={1,2,3,4,5}, B={all prime numbers}, C={ }.`;
    obcGuided = `Learners complete a table classifying sets as finite, infinite or empty and mark membership using ∈ and ∉.`;
    obcAssess = `1) Write the set of vowels. 2) Write the set of factors of 12. 3) Classify A={2,4,6,8}, B={prime numbers}, C={ }. 4) State whether 6 ∈ {2,4,6,8}.`;
    obcSummary = `Recap set definition, notation, ∈, ∉ and the five types of sets.`;
  } else if (isQuadratic) {
    introduction = `Ask: "What is a quadratic equation?" Write the general form ax² + bx + c = 0 with a ≠ 0.`;
    development = `Explain the three methods: factorisation, completing the square and the quadratic formula x = [-b ± √(b²-4ac)] / 2a. Introduce the discriminant b²-4ac.`;
    activity1 = `Work through x² + 5x + 6 = 0 by factorisation, showing (x+2)(x+3) = 0 so x = -2 or x = -3.`;
    activity2 = `Work through x² - 5x + 6 = 0 by the quadratic formula and by completing the square. Compare answers.`;
    exercise = `Solve: 1) x² + 7x + 12 = 0  2) x² - 4x - 12 = 0  3) 2x² + 5x - 3 = 0  4) x² - 6x + 9 = 0  5) 2x² - 7x + 3 = 0.`;
    conclusion = `Summarise the three methods and the role of the discriminant.`;
    obcIntro = `Define a quadratic equation and write ax² + bx + c = 0.`;
    obcMain = `Explain factorisation, completing the square and the quadratic formula. Work x² + 5x + 6 = 0 and x² - 5x + 6 = 0 fully on the board.`;
    obcGuided = `Learners solve x² + 7x + 12 = 0 and 2x² + 5x - 3 = 0 in pairs.`;
    obcAssess = `Solve individually: 1) x² - 4x - 12 = 0  2) x² - 6x + 9 = 0  3) 2x² - 7x + 3 = 0.`;
    obcSummary = `Recap the three methods and the discriminant.`;
  } else if (isMensuration) {
    introduction = `Ask: "What is mensuration?" Explain that it deals with length, area and volume. Introduce the unit cm².`;
    development = `Write the area formulae: Rectangle A=L×W, Square A=L², Triangle A=½bh, Circle A=πr², Parallelogram A=bh, Trapezium A=½(a+b)h.`;
    activity1 = `Measure the classroom door and a rectangular exercise book. Calculate their areas using A=L×W.`;
    activity2 = `Work through: rectangle L=12cm, W=8cm → 96cm²; triangle base=10cm, height=6cm → 30cm²; circle r=7cm → 154cm²; trapezium a=8, b=12, h=6 → 60cm².`;
    exercise = `Find the area of: 1) rectangle 15cm × 10cm  2) triangle base 14cm height 8cm  3) circle r=10cm (π=3.142)  4) parallelogram base 12cm height 7cm  5) trapezium a=8cm b=12cm h=6cm.`;
    conclusion = `Summarise the formulae and stress that area is always in square units.`;
    obcIntro = `Define mensuration and area. State the units.`;
    obcMain = `Write all area formulae and work the four examples: rectangle, triangle, circle, trapezium.`;
    obcGuided = `Learners measure rectangular objects in class and calculate their areas.`;
    obcAssess = `1) rectangle 15cm×10cm  2) triangle b=14cm h=8cm  3) circle r=10cm  4) parallelogram b=12cm h=7cm  5) trapezium a=8 b=12 h=6.`;
    obcSummary = `Recap all area formulae and the correct units.`;
  } else if (isTrig) {
    introduction = `Introduce trigonometry as the study of the relationships between the sides and angles of a right-angled triangle.`;
    development = `Define sin θ = opp/hyp, cos θ = adj/hyp, tan θ = opp/adj. Introduce SOH CAH TOA. Give special angles: sin 30°=½, cos 30°=√3/2, tan 45°=1.`;
    activity1 = `Draw a right triangle with opp=3, adj=4, hyp=5. Work sin θ = 3/5, cos θ = 4/5, tan θ = 3/4.`;
    activity2 = `Work through: opp=5, adj=12 → sin=5/13, cos=12/13, tan=5/12. If sin θ = ½, find θ = 30°.`;
    exercise = `1) opp=5, adj=12: find sin, cos, tan.  2) If cos θ = ¾, find sin θ and tan θ.  3) If tan θ = 1, find θ.`;
    conclusion = `Summarise SOH CAH TOA and the special-angle values.`;
    obcIntro = `Define the three trigonometric ratios.`;
    obcMain = `Explain SOH CAH TOA with a labelled right triangle. Work the 3-4-5 example and the special angles.`;
    obcGuided = `Learners label triangles and compute ratios for opp=5, adj=12.`;
    obcAssess = `1) opp=5, adj=12: sin, cos, tan.  2) cos θ=¾: find sin θ, tan θ.  3) tan θ=1: find θ.`;
    obcSummary = `Recap SOH CAH TOA and the special angles.`;
  } else if (isCalculus) {
    introduction = `Define differentiation as the process of finding the rate of change or gradient of a curve.`;
    development = `Introduce dy/dx and the power rule d/dx(xⁿ)=nxⁿ⁻¹. Show d/dx(x²)=2x, d/dx(3x⁴)=12x³, d/dx(c)=0 and the sum rule.`;
    activity1 = `Differentiate y=x³ → 3x²; y=5x⁴ → 20x³; y=x²+3x → 2x+3.`;
    activity2 = `Find the gradient of y=x² at x=3 → dy/dx=2x, at x=3 gradient=6.`;
    exercise = `Differentiate: 1) y=x⁵  2) y=3x³  3) y=2x⁴+5x²  4) y=x³-4x+7.  5) Find the gradient of y=x³ at x=2.`;
    conclusion = `Summarise the power rule and its use for finding gradients.`;
    obcIntro = `Define differentiation.`;
    obcMain = `State and apply the power rule. Work y=x³, y=5x⁴, y=x²+3x.`;
    obcGuided = `Learners differentiate y=x⁵, y=3x³, y=2x⁴+5x².`;
    obcAssess = `1) y=x⁵  2) y=3x³  3) y=2x⁴+5x²  4) y=x³-4x+7  5) gradient of y=x³ at x=2.`;
    obcSummary = `Recap the power rule and gradient interpretation.`;
  } else if (isLinear) {
    introduction = `Define a linear equation as an equation of the form ax + b = c.`;
    development = `Show how to solve 2x + 3 = 11 by subtracting 3 then dividing by 2 → x = 4. Introduce simultaneous equations by elimination.`;
    activity1 = `Solve 3x - 5 = 10 → x = 5. Solve 2x + 3y = 12 and x - y = 1 by elimination.`;
    activity2 = `Substitution method on x + y = 7 and x - y = 3 → x = 5, y = 2.`;
    exercise = `Solve: 1) 4x + 7 = 23  2) 5x - 3 = 22  3) x + y = 10 and x - y = 4  4) 2x + y = 11 and x - y = 1.`;
    conclusion = `Summarise the balance method and the two simultaneous-equation methods.`;
    obcIntro = `Define linear and simultaneous equations.`;
    obcMain = `Solve 2x+3=11 and 3x-5=10. Introduce elimination with 2x+3y=12, x-y=1.`;
    obcGuided = `Learners solve x+y=7 and x-y=3 by both elimination and substitution.`;
    obcAssess = `1) 4x+7=23  2) 5x-3=22  3) x+y=10, x-y=4  4) 2x+y=11, x-y=1.`;
    obcSummary = `Recap linear and simultaneous solving methods.`;
  } else {
    introduction = `Introduce ${focus} and link it to previous work in mathematics.`;
    development = `Explain the key terms, rules and formulae for ${focus}, using a worked example.`;
    activity1 = `Work through two examples of ${focus} on the board, showing every step.`;
    activity2 = `Give learners a short practice set on ${focus} and check their answers.`;
    exercise = `1) Answer a definition question on ${focus}. 2) Apply the rule to a numeric example. 3) Solve a short application problem on ${focus}.`;
    conclusion = `Summarise the main rule and one application of ${focus}.`;
    obcIntro = `Define ${focus}.`;
    obcMain = `Explain the rule, formula or method for ${focus} with a worked example.`;
    obcGuided = `Learners work through a practice set on ${focus}.`;
    obcAssess = `Short questions testing knowledge and application of ${focus}.`;
    obcSummary = `Recap the key rule of ${focus}.`;
  }

  return {
    cbc: [
      { stage: 'INTRODUCTION', time: '5 min', teacherRole: introduction, learnerRole: `Answer the opening questions and give examples related to ${focus}.`, assessmentCriteria: `Learners respond correctly to the opening question.` },
      { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: development, learnerRole: `Listen, copy the definitions and formulae, and ask questions about ${focus}.`, assessmentCriteria: `Learners copy the formulae and definitions accurately.` },
      { stage: 'ACTIVITY 1', time: '15 min', teacherRole: activity1, learnerRole: `Work in groups on the worked example and record every step for ${focus}.`, assessmentCriteria: `Groups show correct working for ${focus}.` },
      { stage: 'ACTIVITY 2', time: '15 min', teacherRole: activity2, learnerRole: `Present their working, compare answers and correct mistakes about ${focus}.`, assessmentCriteria: `Correct final answers and working are shown for ${focus}.` },
      { stage: 'EXERCISE', time: '25 min', teacherRole: `Individual exercise on ${focus}. ${exercise}`, learnerRole: `Complete the exercise individually and correct answers after feedback.`, assessmentCriteria: `Learners achieve correct answers on most questions in ${focus}.` },
      { stage: 'CONCLUSION', time: '10 min', teacherRole: conclusion, learnerRole: `State the key rule or formula for ${focus} and answer the exit question.`, assessmentCriteria: `Learners state the correct rule or formula for ${focus}.` }
    ],
    obc: [
      { time: '10 min', learningPoints: `INTRODUCTION\n\n${obcIntro}`, teacherActivities: `Teacher revises the previous lesson and introduces ${focus} with a simple example.`, pupilActivities: `Learners listen, write the definition and answer oral questions.`, methods: 'Question and Answer, Teacher Exposition' },
      { time: '25 min', learningPoints: `MAIN CONTENT\n\n${obcMain}`, teacherActivities: `Teacher explains the method for ${focus} step by step and works one full example on the board.`, pupilActivities: `Learners copy the working for ${focus} and ask questions.`, methods: 'Teacher Exposition, Demonstration' },
      { time: '20 min', learningPoints: `GUIDED PRACTICE\n\n${obcGuided}`, teacherActivities: `Teacher guides learners through practice questions on ${focus} and corrects misconceptions.`, pupilActivities: `Learners work through the practice questions in pairs and present answers.`, methods: 'Group Work, Guided Practice' },
      { time: '15 min', learningPoints: `INDIVIDUAL ASSESSMENT\n\n${obcAssess}`, teacherActivities: `Teacher sets individual questions on ${focus}, supervises and marks selected responses.`, pupilActivities: `Learners answer individually and correct their work after marking.`, methods: 'Individual Work, Assessment' },
      { time: '10 min', learningPoints: `SUMMARY\n\n${obcSummary}`, teacherActivities: `Teacher summarises ${focus}, asks an exit question and gives remedial work.`, pupilActivities: `Learners state the main points of ${focus} and answer the exit question.`, methods: 'Review, Question and Answer' }
    ]
  };
}

// ---------- CHEMISTRY ----------
function chemistryTemplate(focus, topic) {
  const t = String(topic || '').toLowerCase();
  const isAtomic = /atomic|atom/.test(t);
  const isBonding = /bond/.test(t);
  const isAcids = /acid|base|alkali/.test(t);
  const isPeriodic = /periodic/.test(t);
  const isMoles = /mole|stoichiometry/.test(t);

  let intro, dev, a1, a2, ex, concl, oi, om, og, oa, os;

  if (isAtomic) {
    intro = `Ask: "What is an atom?" Introduce the atom as the smallest particle of an element.`;
    dev = `Describe the structure of the atom: proton (+), neutron (0) in the nucleus; electron (-) in shells. Introduce atomic number Z and mass number A.`;
    a1 = `Draw a sodium atom (Z=11, A=23): 11 protons, 12 neutrons, 11 electrons in shells 2,8,1.`;
    a2 = `Draw chlorine (Z=17, A=35): 17p, 18n, 17e in shells 2,8,7. Compare with sodium.`;
    ex = `1) State the charge and location of proton, neutron and electron. 2) Draw the atom of oxygen (Z=8, A=16). 3) Define atomic number and mass number. 4) How many neutrons in carbon-14?`;
    concl = `Summarise the structure of the atom and the meaning of Z and A.`;
    oi = `Introduce the atom and its three sub-atomic particles.`;
    om = `Explain protons, neutrons, electrons, atomic number and mass number. Draw the atom of sodium.`;
    og = `Learners draw oxygen and carbon atoms and label the particles.`;
    oa = `1) proton/neutron/electron location and charge. 2) Draw oxygen (Z=8, A=16). 3) Define Z and A.`;
    os = `Recap atomic structure and Z/A.`;
  } else if (isBonding) {
    intro = `Define a chemical bond as the force that holds atoms together.`;
    dev = `Explain ionic bonding (transfer of electrons, metal + non-metal e.g. NaCl) and covalent bonding (sharing electrons, non-metal + non-metal e.g. H₂O).`;
    a1 = `Draw the ionic bonding in sodium chloride: Na loses 1e, Cl gains 1e.`;
    a2 = `Draw the covalent bonding in water and in methane (CH₄).`;
    ex = `1) Define ionic and covalent bonding. 2) Describe the bonding in MgO. 3) Draw the dot-and-cross diagram of CH₄. 4) Why does NaCl conduct electricity when molten?`;
    concl = `Summarise the difference between ionic and covalent bonding.`;
    oi = `Define a chemical bond.`;
    om = `Explain ionic and covalent bonding with NaCl and H₂O.`;
    og = `Learners draw dot-and-cross diagrams for NaCl and CH₄.`;
    oa = `1) Define ionic and covalent. 2) Describe MgO bonding. 3) Draw CH₄.`;
    os = `Recap ionic vs covalent bonding.`;
  } else if (isAcids) {
    intro = `Ask: "What is an acid?" Define acid as a proton donor and base as a proton acceptor.`;
    dev = `Explain pH scale (1-14), reactions of acids with metals, bases and carbonates. Introduce indicators: litmus, methyl orange, phenolphthalein.`;
    a1 = `Show the reaction HCl + NaOH → NaCl + H₂O. Show Mg + 2HCl → MgCl₂ + H₂.`;
    a2 = `Show CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂. Test CO₂ with limewater.`;
    ex = `1) Define acid and base. 2) Write the equation for HCl + KOH. 3) What gas is produced when Mg reacts with HCl? 4) Predict the pH of a solution that turns litmus red.`;
    concl = `Summarise the reactions of acids and the pH scale.`;
    oi = `Define acid, base and indicator.`;
    om = `Explain pH and the reactions of acids with metals, bases and carbonates.`;
    og = `Learners write balanced equations for HCl + KOH and CaCO₃ + HCl.`;
    oa = `1) Define acid/base. 2) HCl + KOH equation. 3) Gas from Mg + HCl.`;
    os = `Recap acid reactions and pH.`;
  } else if (isPeriodic) {
    intro = `Introduce the periodic table as the arrangement of elements by atomic number.`;
    dev = `Explain groups (vertical, similar properties) and periods (horizontal). Describe Group 1 (alkali metals), Group 7 (halogens) and Group 0 (noble gases).`;
    a1 = `Locate Na, Cl, He, K on the periodic table. Identify group and period.`;
    a2 = `Compare the reactivity of Li, Na, K down Group 1; and F, Cl, Br, I down Group 7.`;
    ex = `1) State the group and period of Na, Cl and He. 2) Why does reactivity increase down Group 1? 3) Why are noble gases unreactive?`;
    concl = `Summarise groups, periods and the trends in Groups 1, 7 and 0.`;
    oi = `Introduce the periodic table.`;
    om = `Explain groups, periods, Group 1, Group 7 and Group 0 with examples.`;
    og = `Learners locate Na, Cl, He and K and state their group/period.`;
    oa = `1) Group/period of Na, Cl, He. 2) Trend in Group 1. 3) Why noble gases are inert.`;
    os = `Recap periodic table organisation and trends.`;
  } else if (isMoles) {
    intro = `Introduce the mole as the amount of substance containing 6.02 × 10²³ particles (Avogadro's number).`;
    dev = `Define molar mass, moles = mass ÷ molar mass, and concentration = moles ÷ volume (dm³). Show the mole ratio method for equations.`;
    a1 = `Calculate the number of moles in 36 g of water (M=18 g/mol) → 2 mol.`;
    a2 = `In 2H₂ + O₂ → 2H₂O, 4 mol H₂ reacts with 2 mol O₂ to give 4 mol H₂O.`;
    ex = `1) Define a mole. 2) Calculate moles in 44 g CO₂ (M=44). 3) In 2H₂ + O₂ → 2H₂O, how many moles of O₂ react with 4 mol H₂? 4) What mass of NaOH (M=40) is needed to make 0.5 mol?`;
    concl = `Summarise the mole formula, molar mass and mole ratios.`;
    oi = `Define the mole and Avogadro's number.`;
    om = `Explain moles = mass ÷ M and mole ratios with a worked example.`;
    og = `Learners calculate moles of CO₂ in 44 g and mass of 0.5 mol NaOH.`;
    oa = `1) Define a mole. 2) 44 g CO₂ → moles. 3) 4 mol H₂ → O₂ required. 4) Mass of 0.5 mol NaOH.`;
    os = `Recap moles, molar mass and mole ratios.`;
  } else {
    intro = `Introduce ${focus} in chemistry.`;
    dev = `Explain the key concepts, definitions and one worked example related to ${focus}.`;
    a1 = `Work through a lab-based or written example on ${focus}.`;
    a2 = `Learners practise a short problem on ${focus}.`;
    ex = `1) Define a key term in ${focus}. 2) Apply the concept to a numeric example. 3) Answer a short application question on ${focus}.`;
    concl = `Summarise the main concept of ${focus}.`;
    oi = `Define the key terms of ${focus}.`;
    om = `Explain the concept of ${focus} with a worked example.`;
    og = `Learners practise a problem on ${focus}.`;
    oa = `Short questions on knowledge and application of ${focus}.`;
    os = `Recap the main concept of ${focus}.`;
  }

  return {
    cbc: [
      { stage: 'INTRODUCTION', time: '5 min', teacherRole: intro, learnerRole: `Answer the opening questions and give examples related to ${focus}.`, assessmentCriteria: `Learners give accurate initial responses about ${focus}.` },
      { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: dev, learnerRole: `Listen, take notes and copy formulae or diagrams for ${focus}.`, assessmentCriteria: `Notes contain the key definitions and formulae for ${focus}.` },
      { stage: 'ACTIVITY 1', time: '15 min', teacherRole: a1, learnerRole: `Work through the example or calculation on ${focus} in groups.`, assessmentCriteria: `Correct working is recorded for ${focus}.` },
      { stage: 'ACTIVITY 2', time: '15 min', teacherRole: a2, learnerRole: `Present working, compare answers and correct errors on ${focus}.`, assessmentCriteria: `Correct final answers are shown for ${focus}.` },
      { stage: 'EXERCISE', time: '25 min', teacherRole: `Individual exercise: ${ex}`, learnerRole: `Complete the exercise individually and correct after feedback.`, assessmentCriteria: `Most answers on ${focus} are correct.` },
      { stage: 'CONCLUSION', time: '10 min', teacherRole: concl, learnerRole: `State the main concept of ${focus} and answer the exit question.`, assessmentCriteria: `Learners state the main concept of ${focus} correctly.` }
    ],
    obc: [
      { time: '10 min', learningPoints: `INTRODUCTION\n\n${oi}`, teacherActivities: `Teacher revises previous work and introduces ${focus}.`, pupilActivities: `Learners listen, write the definition and answer oral questions.`, methods: 'Question and Answer, Teacher Exposition' },
      { time: '25 min', learningPoints: `MAIN CONTENT\n\n${om}`, teacherActivities: `Teacher explains ${focus} with diagrams, equations and a worked example.`, pupilActivities: `Learners copy the notes, equations and diagrams for ${focus}.`, methods: 'Teacher Exposition, Demonstration' },
      { time: '20 min', learningPoints: `GUIDED PRACTICE\n\n${og}`, teacherActivities: `Teacher guides learners through practice problems on ${focus}.`, pupilActivities: `Learners work through the problems in pairs and present answers.`, methods: 'Group Work, Guided Practice' },
      { time: '15 min', learningPoints: `INDIVIDUAL ASSESSMENT\n\n${oa}`, teacherActivities: `Teacher sets individual questions on ${focus} and marks selected responses.`, pupilActivities: `Learners answer individually and correct errors.`, methods: 'Individual Work, Assessment' },
      { time: '10 min', learningPoints: `SUMMARY\n\n${os}`, teacherActivities: `Teacher summarises ${focus} and gives an exit question.`, pupilActivities: `Learners state the main points of ${focus}.`, methods: 'Review, Question and Answer' }
    ]
  };
}

// ---------- PHYSICS ----------
function physicsTemplate(focus, topic) {
  const t = String(topic || '').toLowerCase();
  const isMotion = /motion|mechanic|kinematic|force|dynamics/.test(t);
  const isElectric = /electric|circuit|current|magnet/.test(t);
  const isWaves = /wave|sound|light/.test(t);
  const isOptics = /optic|lens|mirror|refract|reflect/.test(t);
  const isThermal = /thermo|heat|temperature/.test(t);

  let intro, dev, a1, a2, ex, concl, oi, om, og, oa, os;

  if (isMotion) {
    intro = `Define motion and state the difference between distance and displacement.`;
    dev = `Define speed = distance ÷ time, velocity = displacement ÷ time, acceleration = (v-u) ÷ t. State Newton's three laws of motion.`;
    a1 = `Calculate: a car travels 120 m in 6 s. Find its speed (20 m/s). Find its acceleration if it reaches 20 m/s from rest in 5 s (4 m/s²).`;
    a2 = `Apply F = ma: a force of 20 N acts on a mass of 4 kg → a = 5 m/s².`;
    ex = `1) Define speed, velocity, acceleration. 2) A car travels 150 m in 5 s: find its speed. 3) A 3 kg object accelerates at 4 m/s²: find the force. 4) State Newton's second law.`;
    concl = `Summarise the motion equations and Newton's laws.`;
    oi = `Define motion, speed and acceleration.`;
    om = `State speed, velocity, acceleration and Newton's laws with worked examples.`;
    og = `Learners calculate speed, acceleration and force from given values.`;
    oa = `1) Define speed, velocity, acceleration. 2) Speed: 150 m in 5 s. 3) Force: 3 kg at 4 m/s².`;
    os = `Recap motion equations and Newton's laws.`;
  } else if (isElectric) {
    intro = `Define electric current as the flow of charge. State the unit (ampere).`;
    dev = `Explain Ohm's law V = IR. Define power P = VI. Describe series and parallel circuits.`;
    a1 = `In a circuit with V = 12 V and R = 4 Ω, find I = V/R = 3 A.`;
    a2 = `In a series circuit of R₁=2Ω and R₂=3Ω with 10 V, total R=5Ω, I=2A, V₁=4V, V₂=6V.`;
    ex = `1) Define current and state its unit. 2) State Ohm's law. 3) V=6V, R=2Ω: find I. 4) P when V=12V and I=2A. 5) Compare series and parallel resistance.`;
    concl = `Summarise Ohm's law, power formula and series/parallel rules.`;
    oi = `Define current, voltage and resistance.`;
    om = `Explain Ohm's law V=IR and power P=VI with worked examples.`;
    og = `Learners calculate I, V and R in series and parallel circuits.`;
    oa = `1) Define current. 2) State Ohm's law. 3) V=6V, R=2Ω: I. 4) P when V=12V, I=2A.`;
    os = `Recap Ohm's law, power and circuit rules.`;
  } else if (isWaves) {
    intro = `Define a wave and distinguish transverse from longitudinal waves.`;
    dev = `Define amplitude, wavelength, frequency and period. State v = fλ. Describe sound as a longitudinal wave and light as a transverse wave.`;
    a1 = `A wave has f = 50 Hz and λ = 2 m. Find v = 100 m/s.`;
    a2 = `A sound wave travels at 340 m/s with f = 170 Hz. Find λ = 2 m.`;
    ex = `1) Define wave, wavelength and frequency. 2) State v = fλ. 3) f=50Hz, λ=2m: find v. 4) Sound at 340 m/s and 170 Hz: find λ. 5) Distinguish transverse from longitudinal.`;
    concl = `Summarise wave quantities and the wave equation.`;
    oi = `Define a wave and its properties.`;
    om = `Explain wavelength, frequency, amplitude and v = fλ.`;
    og = `Learners compute v, f and λ from given values.`;
    oa = `1) Define wavelength and frequency. 2) f=50Hz, λ=2m: v. 3) Sound 340 m/s, 170 Hz: λ.`;
    os = `Recap wave quantities and v = fλ.`;
  } else if (isOptics) {
    intro = `Introduce light as a form of energy that travels in straight lines.`;
    dev = `Explain reflection (angle of incidence = angle of reflection), refraction (bending at a boundary), and the use of lenses and mirrors.`;
    a1 = `Draw a ray diagram for a plane mirror showing angle of incidence = angle of reflection.`;
    a2 = `Draw a convex lens forming a real image and describe the properties of the image.`;
    ex = `1) State the laws of reflection. 2) Define refraction. 3) Draw the ray diagram for a plane mirror. 4) What type of image does a convex lens form when the object is beyond 2F?`;
    concl = `Summarise reflection, refraction and image formation.`;
    oi = `Introduce light and its properties.`;
    om = `Explain reflection, refraction and image formation with ray diagrams.`;
    og = `Learners draw ray diagrams for mirrors and lenses.`;
    oa = `1) Laws of reflection. 2) Define refraction. 3) Ray diagram for plane mirror.`;
    os = `Recap reflection, refraction and lenses.`;
  } else if (isThermal) {
    intro = `Define heat as a form of energy and temperature as a measure of hotness.`;
    dev = `Explain heat transfer by conduction, convection and radiation. Introduce specific heat capacity Q = mcΔT.`;
    a1 = `Calculate Q for 2 kg of water heated from 20°C to 70°C (c=4200 J/kg°C) → Q = 420,000 J.`;
    a2 = `Explain why metals conduct heat better than wood, and why convection currents form in liquids.`;
    ex = `1) Define heat and temperature. 2) State three methods of heat transfer. 3) Calculate Q for 1 kg water heated from 10°C to 60°C. 4) Why does metal feel colder than wood at the same temperature?`;
    concl = `Summarise heat transfer methods and Q = mcΔT.`;
    oi = `Define heat and temperature.`;
    om = `Explain conduction, convection, radiation and Q = mcΔT.`;
    og = `Learners calculate Q for given masses and temperature changes.`;
    oa = `1) Define heat. 2) Three methods of heat transfer. 3) Q for 1 kg water from 10°C to 60°C.`;
    os = `Recap heat transfer and Q = mcΔT.`;
  } else {
    intro = `Introduce ${focus} in physics.`;
    dev = `Explain the key terms, formulae and one worked example related to ${focus}.`;
    a1 = `Work through an example of ${focus} on the board.`;
    a2 = `Learners practise a short problem on ${focus}.`;
    ex = `1) Define the key term in ${focus}. 2) Apply the formula to a numeric example. 3) Answer a short application question.`;
    concl = `Summarise the main concept of ${focus}.`;
    oi = `Define the key terms of ${focus}.`;
    om = `Explain ${focus} with a worked example.`;
    og = `Learners practise a problem on ${focus}.`;
    oa = `Short questions on ${focus}.`;
    os = `Recap the main concept of ${focus}.`;
  }

  return {
    cbc: [
      { stage: 'INTRODUCTION', time: '5 min', teacherRole: intro, learnerRole: `Answer the opening questions and give examples related to ${focus}.`, assessmentCriteria: `Learners give accurate initial responses about ${focus}.` },
      { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: dev, learnerRole: `Listen, take notes and copy formulae or diagrams for ${focus}.`, assessmentCriteria: `Notes contain the key formulae for ${focus}.` },
      { stage: 'ACTIVITY 1', time: '15 min', teacherRole: a1, learnerRole: `Work through the example or calculation on ${focus} in groups.`, assessmentCriteria: `Correct working is recorded for ${focus}.` },
      { stage: 'ACTIVITY 2', time: '15 min', teacherRole: a2, learnerRole: `Present working, compare answers and correct errors on ${focus}.`, assessmentCriteria: `Correct final answers are shown for ${focus}.` },
      { stage: 'EXERCISE', time: '25 min', teacherRole: `Individual exercise: ${ex}`, learnerRole: `Complete the exercise individually and correct after feedback.`, assessmentCriteria: `Most answers on ${focus} are correct.` },
      { stage: 'CONCLUSION', time: '10 min', teacherRole: concl, learnerRole: `State the main concept of ${focus} and answer the exit question.`, assessmentCriteria: `Learners state the main concept of ${focus} correctly.` }
    ],
    obc: [
      { time: '10 min', learningPoints: `INTRODUCTION\n\n${oi}`, teacherActivities: `Teacher revises previous work and introduces ${focus}.`, pupilActivities: `Learners listen, write definitions and answer oral questions.`, methods: 'Question and Answer, Teacher Exposition' },
      { time: '25 min', learningPoints: `MAIN CONTENT\n\n${om}`, teacherActivities: `Teacher explains ${focus} with formulae, diagrams and a worked example.`, pupilActivities: `Learners copy notes and work through the example.`, methods: 'Teacher Exposition, Demonstration' },
      { time: '20 min', learningPoints: `GUIDED PRACTICE\n\n${og}`, teacherActivities: `Teacher guides learners through practice problems on ${focus}.`, pupilActivities: `Learners work in pairs and present their answers.`, methods: 'Group Work, Guided Practice' },
      { time: '15 min', learningPoints: `INDIVIDUAL ASSESSMENT\n\n${oa}`, teacherActivities: `Teacher sets individual questions on ${focus} and marks selected responses.`, pupilActivities: `Learners answer individually and correct errors.`, methods: 'Individual Work, Assessment' },
      { time: '10 min', learningPoints: `SUMMARY\n\n${os}`, teacherActivities: `Teacher summarises ${focus} and gives an exit question.`, pupilActivities: `Learners state the main points of ${focus}.`, methods: 'Review, Question and Answer' }
    ]
  };
}

// ---------- ENGLISH ----------
function englishTemplate(focus, topic) {
  const t = String(topic || '').toLowerCase();
  const isComprehension = /comprehension|passage|reading/.test(t);
  const isComposition = /composition|essay|writing|letter/.test(t);
  const isGrammar = /grammar|tense|noun|verb|adjective|punctuation/.test(t);
  const isLiterature = /literature|poem|play|novel|drama/.test(t);

  let intro, dev, a1, a2, ex, concl, oi, om, og, oa, os;

  if (isComprehension) {
    intro = `Introduce ${focus}: reading a passage with understanding to answer questions.`;
    dev = `Explain the comprehension strategies: skim for gist, scan for detail, identify main idea, infer meaning from context.`;
    a1 = `Read a short passage aloud. Learners identify the main idea and two supporting details.`;
    a2 = `Learners answer literal, inferential and evaluative questions on the passage.`;
    ex = `Read a given passage and answer: 1) What is the main idea? 2) Give two supporting details. 3) What does the word "X" mean in context? 4) What is the writer's purpose?`;
    concl = `Summarise the three levels of comprehension questions.`;
    oi = `Define comprehension and its purpose.`;
    om = `Explain literal, inferential and evaluative comprehension with examples.`;
    og = `Learners read a passage and identify main idea and details.`;
    oa = `Answer literal, inferential and evaluative questions on the passage.`;
    os = `Recap comprehension strategies.`;
  } else if (isComposition) {
    intro = `Introduce ${focus}: writing a well-structured piece on a given topic.`;
    dev = `Explain the structure: introduction, body paragraphs, conclusion. Explain planning and paragraphing.`;
    a1 = `Plan a composition on a topic: brainstorm, outline three body paragraphs with topic sentences.`;
    a2 = `Write the introduction and first body paragraph. Peer-review for paragraph structure.`;
    ex = `Write a composition of 250-300 words on a given topic. Include a clear introduction, three body paragraphs and a conclusion.`;
    concl = `Summarise the composition structure and the importance of paragraphing.`;
    oi = `Define composition and its parts.`;
    om = `Explain introduction, body paragraphs and conclusion with examples.`;
    og = `Learners plan and write one paragraph.`;
    oa = `Write a 250-300 word composition on a given topic.`;
    os = `Recap composition structure.`;
  } else if (isGrammar) {
    intro = `Introduce ${focus} and its role in clear writing.`;
    dev = `Explain the rules of ${focus} with examples and common errors.`;
    a1 = `Underline examples of ${focus} in given sentences and correct errors.`;
    a2 = `Learners write five original sentences demonstrating ${focus}.`;
    ex = `1) Define ${focus}. 2) Identify and correct five sentences with errors in ${focus}. 3) Write three original sentences using ${focus}.`;
    concl = `Summarise the rules of ${focus} and the common errors to avoid.`;
    oi = `Define ${focus}.`;
    om = `Explain the rules of ${focus} with examples.`;
    og = `Learners identify and correct errors in ${focus}.`;
    oa = `Short grammar exercise on ${focus}.`;
    os = `Recap rules of ${focus}.`;
  } else if (isLiterature) {
    intro = `Introduce ${focus}: the study of a literary text (poem, play or novel).`;
    dev = `Explain the elements of literature: plot, character, setting, theme, style. Introduce figurative language.`;
    a1 = `Read a short poem or extract. Identify the theme and one figure of speech.`;
    a2 = `Discuss character motivation and theme development in the extract.`;
    ex = `1) Identify the theme of the text. 2) Describe one character. 3) Identify two figures of speech. 4) Explain how the writer creates mood.`;
    concl = `Summarise the elements of literature and the role of figurative language.`;
    oi = `Introduce the literary text and its genre.`;
    om = `Explain plot, character, setting, theme and style.`;
    og = `Learners identify theme and figures of speech in an extract.`;
    oa = `Short questions on theme, character and figures of speech.`;
    os = `Recap literary elements.`;
  } else {
    intro = `Introduce ${focus} in English.`;
    dev = `Explain the key language skill or concept in ${focus} with examples.`;
    a1 = `Work through an example of ${focus} on the board.`;
    a2 = `Learners practise ${focus} in pairs.`;
    ex = `1) Define ${focus}. 2) Give examples of ${focus}. 3) Apply ${focus} in a short written task.`;
    concl = `Summarise the main language skill in ${focus}.`;
    oi = `Introduce ${focus}.`;
    om = `Explain ${focus} with examples.`;
    og = `Learners practise ${focus}.`;
    oa = `Short task on ${focus}.`;
    os = `Recap ${focus}.`;
  }

  return {
    cbc: [
      { stage: 'INTRODUCTION', time: '5 min', teacherRole: intro, learnerRole: `Answer the opening questions and give examples related to ${focus}.`, assessmentCriteria: `Learners respond accurately about ${focus}.` },
      { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: dev, learnerRole: `Listen, take notes and give examples of ${focus}.`, assessmentCriteria: `Notes contain the key rules of ${focus}.` },
      { stage: 'ACTIVITY 1', time: '15 min', teacherRole: a1, learnerRole: `Work in groups on the task on ${focus}.`, assessmentCriteria: `Groups complete the task on ${focus} accurately.` },
      { stage: 'ACTIVITY 2', time: '15 min', teacherRole: a2, learnerRole: `Present their work and correct their errors on ${focus}.`, assessmentCriteria: `Correct work is shown for ${focus}.` },
      { stage: 'EXERCISE', time: '25 min', teacherRole: `Individual exercise: ${ex}`, learnerRole: `Complete the exercise individually and correct after feedback.`, assessmentCriteria: `Most answers on ${focus} are correct.` },
      { stage: 'CONCLUSION', time: '10 min', teacherRole: concl, learnerRole: `State the main point of ${focus} and answer the exit question.`, assessmentCriteria: `Learners state the main point of ${focus}.` }
    ],
    obc: [
      { time: '10 min', learningPoints: `INTRODUCTION\n\n${oi}`, teacherActivities: `Teacher revises previous work and introduces ${focus}.`, pupilActivities: `Learners listen and answer oral questions.`, methods: 'Question and Answer, Teacher Exposition' },
      { time: '25 min', learningPoints: `MAIN CONTENT\n\n${om}`, teacherActivities: `Teacher explains ${focus} with examples.`, pupilActivities: `Learners copy notes and give examples.`, methods: 'Teacher Exposition, Discussion' },
      { time: '20 min', learningPoints: `GUIDED PRACTICE\n\n${og}`, teacherActivities: `Teacher guides learners through practice on ${focus}.`, pupilActivities: `Learners practise ${focus} in pairs.`, methods: 'Group Work, Guided Practice' },
      { time: '15 min', learningPoints: `INDIVIDUAL ASSESSMENT\n\n${oa}`, teacherActivities: `Teacher sets individual questions on ${focus}.`, pupilActivities: `Learners answer individually and correct errors.`, methods: 'Individual Work, Assessment' },
      { time: '10 min', learningPoints: `SUMMARY\n\n${os}`, teacherActivities: `Teacher summarises ${focus} and gives an exit question.`, pupilActivities: `Learners state the main points of ${focus}.`, methods: 'Review, Question and Answer' }
    ]
  };
}

// ---------- GEOGRAPHY ----------
function geographyTemplate(focus, topic) {
  const t = String(topic || '').toLowerCase();
  const isMap = /map|scale|grid|bearing/.test(t);
  const isClimate = /climate|weather|rainfall|temperature/.test(t);
  const isPopulation = /population|census|migration/.test(t);
  const isPhysical = /physical|landform|river|mountain|relief/.test(t);

  let intro, dev, a1, a2, ex, concl, oi, om, og, oa, os;

  if (isMap) {
    intro = `Introduce map reading and its importance in geography.`;
    dev = `Explain map scale (representative fraction and linear scale), grid references (four and six figure), and how to measure straight and curved distances.`;
    a1 = `Using a topographical map, find the four-figure grid reference of a named feature.`;
    a2 = `Measure the straight-line distance between two points using the linear scale.`;
    ex = `1) Define map scale. 2) Give the four-figure grid reference of two features. 3) Measure the distance between two points using the scale. 4) Convert a distance on the map to real distance.`;
    concl = `Summarise map scale, grid references and distance measurement.`;
    oi = `Define a map and map scale.`;
    om = `Explain scale, grid references and distance measurement with examples.`;
    og = `Learners find grid references and measure distances on a map.`;
    oa = `Short exercise on grid references and distance.`;
    os = `Recap map reading skills.`;
  } else if (isClimate) {
    intro = `Introduce climate and the difference between weather and climate.`;
    dev = `Explain the elements of climate (temperature, rainfall, humidity, pressure, wind) and the factors that affect climate in Zambia.`;
    a1 = `Read a climate graph and describe the temperature and rainfall pattern.`;
    a2 = `Compare the climate of two Zambian regions and explain the differences.`;
    ex = `1) Distinguish weather from climate. 2) Describe the climate of Zambia. 3) Identify three factors affecting climate. 4) Interpret a climate graph.`;
    concl = `Summarise climate elements and the factors affecting climate in Zambia.`;
    oi = `Distinguish weather and climate.`;
    om = `Explain the elements of climate and factors affecting it.`;
    og = `Learners interpret a climate graph.`;
    oa = `Short questions on climate elements and factors.`;
    os = `Recap climate and its factors.`;
  } else if (isPopulation) {
    intro = `Introduce population studies and their importance in planning.`;
    dev = `Explain population distribution, density, growth rate, birth rate, death rate and migration (push and pull factors).`;
    a1 = `Calculate population density from given total population and area.`;
    a2 = `Discuss the effects of rapid population growth on resources in Zambia.`;
    ex = `1) Define population density. 2) Calculate density from given figures. 3) State three push and three pull factors. 4) Explain two effects of rapid population growth.`;
    concl = `Summarise population concepts and their importance.`;
    oi = `Define population and population density.`;
    om = `Explain distribution, density, growth and migration.`;
    og = `Learners calculate population density and discuss migration.`;
    oa = `Short questions on population concepts.`;
    os = `Recap population concepts.`;
  } else if (isPhysical) {
    intro = `Introduce physical geography and landforms.`;
    dev = `Explain the formation of rivers, valleys, mountains and plains. Describe the water cycle.`;
    a1 = `Label a diagram of a river's course from source to mouth.`;
    a2 = `Describe the formation of a V-shaped valley and a waterfall.`;
    ex = `1) Define a river. 2) Label the stages of a river. 3) Describe how a waterfall forms. 4) Explain the importance of rivers in Zambia.`;
    concl = `Summarise the main landforms and the water cycle.`;
    oi = `Introduce physical geography.`;
    om = `Explain the formation of rivers, valleys and mountains.`;
    og = `Learners label a river diagram.`;
    oa = `Short questions on landforms.`;
    os = `Recap physical geography.`;
  } else {
    intro = `Introduce ${focus} in geography.`;
    dev = `Explain the key concepts of ${focus} with local Zambian examples.`;
    a1 = `Work through a map or data exercise on ${focus}.`;
    a2 = `Discuss the importance of ${focus} in Zambia.`;
    ex = `1) Define ${focus}. 2) Give examples of ${focus} in Zambia. 3) Explain the importance of ${focus}.`;
    concl = `Summarise ${focus}.`;
    oi = `Introduce ${focus}.`;
    om = `Explain ${focus} with examples.`;
    og = `Learners practise an exercise on ${focus}.`;
    oa = `Short questions on ${focus}.`;
    os = `Recap ${focus}.`;
  }

  return {
    cbc: [
      { stage: 'INTRODUCTION', time: '5 min', teacherRole: intro, learnerRole: `Answer the opening questions and give examples related to ${focus}.`, assessmentCriteria: `Learners respond accurately about ${focus}.` },
      { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: dev, learnerRole: `Listen, take notes and copy diagrams for ${focus}.`, assessmentCriteria: `Notes contain the key concepts of ${focus}.` },
      { stage: 'ACTIVITY 1', time: '15 min', teacherRole: a1, learnerRole: `Work in groups on the exercise on ${focus}.`, assessmentCriteria: `Groups complete the exercise accurately.` },
      { stage: 'ACTIVITY 2', time: '15 min', teacherRole: a2, learnerRole: `Present their work and correct errors on ${focus}.`, assessmentCriteria: `Correct work is shown for ${focus}.` },
      { stage: 'EXERCISE', time: '25 min', teacherRole: `Individual exercise: ${ex}`, learnerRole: `Complete the exercise individually and correct after feedback.`, assessmentCriteria: `Most answers on ${focus} are correct.` },
      { stage: 'CONCLUSION', time: '10 min', teacherRole: concl, learnerRole: `State the main point of ${focus} and answer the exit question.`, assessmentCriteria: `Learners state the main point of ${focus}.` }
    ],
    obc: [
      { time: '10 min', learningPoints: `INTRODUCTION\n\n${oi}`, teacherActivities: `Teacher revises previous work and introduces ${focus}.`, pupilActivities: `Learners listen and answer oral questions.`, methods: 'Question and Answer, Teacher Exposition' },
      { time: '25 min', learningPoints: `MAIN CONTENT\n\n${om}`, teacherActivities: `Teacher explains ${focus} with maps and diagrams.`, pupilActivities: `Learners copy notes and diagrams.`, methods: 'Teacher Exposition, Demonstration' },
      { time: '20 min', learningPoints: `GUIDED PRACTICE\n\n${og}`, teacherActivities: `Teacher guides learners through an exercise on ${focus}.`, pupilActivities: `Learners work in pairs on the exercise.`, methods: 'Group Work, Guided Practice' },
      { time: '15 min', learningPoints: `INDIVIDUAL ASSESSMENT\n\n${oa}`, teacherActivities: `Teacher sets individual questions on ${focus}.`, pupilActivities: `Learners answer individually and correct errors.`, methods: 'Individual Work, Assessment' },
      { time: '10 min', learningPoints: `SUMMARY\n\n${os}`, teacherActivities: `Teacher summarises ${focus} and gives an exit question.`, pupilActivities: `Learners state the main points of ${focus}.`, methods: 'Review, Question and Answer' }
    ]
  };
}

// ---------- HISTORY ----------
function historyTemplate(focus, topic) {
  const t = String(topic || '').toLowerCase();
  const isZambian = /zambia|zambian|bsacus|nyendaelo|kachindami/.test(t);
  const isAfrican = /africa|colonial|independence|apartheid/.test(t);
  const isWorld = /world war|wwi|wwii|french revolution/.test(t);

  let intro, dev, a1, a2, ex, concl, oi, om, og, oa, os;

  if (isZambian) {
    intro = `Introduce ${focus} in Zambian history.`;
    dev = `Explain the origins, key events and significance of ${focus} in Zambia's development.`;
    a1 = `Read a short extract about ${focus} and identify the main events.`;
    a2 = `Discuss the causes and effects of ${focus} on Zambian society.`;
    ex = `1) State the main events of ${focus}. 2) Give two causes. 3) Explain two effects on Zambia. 4) Why is ${focus} important today?`;
    concl = `Summarise the significance of ${focus} in Zambian history.`;
    oi = `Introduce ${focus}.`;
    om = `Explain the causes and effects of ${focus} in Zambia.`;
    og = `Learners order key events of ${focus} on a timeline.`;
    oa = `Short questions on the causes and effects of ${focus}.`;
    os = `Recap ${focus}.`;
  } else if (isAfrican) {
    intro = `Introduce ${focus} in African history.`;
    dev = `Explain the causes and consequences of ${focus} in Africa.`;
    a1 = `Read an extract and identify the main causes of ${focus}.`;
    a2 = `Discuss the effects of ${focus} on African societies.`;
    ex = `1) State two causes of ${focus}. 2) Describe two effects. 3) Explain the importance of ${focus} in African history.`;
    concl = `Summarise the causes and effects of ${focus}.`;
    oi = `Introduce ${focus}.`;
    om = `Explain the causes and effects of ${focus}.`;
    og = `Learners create a timeline of ${focus}.`;
    oa = `Short questions on ${focus}.`;
    os = `Recap ${focus}.`;
  } else if (isWorld) {
    intro = `Introduce ${focus} in world history.`;
    dev = `Explain the causes, key events and consequences of ${focus}.`;
    a1 = `Read an extract and identify the main causes of ${focus}.`;
    a2 = `Discuss the consequences of ${focus} on world order.`;
    ex = `1) State two causes of ${focus}. 2) Describe two consequences. 3) Explain the significance of ${focus}.`;
    concl = `Summarise the causes and consequences of ${focus}.`;
    oi = `Introduce ${focus}.`;
    om = `Explain the causes and consequences of ${focus}.`;
    og = `Learners create a timeline of ${focus}.`;
    oa = `Short questions on ${focus}.`;
    os = `Recap ${focus}.`;
  } else {
    intro = `Introduce ${focus} in history.`;
    dev = `Explain the causes and consequences of ${focus}.`;
    a1 = `Read an extract and identify key events of ${focus}.`;
    a2 = `Discuss the significance of ${focus}.`;
    ex = `1) State the main events of ${focus}. 2) Give two causes. 3) Explain two effects.`;
    concl = `Summarise ${focus}.`;
    oi = `Introduce ${focus}.`;
    om = `Explain ${focus}.`;
    og = `Learners make a timeline of ${focus}.`;
    oa = `Short questions on ${focus}.`;
    os = `Recap ${focus}.`;
  }

  return {
    cbc: [
      { stage: 'INTRODUCTION', time: '5 min', teacherRole: intro, learnerRole: `Answer the opening questions and give examples related to ${focus}.`, assessmentCriteria: `Learners respond accurately about ${focus}.` },
      { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: dev, learnerRole: `Listen, take notes and identify key events of ${focus}.`, assessmentCriteria: `Notes contain the key events of ${focus}.` },
      { stage: 'ACTIVITY 1', time: '15 min', teacherRole: a1, learnerRole: `Work in groups on the extract or timeline on ${focus}.`, assessmentCriteria: `Groups complete the activity accurately.` },
      { stage: 'ACTIVITY 2', time: '15 min', teacherRole: a2, learnerRole: `Present their findings and correct errors on ${focus}.`, assessmentCriteria: `Correct findings are shown for ${focus}.` },
      { stage: 'EXERCISE', time: '25 min', teacherRole: `Individual exercise: ${ex}`, learnerRole: `Complete the exercise individually and correct after feedback.`, assessmentCriteria: `Most answers on ${focus} are correct.` },
      { stage: 'CONCLUSION', time: '10 min', teacherRole: concl, learnerRole: `State the main point of ${focus} and answer the exit question.`, assessmentCriteria: `Learners state the main point of ${focus}.` }
    ],
    obc: [
      { time: '10 min', learningPoints: `INTRODUCTION\n\n${oi}`, teacherActivities: `Teacher revises previous work and introduces ${focus}.`, pupilActivities: `Learners listen and answer oral questions.`, methods: 'Question and Answer, Teacher Exposition' },
      { time: '25 min', learningPoints: `MAIN CONTENT\n\n${om}`, teacherActivities: `Teacher explains ${focus} with a timeline and sources.`, pupilActivities: `Learners copy notes and timelines.`, methods: 'Teacher Exposition, Discussion' },
      { time: '20 min', learningPoints: `GUIDED PRACTICE\n\n${og}`, teacherActivities: `Teacher guides learners through a source-based exercise on ${focus}.`, pupilActivities: `Learners work in pairs on the exercise.`, methods: 'Group Work, Guided Practice' },
      { time: '15 min', learningPoints: `INDIVIDUAL ASSESSMENT\n\n${oa}`, teacherActivities: `Teacher sets individual questions on ${focus}.`, pupilActivities: `Learners answer individually and correct errors.`, methods: 'Individual Work, Assessment' },
      { time: '10 min', learningPoints: `SUMMARY\n\n${os}`, teacherActivities: `Teacher summarises ${focus} and gives an exit question.`, pupilActivities: `Learners state the main points of ${focus}.`, methods: 'Review, Question and Answer' }
    ]
  };
}

// ---------- CIVIC EDUCATION ----------
function civicTemplate(focus, topic) {
  const t = String(topic || '').toLowerCase();
  const isConstitution = /constitution|bill of rights/.test(t);
  const isHumanRights = /human right|rights|freedom/.test(t);
  const isDemocracy = /democracy|election|vote/.test(t);
  const isGovernance = /governance|government|local government|parliament/.test(t);

  let intro, dev, a1, a2, ex, concl, oi, om, og, oa, os;

  if (isConstitution) {
    intro = `Introduce the constitution as the supreme law of Zambia.`;
    dev = `Explain the structure of the Zambian constitution, its key features and the Bill of Rights. Discuss the process of amendment.`;
    a1 = `Read a short extract from the Bill of Rights and identify three rights.`;
    a2 = `Discuss why the constitution is supreme and how it protects citizens.`;
    ex = `1) Define the constitution. 2) State three rights in the Bill of Rights. 3) Explain why the constitution is supreme. 4) Describe one method of constitutional amendment.`;
    concl = `Summarise the role of the constitution and the Bill of Rights.`;
    oi = `Define the constitution.`;
    om = `Explain the structure of the Zambian constitution, the Bill of Rights and amendment.`;
    og = `Learners identify rights from the Bill of Rights and discuss their importance.`;
    oa = `Short questions on the constitution and rights.`;
    os = `Recap the constitution and the Bill of Rights.`;
  } else if (isHumanRights) {
    intro = `Introduce human rights and their universal nature.`;
    dev = `Explain the three generations of human rights (civil/political, socio-economic, collective) and the role of the Human Rights Commission in Zambia.`;
    a1 = `Classify a list of rights into the three generations.`;
    a2 = `Discuss a case where a right is violated and how the victim can seek redress.`;
    ex = `1) Define human rights. 2) Give two examples of each generation. 3) Explain the role of the Human Rights Commission. 4) Describe one way rights can be protected.`;
    concl = `Summarise human rights and their protection in Zambia.`;
    oi = `Define human rights.`;
    om = `Explain the three generations and the role of the Human Rights Commission.`;
    og = `Learners classify rights and discuss protection mechanisms.`;
    oa = `Short questions on human rights.`;
    os = `Recap human rights and protection.`;
  } else if (isDemocracy) {
    intro = `Introduce democracy as a system of government by the people.`;
    dev = `Explain the features of democracy: free elections, rule of law, multiparty system, respect for human rights. Describe the electoral process in Zambia.`;
    a1 = `Discuss the qualities of a free and fair election.`;
    a2 = `Role-play a short mock election, then discuss what made it democratic or not.`;
    ex = `1) Define democracy. 2) State four features of democracy. 3) Describe the steps in the Zambian electoral process. 4) Explain why free elections matter.`;
    concl = `Summarise the features of democracy and the electoral process.`;
    oi = `Define democracy.`;
    om = `Explain the features of democracy and the electoral process.`;
    og = `Learners discuss what makes an election free and fair.`;
    oa = `Short questions on democracy and elections.`;
    os = `Recap democracy and elections.`;
  } else if (isGovernance) {
    intro = `Introduce governance and the three arms of government.`;
    dev = `Explain the executive, legislature and judiciary, and the role of local government in Zambia.`;
    a1 = `Match each arm of government to its functions.`;
    a2 = `Discuss how the three arms check each other.`;
    ex = `1) Define governance. 2) State the three arms of government and their functions. 3) Explain two roles of local government. 4) Describe how the judiciary checks the executive.`;
    concl = `Summarise the three arms and the importance of checks and balances.`;
    oi = `Define governance.`;
    om = `Explain the three arms and local government.`;
    og = `Learners match each arm to its functions.`;
    oa = `Short questions on the arms of government.`;
    os = `Recap the arms of government.`;
  } else {
    intro = `Introduce ${focus} in civic education.`;
    dev = `Explain the key concepts of ${focus} with Zambian examples.`;
    a1 = `Discuss the importance of ${focus} in a democracy.`;
    a2 = `Learners give examples of ${focus} in their community.`;
    ex = `1) Define ${focus}. 2) Give two examples. 3) Explain the importance of ${focus}.`;
    concl = `Summarise ${focus}.`;
    oi = `Introduce ${focus}.`;
    om = `Explain ${focus} with examples.`;
    og = `Learners discuss examples of ${focus}.`;
    oa = `Short questions on ${focus}.`;
    os = `Recap ${focus}.`;
  }

  return {
    cbc: [
      { stage: 'INTRODUCTION', time: '5 min', teacherRole: intro, learnerRole: `Answer the opening questions and give examples related to ${focus}.`, assessmentCriteria: `Learners respond accurately about ${focus}.` },
      { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: dev, learnerRole: `Listen, take notes and give examples of ${focus}.`, assessmentCriteria: `Notes contain the key concepts of ${focus}.` },
      { stage: 'ACTIVITY 1', time: '15 min', teacherRole: a1, learnerRole: `Work in groups on the task on ${focus}.`, assessmentCriteria: `Groups complete the task accurately.` },
      { stage: 'ACTIVITY 2', time: '15 min', teacherRole: a2, learnerRole: `Present their work and correct errors on ${focus}.`, assessmentCriteria: `Correct work is shown for ${focus}.` },
      { stage: 'EXERCISE', time: '25 min', teacherRole: `Individual exercise: ${ex}`, learnerRole: `Complete the exercise individually and correct after feedback.`, assessmentCriteria: `Most answers on ${focus} are correct.` },
      { stage: 'CONCLUSION', time: '10 min', teacherRole: concl, learnerRole: `State the main point of ${focus} and answer the exit question.`, assessmentCriteria: `Learners state the main point of ${focus}.` }
    ],
    obc: [
      { time: '10 min', learningPoints: `INTRODUCTION\n\n${oi}`, teacherActivities: `Teacher revises previous work and introduces ${focus}.`, pupilActivities: `Learners listen and answer oral questions.`, methods: 'Question and Answer, Teacher Exposition' },
      { time: '25 min', learningPoints: `MAIN CONTENT\n\n${om}`, teacherActivities: `Teacher explains ${focus} with examples.`, pupilActivities: `Learners copy notes and give examples.`, methods: 'Teacher Exposition, Discussion' },
      { time: '20 min', learningPoints: `GUIDED PRACTICE\n\n${og}`, teacherActivities: `Teacher guides learners through a case study on ${focus}.`, pupilActivities: `Learners work in pairs and present answers.`, methods: 'Group Work, Guided Practice' },
      { time: '15 min', learningPoints: `INDIVIDUAL ASSESSMENT\n\n${oa}`, teacherActivities: `Teacher sets individual questions on ${focus}.`, pupilActivities: `Learners answer individually and correct errors.`, methods: 'Individual Work, Assessment' },
      { time: '10 min', learningPoints: `SUMMARY\n\n${os}`, teacherActivities: `Teacher summarises ${focus} and gives an exit question.`, pupilActivities: `Learners state the main points of ${focus}.`, methods: 'Review, Question and Answer' }
    ]
  };
}

// ---------- GENERIC FALLBACK (last resort) ----------
function genericTemplate(focus, subject) {
  return {
    cbc: [
      { stage: 'INTRODUCTION', time: '5 min', teacherRole: `Ask learners what they already know about ${focus}. Write the term on the board and connect responses to the day's work.`, learnerRole: `Answer the opening questions and share prior knowledge about ${focus}.`, assessmentCriteria: `Learners give at least one accurate statement about ${focus}.` },
      { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: `Define ${focus} clearly, give two concrete examples, and explain why it matters in ${subject}.`, learnerRole: `Listen, ask questions and copy the definition and examples of ${focus}.`, assessmentCriteria: `Learners copy the definition and give one example of ${focus}.` },
      { stage: 'ACTIVITY 1', time: '15 min', teacherRole: `Give groups a task or source on ${focus}. Ask them to discuss, identify key points and record their findings.`, learnerRole: `Work in groups on the task about ${focus} and record findings.`, assessmentCriteria: `Groups complete the task and identify at least two key points about ${focus}.` },
      { stage: 'ACTIVITY 2', time: '15 min', teacherRole: `Ask each group to present their findings on ${focus}. Correct mistakes and reinforce the correct terminology.`, learnerRole: `Present their findings and correct their notes.`, assessmentCriteria: `Presentations use correct terms about ${focus}.` },
      { stage: 'EXERCISE', time: '25 min', teacherRole: `Give individual questions on ${focus}: definition, two examples, one explanation and one application question.`, learnerRole: `Answer the questions individually and correct after feedback.`, assessmentCriteria: `Learners answer most questions on ${focus} correctly.` },
      { stage: 'CONCLUSION', time: '10 min', teacherRole: `Summarise the key points of ${focus}, ask an exit question and identify learners needing remedial support.`, learnerRole: `State two key facts about ${focus} and answer the exit question.`, assessmentCriteria: `Learners state two accurate facts about ${focus}.` }
    ],
    obc: [
      { time: '10 min', learningPoints: `INTRODUCTION TO ${focus.toUpperCase()}\n\nDefine ${focus} and state why it is important in ${subject}.`, teacherActivities: `Teacher revises previous work, writes the definition of ${focus} on the board and gives one example.`, pupilActivities: `Learners listen, write the definition and give their own examples of ${focus}.`, methods: 'Question and Answer, Teacher Exposition' },
      { time: '25 min', learningPoints: `MAIN CONTENT: ${focus.toUpperCase()}\n\nExplain the key concepts, definitions, facts or processes related to ${focus}. Give two examples relevant to ${subject}.`, teacherActivities: `Teacher explains ${focus} in detail and works through one concrete example.`, pupilActivities: `Learners copy the notes and work through the example.`, methods: 'Teacher Exposition, Demonstration' },
      { time: '20 min', learningPoints: `GUIDED PRACTICE ON ${focus.toUpperCase()}\n\nLearners complete a structured task on ${focus}.`, teacherActivities: `Teacher gives a structured task on ${focus}, moves around and corrects misconceptions.`, pupilActivities: `Learners complete the task in pairs and present answers.`, methods: 'Group Work, Guided Practice' },
      { time: '15 min', learningPoints: `INDIVIDUAL ASSESSMENT ON ${focus.toUpperCase()}\n\nShort questions: define, give examples, explain and apply ${focus}.`, teacherActivities: `Teacher sets individual questions on ${focus}, supervises and marks selected responses.`, pupilActivities: `Learners answer individually and correct errors.`, methods: 'Individual Work, Assessment' },
      { time: '10 min', learningPoints: `SUMMARY: ${focus.toUpperCase()}\n\nRecap the definition, key features and one application of ${focus}.`, teacherActivities: `Teacher summarises ${focus}, asks an exit question and gives remedial work where needed.`, pupilActivities: `Learners state the key points of ${focus} and answer the exit question.`, methods: 'Review, Question and Answer' }
    ]
  };
}

// Resolve the correct family template from the subject + topic.
function resolveFallbackTemplate(subject, topic, subtopic) {
  const s = String(subject || '').toLowerCase();
  const focus = String(subtopic || topic || '').trim() || topic;
  const t = String(topic || '').toLowerCase();
  const st = String(subtopic || '').toLowerCase();
  const key = `${t} ${st}`;

  if (/biology/.test(s)) {
    if (/sense organ|eye|ear|skin|nose|tongue|disorder/.test(key)) {
      // Sense organs template (use biology generic with eye/ear focus)
      return biologyTemplate(focus);
    }
    return biologyTemplate(focus);
  }
  if (/mathematics|maths|math/.test(s)) return mathTemplate(focus, topic);
  if (/chemistry/.test(s)) return chemistryTemplate(focus, topic);
  if (/physics/.test(s)) return physicsTemplate(focus, topic);
  if (/english|literature/.test(s)) return englishTemplate(focus, topic);
  if (/geography/.test(s)) return geographyTemplate(focus, topic);
  if (/history/.test(s)) return historyTemplate(focus, topic);
  if (/civic/.test(s)) return civicTemplate(focus, topic);
  return genericTemplate(focus, subject);
}

// ============ CBC VERIFIED LESSON PROGRESSION ============
function generateVerifiedCBCProgression(topic, subtopic, subject, grade, cm = {}) {
  const exactTopic = String(topic || cm.topic || '').trim();
  const exactSubtopic = String(subtopic || cm.subTopic || cm.subtopic || '').trim();
  const focus = exactSubtopic || exactTopic;
  const key = `${exactTopic} ${exactSubtopic}`.toLowerCase();
  const knowledge = String(cm.knowledge || '').trim();
  const standard = String(cm.expectedStandard || cm.expectedStandards || '').trim();
  const competence = String(cm.specificCompetence || cm.specificCompetences || '').trim();

  if (String(subject).toLowerCase() === 'biology' && /ecosystem|ecological|biotic|abiotic|food chain|food web/i.test(key)) {
    return [
      { stage: 'INTRODUCTION', time: '5 min', teacherRole: 'Ask learners what living and non-living things they can identify in the school environment. Introduce the lesson on ecosystems and connect responses to the topic.', learnerRole: 'Observe the surroundings, answer questions and mention examples of living and non-living components.', assessmentCriteria: 'Learners correctly identify at least one living and one non-living component.' },
      { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: 'Explain the meaning of an ecosystem and distinguish biotic components from abiotic components using familiar local examples.', learnerRole: 'Listen, ask questions, give examples and record the meanings of ecosystem, biotic and abiotic components.', assessmentCriteria: 'Learners distinguish biotic from abiotic components using correct examples.' },
      { stage: 'ACTIVITY 1', time: '15 min', teacherRole: 'Organise groups to observe the school garden or a local environment. Guide learners to list and classify organisms and physical factors observed.', learnerRole: 'Work in groups to observe, list and classify organisms and physical factors as biotic or abiotic.', assessmentCriteria: 'Learners correctly classify the majority of observed components.' },
      { stage: 'ACTIVITY 2', time: '15 min', teacherRole: 'Guide learners to construct simple food chains and discuss producers, consumers and decomposers and their interdependence.', learnerRole: 'Construct food chains from local examples and identify producers, consumers and decomposers.', assessmentCriteria: 'Learners construct a logical food chain and correctly identify the roles of organisms.' },
      { stage: 'EXERCISE', time: '25 min', teacherRole: 'Give individual questions and a short application task on ecosystem components, interactions and the effect of removing one component. Mark and discuss responses.', learnerRole: 'Complete the questions independently, explain relationships in the ecosystem and correct errors after feedback.', assessmentCriteria: 'Learners accurately answer the questions and explain at least one interaction in an ecosystem.' },
      { stage: 'CONCLUSION', time: '10 min', teacherRole: 'Summarise the meaning of an ecosystem, biotic and abiotic components, food chains and interdependence. Ask brief review questions.', learnerRole: 'State key points, answer review questions and give one example of how organisms depend on their environment.', assessmentCriteria: 'Learners accurately state the key concepts and give a relevant example.' }
    ];
  }

  const contentEvidence = knowledge ? `Use the verified curriculum content as the starting point: ${knowledge.slice(0, 900)}` : `Develop the lesson around ${focus} without introducing unrelated content.`;
  const competenceText = competence || `demonstrate the stated competence in ${focus}`;
  return [
    { stage: 'INTRODUCTION', time: '5 min', teacherRole: `Ask focused questions to activate prior knowledge directly related to ${focus}. Introduce the lesson and link learners' responses to the new learning.`, learnerRole: `Answer questions and share relevant prior knowledge about ${focus}.`, assessmentCriteria: `Learners give relevant responses related to ${focus}.` },
    { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: `Explain the key ideas of ${focus} using appropriate subject-specific examples, diagrams or demonstrations. ${contentEvidence}`, learnerRole: `Listen, observe, ask questions and record the important points about ${focus}.`, assessmentCriteria: `Learners identify the main ideas of ${focus}.` },
    { stage: 'ACTIVITY 1', time: '15 min', teacherRole: `Organise a learner-centred activity in which learners investigate or classify information related to ${focus}. Guide groups and check understanding.`, learnerRole: `Work individually or in groups to investigate, classify, discuss and record findings about ${focus}.`, assessmentCriteria: `Learners complete the activity accurately and participate appropriately.` },
    { stage: 'ACTIVITY 2', time: '15 min', teacherRole: `Provide a second practical, discussion or application activity directly related to ${focus}. Correct misconceptions and encourage learners to justify their answers.`, learnerRole: `Apply the new knowledge to the activity, discuss findings and justify responses.`, assessmentCriteria: `Learners apply the concept correctly and justify their responses.` },
    { stage: 'EXERCISE', time: '25 min', teacherRole: `Set individual questions/tasks aligned to ${competenceText}. Supervise, mark selected responses and provide feedback.`, learnerRole: `Complete the exercise independently and correct errors after feedback.`, assessmentCriteria: standard ? `Learner responses provide evidence towards the expected standard: ${standard.slice(0, 500)}` : `Learners demonstrate the stated competence through accurate responses.` },
    { stage: 'CONCLUSION', time: '10 min', teacherRole: `Summarise the essential learning from ${focus}, ask review questions and identify learners needing remedial support.`, learnerRole: `State the key learning points and answer the review/exit questions.`, assessmentCriteria: `Learners accurately state the key learning and its application.` }
  ];
}

function sanitizeCBCReferenceList(refs, subject, grade, term, curriculumContext) {
  const arr = Array.isArray(refs) ? refs : (refs ? [refs] : []);
  const cleaned = arr.map(v => String(v ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(v => !/not for syllabi|-->\s*term\s*\d|\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{3,4}\s+open\b|\b\d+\s+open\b/i.test(v));
  const official = (() => { try { return getReferenceTitles({ subject, grade, term, context: curriculumContext }); } catch (_) { return []; } })();
  const officialClean = (Array.isArray(official) ? official : []).map(v => String(v ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(v => !/not for syllabi|-->\s*term\s*\d|\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{3,4}\s+open\b|\b\d+\s+open\b/i.test(v));
  return [...new Set([...officialClean, ...cleaned])].slice(0, 5);
}

function repairCBCLessonContent(aiContent, topic, subtopic, subject, grade, term, curriculumContext, profile) {
  const cm = curriculumContext?.matched ? (curriculumContext.match || {}) : {};
  const focus = subtopic || cm.subTopic || cm.subtopic || topic;
  const biologyEcology = String(subject).toLowerCase() === 'biology' && /ecology|ecosystem|ecological|biotic|abiotic|food chain|food web/i.test(`${topic} ${subtopic}`);
  if (biologyEcology && !cm.specificCompetence && !cm.specificCompetences) {
    aiContent.specificCompetence = 'Demonstrate understanding of ecological relationships by identifying biotic and abiotic components of an ecosystem and explaining how organisms interact with one another and with their physical environment.';
    aiContent.expectedStandard = 'Learners identify and classify biotic and abiotic components and explain simple ecological relationships using relevant local examples.';
    aiContent.lessonGoal = 'By the end of the lesson, learners will be able to define ecology, identify and classify biotic and abiotic components, and explain simple relationships among organisms and their environment.';
    aiContent.priorKnowledge = 'Learners should be able to identify common living organisms and non-living things in their surroundings and describe simple relationships between organisms and their environment.';
  }

  aiContent.subtopic = subtopic || cm.subTopic || cm.subtopic || aiContent.subtopic || '';
  aiContent.specificCompetence = cm.specificCompetence || cm.specificCompetences || aiContent.specificCompetence ||
    `Demonstrate understanding of ${focus} through appropriate ${subject} activities.`;
  aiContent.expectedStandard = cm.expectedStandard || cm.expectedStandards || aiContent.expectedStandard ||
    `Learners demonstrate the stated competence in ${focus}.`;

  if (Array.isArray(cm.competences) && cm.competences.length) {
    aiContent.generalCompetences = cm.competences;
  } else if (!Array.isArray(aiContent.generalCompetences) || !aiContent.generalCompetences.length) {
    aiContent.generalCompetences = profile.competences;
  }

  if (!cm.specificCompetence && !cm.specificCompetences && !biologyEcology) {
    aiContent.specificCompetence = `Demonstrate understanding of ${focus} by identifying key concepts, explaining relevant subject-specific relationships, and applying the knowledge in a structured task.`;
  }

  if (!/math|account|commerce|physics|chemistry/i.test(subject)) {
    const bad = /accuracy in computing|solve (a|the) .*problem|formulae|quadratic|trigonometry|calculus/i;
    if (bad.test(String(aiContent.rationale || ''))) {
      aiContent.rationale = `This lesson develops learners' understanding of ${focus} within ${subject}, with emphasis on accurate subject-specific reasoning and real-life relevance.`;
    }
    if (biologyEcology) {
      aiContent.rationale = 'Ecology helps learners understand relationships between living organisms and their environment. The lesson uses familiar local examples to develop awareness of biodiversity, environmental conservation and responsible use of natural resources.';
      aiContent.learningOutcomes = [
        'Define ecology and explain the meaning of an ecosystem',
        'Identify and classify biotic and abiotic components in a local environment',
        'Explain simple interactions among organisms and between organisms and their physical environment',
        'Construct or interpret a simple food chain using local examples'
      ];
      aiContent.learnersEvaluation = [
        'Define ecology and an ecosystem',
        'Classify given examples as biotic or abiotic',
        'Explain one relationship between organisms and their environment',
        'Construct a simple food chain and identify the producer and consumers'
      ];
    } else {
      aiContent.learningOutcomes = [
        `Define and identify the key concepts related to ${focus}`,
        `Explain the main relationships, processes or features involved in ${focus}`,
        `Apply knowledge of ${focus} to complete a structured ${subject} task`,
        `Demonstrate the stated competence through accurate responses and participation in the lesson`
      ];
      aiContent.learnersEvaluation = [
        `Define or identify the key concept(s) of ${focus}`,
        `Explain the main idea, relationship or process involved in ${focus}`,
        `Complete an application task based on ${focus}`,
        `Give evidence that demonstrates the stated competence`
      ];
    }
  } else {
    aiContent.learningOutcomes = [
      `Define and identify the key concepts related to ${focus}`,
      `Explain the relevant ${subject} method, rule, process or relationship in ${focus}`,
      `Apply the relevant ${subject} method or concept to ${focus} in a structured task`,
      `Demonstrate the stated competence through accurate working or responses`
    ];
  }

  if (!biologyEcology) {
    aiContent.lessonGoal = cm.specificCompetence || cm.specificCompetences
      ? `By the end of the lesson, learners will be able to ${String(cm.specificCompetence || cm.specificCompetences).replace(/[.]$/, '')}.`
      : `By the end of the lesson, learners will be able to identify the key concepts of ${focus}, explain the main ideas or relationships, and apply the knowledge in a structured ${subject} task.`;
    aiContent.priorKnowledge = `Learners should have prerequisite knowledge directly related to ${focus}.`;
  }
  aiContent.teacherEvaluation = `Teacher reflection: record evidence of learner achievement of the specific competence and expected standard; identify learners needing remediation and learners requiring extension; record what should be improved in the next lesson.`;
  aiContent.lessonEvaluation = `Evaluate learner evidence against the specific competence and expected standard for ${focus}. Record strengths, misconceptions and follow-up action.`;

  const officialRefs = sanitizeCBCReferenceList([], subject, grade, term, curriculumContext);
  if (officialRefs.length) aiContent.references = officialRefs;
  else if (cm.reference) aiContent.references = [cm.reference];
  else if (cm.cdcResourceTitle) aiContent.references = [`${cm.cdcResourceTitle} — CDC Digital Library`];
  else {
    const refs = Array.isArray(aiContent.references) ? aiContent.references : [];
    aiContent.references = refs.filter(r => !/not for syllabi|teacher-provided curriculum materials/i.test(String(r)));
    if (!aiContent.references.length) {
      aiContent.references = [`Ministry of Education — ${subject} Curriculum`, `${subject} Learner's Book / Teacher's Guide`];
    }
  }

  const lp = Array.isArray(aiContent.lessonProgression) ? aiContent.lessonProgression : [];
  const lpText = lp.map(x => `${x?.teacherRole || ''} ${x?.learnerRole || ''} ${x?.assessmentCriteria || ''}`).join(' ');
  const genericCBC = /appropriate classroom task|appropriate examples|key ideas of .* using appropriate|investigate or classify information related to|apply the new knowledge to the activity/i.test(lpText);
  if (lp.length < 6 || genericCBC) {
    aiContent.lessonProgression = generateVerifiedCBCProgression(topic, subtopic, subject, grade, cm);
  }
  return aiContent;
}

// ============ CBC LESSON PROMPT ============
function generateCBCPrompt(topic, grade, subject, classSize, user, subtopic, term = '', curriculumContext = null) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;
  const profile = getCBCSubjectProfile(subject);
  const cm = curriculumContext?.matched ? (curriculumContext.match || {}) : {};
  const verifiedCompetences = Array.isArray(cm.competences) ? cm.competences : [];
  const verifiedResources = Array.isArray(cm.resources) ? cm.resources : (Array.isArray(cm.aids) ? cm.aids : []);
  const verifiedMethods = Array.isArray(cm.methods) ? cm.methods : (cm.methods ? [cm.methods] : []);
  const verifiedOutcomes = cm.specificCompetence || cm.specificCompetences || '';
  const verifiedStandard = cm.expectedStandard || cm.expectedStandards || '';
  const verifiedKnowledge = cm.knowledge || '';
  const verifiedSkills = cm.skills || '';
  const lessonProgression = generateVerifiedCBCProgression(topic, subtopic, subject, grade, cm);

  return `
You are an expert Zambian teacher creating a CBC (Competence-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}"${subtopic ? ` and sub-topic "${subtopic}"` : ''}.
Term: ${term || 'not supplied'}.

SUBJECT-SPECIFIC CBC PROFILE:
Subject family: ${profile.family}
Recommended learning environment: ${profile.environment}
Recommended methods: ${profile.methods.join(', ')}
Subject-specific activity guidance: ${profile.activityGuidance}

CURRICULUM SOURCE CONTROL:
${formatContext(curriculumContext)}

CURRICULUM PRIORITY RULES:
1. A verified curriculum match is authoritative. Preserve its exact topic, sub-topic, specific competence, expected standard, competences, knowledge, skills, methods and resources whenever those fields are supplied.
2. Do not replace an official specific competence or expected standard with generic wording.
3. Do not invent official curriculum codes, page numbers, module titles, textbook titles, quotations or references.
4. Build activities directly from the selected topic/sub-topic and verified curriculum content. The activities must be recognisably appropriate for ${subject}; never copy activities from another subject.
5. Materials must be appropriate to ${subject} and this exact topic.
6. If a curriculum field is unavailable, create a pedagogically appropriate value using the subject profile.
7. Use learner-centred CBC pedagogy.
8. The lesson progression MUST total exactly 80 minutes.
9. DETAIL STANDARD: Write a fully teachable lesson, not a summary.
10. The LESSON DEVELOPMENT must state actual concepts, definitions, rules, principles, processes, examples, calculations, cases, texts, procedures or practical steps appropriate to the exact topic.
11. ACTIVITY 1 and ACTIVITY 2 must contain real learner tasks.
12. The EXERCISE must contain actual topic-specific questions/tasks.
13. Avoid generic filler such as 'explain the key ideas', 'use appropriate examples', 'complete an appropriate task'.
14. Do not copy Biology-style activities into other subjects.
15. Make the lesson detailed enough that another teacher could teach the 80-minute lesson directly.
16. The sub-topic overrides the topic. If a sub-topic is supplied, stay inside it for the entire lesson.

VERIFIED CURRICULUM FIELDS TO PRESERVE WHEN PRESENT:
Specific competence: ${verifiedOutcomes || '[not supplied]'}
Expected standard: ${verifiedStandard || '[not supplied]'}
General competences: ${verifiedCompetences.length ? JSON.stringify(verifiedCompetences) : '[not supplied]'}
Knowledge: ${verifiedKnowledge || '[not supplied]'}
Skills: ${verifiedSkills || '[not supplied]'}
Resources: ${verifiedResources.length ? JSON.stringify(verifiedResources) : '[not supplied]'}
Methods: ${verifiedMethods.length ? JSON.stringify(verifiedMethods) : '[not supplied]'}

TARGET OUTPUT:
Return ONLY valid JSON matching this structure. Do not add markdown or commentary.

{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "subtopic": "${subtopic || ''}",
  "teacherName": "${user.fullName || 'MR/MRS'}",
  "school": "${user.school || ''}",
  "date": "${new Date().toISOString().split('T')[0]}",
  "time": "10:20-11:40",
  "duration": "80 MINUTES",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
  "generalCompetences": ${JSON.stringify(verifiedCompetences.length ? verifiedCompetences : profile.competences)},
  "specificCompetence": ${JSON.stringify(verifiedOutcomes || `Demonstrate understanding of ${subtopic || topic} through structured learning activities`)},
  "lessonGoal": "Write a concise measurable goal derived from the specific competence and exact topic/sub-topic.",
  "rationale": "Explain why this exact topic/sub-topic matters in ${subject}.",
  "priorKnowledge": "State realistic prerequisite knowledge directly related to this topic/sub-topic.",
  "references": ["Use only verified curriculum references available in the source context."],
  "learningEnvironment": ${JSON.stringify(profile.environment)},
  "materials": ${JSON.stringify(verifiedResources.length ? verifiedResources : profile.materials)},
  "expectedStandard": ${JSON.stringify(verifiedStandard || `Learners demonstrate the stated competence for ${subtopic || topic}.`)},
  "lessonProgression": ${JSON.stringify(lessonProgression, null, 2)},
  "homework": "Give a short subject-specific task that reinforces the exact topic/sub-topic.",
  "lessonEvaluation": "Evaluate whether learners achieved the stated specific competence and expected standard.",
  "teacherEvaluation": "Leave a teacher reflection template.",
  "learningOutcomes": ["Use the verified specific competence as the main outcome", "Add 2-3 measurable outcomes directly derived from the exact topic/sub-topic"],
  "learnersEvaluation": ["Give concise learner-check questions/tasks directly assessing the specific competence"],
  "teachingAids": ${JSON.stringify(verifiedResources.length ? verifiedResources : profile.materials)},
  "curriculum": "cbc"
}
`;
}

// ============ OBC LESSON PROMPT ============
function generateOBCPrompt(topic, grade, subject, classSize, user, subtopic, term = '', curriculumContext = null) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;

  const lessonDevelopment = generateVerifiedOBCDevelopment(topic, subtopic, subject, grade);

  return `
You are an expert Zambian teacher creating an OBC (legacy Outcome-Based Education / Objective-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".
Term: ${term || 'not supplied'}.

LEGACY OBC SOURCE CONTROL:
${formatContext(curriculumContext)}

CURRICULUM PRIORITY RULES:
1. If a verified legacy OBC source match is supplied above, it is authoritative.
2. Do NOT use 2024 CBC topic names, competences, expected standards or CBC terminology when OBC is selected.
3. Preserve the verified OBC wording where supplied.
4. Do not invent official OBC codes, page numbers, textbook titles or source claims.
5. If no verified OBC source match exists, generate pedagogically useful legacy OBC content.
6. DETAIL STANDARD: The plan must be fully teachable and content-rich for the exact topic and subtopic.
7. Learning Points must contain actual subject content.
8. Teacher Activities must describe exactly what the teacher does.
9. Pupil Activities must describe exactly what learners do.
10. Include real topic-specific questions/tasks.
11. Use genuine methods for the selected subject.
12. Make the lesson detailed enough that another teacher could teach the 80-minute lesson directly.
13. The sub-topic overrides the topic. If a sub-topic is supplied, stay inside it for the entire lesson.

⚠️ CRITICAL: Return ONLY valid JSON matching this OBC lesson structure.

{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "subtopic": "${subtopic || ''}",
  "teacherName": "${user.fullName || 'MR/MRS'}",
  "school": "${user.school || ''}",
  "date": "${new Date().toISOString().split('T')[0]}",
  "duration": "80 MINUTES",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
  "references": [
    "Progress in ${subject} Grade ${grade}",
    "Teacher's Guide"
  ],
  "teachingAids": [
    "Learners book",
    "Chalk board",
    "Chart",
    "Diagrams"
  ],
  "prerequisiteKnowledge": "Learners have basic knowledge of ${topic} from previous lessons.",
  "lessonIntroduction": "Teacher revises through the previous lesson and introduces the topic.",
  "rationale": "Develop learners knowledge and understanding of ${topic}.",
  "learningOutcomes": [
    "By the end of this lesson, learners should be able to:",
    "Define ${topic}",
    "Explain the concept of ${topic}",
    "Apply knowledge of ${topic}",
    "Explain the importance of ${topic}"
  ],
  "lessonDevelopment": ${JSON.stringify(lessonDevelopment, null, 2)},
  "learnersEvaluation": [
    "Define ${topic} in your own words",
    "Give two examples of ${topic}",
    "Apply your knowledge of ${topic}",
    "Explain the importance of ${topic}"
  ],
  "expectedAnswers": [
    "Correct definition of ${topic}",
    "Two valid examples of ${topic}",
    "Correct solution to the ${topic} problem",
    "Clear explanation of the importance of ${topic}"
  ],
  "lessonConclusion": "Teacher concludes lesson by revising through the lesson with learners.",
  "learnersEvaluationText": "Space for teacher's assessment of learner performance",
  "teacherEvaluation": "Lesson reflection.",
  "curriculum": "obc"
}
`;
}

function generateVerifiedOBCDevelopment(topic, subtopic, subject, grade) {
  const t = String(topic || '').trim();
  const st = String(subtopic || '').trim();
  const key = `${t} ${st}`.toLowerCase();

  // Biology excretion (kept for backward compatibility)
  if (subject.toLowerCase() === 'biology' && (key.includes('excretion') || key.includes('excretory'))) {
    return [
      { time: '10 min', learningPoints: `INTRODUCTION: EXCRETION\n\nExcretion is the removal of metabolic waste products and excess substances from the body. It is different from egestion.`, teacherActivities: 'Teacher revises the previous lesson, defines excretion and displays a chart of the human excretory organs.', pupilActivities: 'Learners answer revision questions, write the definition and identify excretory organs on the chart.', methods: 'Question and Answer, Teacher Exposition, Demonstration' },
      { time: '25 min', learningPoints: `THE EXCRETORY ORGANS AND THEIR PRODUCTS\n\n1. Kidneys — remove urea, excess salts and water in urine.\n2. Lungs — remove carbon dioxide and water vapour.\n3. Skin — sweat glands remove water, salts and small amounts of urea.\n4. Liver — deaminates excess amino acids producing urea and forms bile pigments.`, teacherActivities: 'Teacher explains each excretory organ and its products using labelled diagrams.', pupilActivities: 'Learners draw labelled diagrams, match organs with products and take notes.', methods: 'Teacher Exposition, Demonstration' },
      { time: '20 min', learningPoints: `GUIDED APPLICATION\n\nTable: Excretory organ | Product | How it leaves the body.`, teacherActivities: 'Teacher gives an organ-product matching task and corrects misconceptions.', pupilActivities: 'Learners complete the table, discuss and present one relationship.', methods: 'Group Work, Discussion' },
      { time: '15 min', learningPoints: `INDIVIDUAL PRACTICE AND ASSESSMENT\n\n1. Define excretion.\n2. State four excretory organs and one product each.\n3. Explain the role of the kidneys.\n4. Explain the role of the liver.`, teacherActivities: 'Teacher sets the questions, supervises individual work and marks selected responses.', pupilActivities: 'Learners answer the questions individually and correct errors.', methods: 'Individual Work, Assessment' },
      { time: '10 min', learningPoints: `SUMMARY AND CONCLUSION\n\nExcretion removes metabolic wastes. Major organs: kidneys, lungs, skin, liver.`, teacherActivities: 'Teacher asks learners to state the main organs and products, reinforces key points.', pupilActivities: 'Learners state key points and answer the exit question.', methods: 'Review, Question and Answer' }
    ];
  }

  // Route to the subject-specific template
  const template = resolveFallbackTemplate(subject, topic, subtopic);
  return template.obc;
}

function repairOBCLessonContent(aiContent, topic, subtopic, subject, grade, term, profile = null) {
  const content = aiContent && typeof aiContent === 'object' ? aiContent : {};
  const size = Number(content.classSize) || 40;
  const boys = Number(content.boys) || Math.floor(size / 2);
  const girls = Number(content.girls) || (size - boys);
  const focus = String(subtopic || content.subtopic || '').trim();
  const template = resolveFallbackTemplate(subject, topic, focus);
  const biologyExcretion = subject.toLowerCase() === 'biology' && `${topic} ${focus}`.toLowerCase().includes('excret');

  content.title = topic;
  content.subtopic = focus;
  content.duration = '80 MINUTES';
  content.classSize = size;
  content.boys = boys;
  content.girls = girls;
  content.curriculum = 'obc';

  content.rationale = biologyExcretion
    ? `This lesson develops learners' understanding of excretion, with emphasis on the human excretory organs and the products they remove.`
    : `This lesson develops learners' knowledge and understanding of ${topic}${focus ? `, specifically ${focus}` : ''}.`;

  content.learningOutcomes = biologyExcretion ? [
    'By the end of this lesson, learners should be able to:',
    'Define excretion and distinguish it from egestion.',
    'Identify the major human excretory organs and state the main products removed by each.',
    'Explain the roles of the kidneys, lungs, skin and liver in excretion.',
    'Relate each excretory product to the organ and process through which it leaves the body.'
  ] : [
    'By the end of this lesson, learners should be able to:',
    `Define and explain ${topic}.`,
    `Identify the main concepts, structures or processes related to ${topic}.`,
    `Apply knowledge of ${topic} to structured subject questions.`,
    `Explain the importance or application of ${topic}.`
  ];

  const existingDevelopment = Array.isArray(content.lessonDevelopment) ? content.lessonDevelopment : [];
  const existingText = existingDevelopment.map(x => `${x?.learningPoints || x?.content || ''} ${x?.teacherActivities || x?.teacherActivity || ''} ${x?.pupilActivities || x?.pupilActivity || ''}`).join(' ');
  const genericOBC = /main content of .* using appropriate examples|key points of .* and identify|subject-appropriate activity|relevant subject questions or activities|appropriate OBC teaching methods/i.test(existingText);
  if (existingDevelopment.length < 5 || genericOBC) content.lessonDevelopment = template.obc;
  else content.lessonDevelopment = existingDevelopment;

  content.learnersEvaluation = biologyExcretion ? [
    'Define excretion.',
    'State four human excretory organs and one product removed by each.',
    'Explain how the kidneys contribute to the removal of urea.',
    'Explain the role of the liver in excretion.',
    'Distinguish between excretion and egestion.'
  ] : [
    `Define ${topic} in your own words.`,
    `State or identify two important points about ${topic}.`,
    `Apply your knowledge of ${topic} to a structured subject question.`,
    `Explain the importance or application of ${topic}.`
  ];

  content.expectedAnswers = biologyExcretion ? [
    'Excretion is the removal of metabolic waste products and excess substances from the body.',
    'Kidneys—urea/salts/water; lungs—carbon dioxide/water vapour; skin—water/salts/small amount of urea; liver—bile pigments and urea from excess amino acids.',
    'Urea is carried in the blood to the kidneys, filtered into the nephron and removed in urine.',
    'The liver deaminates excess amino acids to form urea and forms bile pigments.',
    'Excretion removes metabolic wastes; egestion removes undigested food.'
  ] : (content.expectedAnswers || []);

  content.prerequisiteKnowledge = biologyExcretion
    ? 'Learners have prior knowledge of cellular respiration, metabolism and the need to remove waste products.'
    : `Learners have prerequisite knowledge related to ${topic}.`;
  content.lessonIntroduction = biologyExcretion
    ? 'Teacher revises the previous lesson and leads learners to the need to remove metabolic waste products.'
    : `Teacher revises prerequisite knowledge and introduces ${topic}.`;
  content.lessonConclusion = biologyExcretion
    ? 'Teacher summarises the major excretory organs and their products, checks understanding and identifies learners needing remedial support.'
    : `Teacher summarises the key points of ${topic}, checks understanding and identifies learners needing remedial support.`;
  content.teacherEvaluation = 'Lesson reflection: record the number of learners who achieved the intended outcomes, the concepts that caused difficulty, evidence of participation, and remedial or follow-up action.';
  content.learnersEvaluationText = 'Record learner performance from the assessment activities and identify learners requiring further support.';
  content.lessonEvaluation = 'Evaluate learner responses against the stated outcomes and record evidence for remediation or enrichment.';
  return content;
}

// ============ FALLBACK LESSON GENERATORS ============
function generateFallbackCBC(topic, grade, subject, classSize, user, curriculumContext = null) {
  const profile = getCBCSubjectProfile(subject);
  const cm = curriculumContext?.matched ? (curriculumContext.match || {}) : {};
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;

  const subtopic = cm.subTopic || cm.subtopic || '';
  const template = resolveFallbackTemplate(subject, topic, subtopic);

  return {
    title: topic,
    grade: grade,
    subject: subject,
    teacherName: user?.fullName || 'MR/MRS',
    school: user?.school || '',
    province: user?.province || '',
    district: user?.district || '',
    date: new Date().toISOString().split('T')[0],
    time: "10:20-11:40",
    duration: "80 MINUTES",
    classSize: size,
    boys: boys,
    girls: girls,
    subtopic: subtopic,
    generalCompetences: Array.isArray(cm.competences) && cm.competences.length ? cm.competences : profile.competences,
    specificCompetence: cm.specificCompetence || cm.specificCompetences || `Demonstrate understanding of ${subtopic || topic} through structured learning activities`,
    lessonGoal: `By the end of this lesson, learners will be able to demonstrate the stated competence for ${subtopic || topic}.`,
    rationale: `The lesson develops subject-specific understanding and competence in ${subtopic || topic}.`,
    priorKnowledge: `Learners demonstrate prerequisite knowledge related to ${subtopic || topic}.`,
    references: curriculumContext?.matched && curriculumContext.match?.reference ? [curriculumContext.match.reference] : ["No verified official reference is loaded for this selection"],
    learningEnvironment: profile.environment,
    materials: Array.isArray(cm.resources) && cm.resources.length ? cm.resources : profile.materials,
    expectedStandard: cm.expectedStandard || cm.expectedStandards || `Learners demonstrate the stated competence for ${subtopic || topic}.`,
    lessonProgression: template.cbc,
    homework: `Research and list examples of ${subtopic || topic}`,
    lessonEvaluation: "Evaluate whether learners achieved the stated specific competence.",
    teacherEvaluation: "Space for teacher's reflections.",
    learningOutcomes: [`Understand ${subtopic || topic}`, `Apply ${subtopic || topic}`, `Analyze ${subtopic || topic}`],
    learnersEvaluation: [`Define ${subtopic || topic}`, `Give examples of ${subtopic || topic}`, `Explain the importance of ${subtopic || topic}`],
    lessonDevelopment: template.obc,
    teachingAids: Array.isArray(cm.resources) && cm.resources.length ? cm.resources : profile.materials,
    curriculum: 'cbc'
  };
}

function generateFallbackOBC(topic, grade, subject, classSize, user) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;

  const template = resolveFallbackTemplate(subject, topic, '');

  return {
    title: topic,
    grade: grade,
    subject: subject,
    teacherName: user?.fullName || 'MR/MRS',
    school: user?.school || '',
    date: new Date().toISOString().split('T')[0],
    duration: '80 MINUTES',
    classSize: size,
    boys: boys,
    girls: girls,
    subtopic: '',
    references: [
      `Progress in ${subject} Grade ${grade}`,
      "Teacher's Guide"
    ],
    teachingAids: ["Learners book", "Chalk board", "Chart", "Diagrams"],
    rationale: `This lesson develops learners' knowledge and understanding of ${topic} using teacher exposition, demonstration, question and answer, guided practice and individual work.`,
    learningOutcomes: [
      "By the end of this lesson, learners should be able to:",
      `Define ${topic}`,
      `Explain the concept of ${topic}`,
      `Apply ${topic} to structured questions`,
      `Analyze real-world applications of ${topic}`
    ],
    prerequisiteKnowledge: "Learners have ideas about the topic being taught.",
    lessonIntroduction: "Teacher revises through the previous lesson",
    lessonDevelopment: template.obc,
    learnersEvaluation: [
      `Define ${topic} in your own words`,
      `Give two examples of ${topic}`,
      `Apply your knowledge of ${topic} to a structured subject question`,
      `Explain the importance of ${topic}`
    ],
    expectedAnswers: [
      `Correct definition of ${topic}`,
      `Two valid examples of ${topic}`,
      `Correct solution to the ${topic} problem`,
      `Clear explanation of the importance of ${topic}`
    ],
    lessonConclusion: "Teacher concludes lesson by revising through the lesson with learners.",
    learnersEvaluationText: "Space for teacher's assessment of learner performance",
    teacherEvaluation: 'Lesson reflection.',
    curriculum: 'obc'
  };
}

// ============ CBC SCHEME GENERATOR ============
function normaliseSchemeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function schemeTokens(value) {
  const stop = new Set(['the','and','of','in','to','for','on','a','an','with','by','from','use','using','understanding','demonstrate','explain','apply','learners','learner']);
  return new Set(normaliseSchemeText(value).split(/\s+/).filter(t => t.length > 2 && !stop.has(t)));
}

function schemeTextScore(a, b) {
  const aa = schemeTokens(a), bb = schemeTokens(b);
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  for (const t of aa) if (bb.has(t)) common++;
  return common / Math.max(1, Math.min(aa.size, bb.size));
}

function biologySchemeFamily(text) {
  const t = normaliseSchemeText(text);
  if (/cell|microscop|organelle|diffusion|osmosis|mitosis|meiosis|cellular/.test(t)) return 'cellular';
  if (/reproduc|sexual|asexual|fertilis|gamete|embryo|development/.test(t)) return 'continuity';
  if (/response|tropic|taxic|stimulus|coordination|nervous|hormone|excretion|homeostasis|photosynthesis|nutrition|digest|transport/.test(t)) return 'maintenance';
  if (/science|inquiry|branch|organisation|organization|characteristics of living|nature of science/.test(t)) return 'concepts';
  return '';
}

function biologyTopicForFamily(family) {
  return {
    concepts: '1.1.0 Concepts and Methods in Biology',
    cellular: '1.2.0 Principles of Cellular Life',
    maintenance: '1.3.0 Maintenance of the Organism',
    continuity: '1.4.0 Continuity of Life'
  }[family] || '';
}

function repairCBCSchemeAlignment(weeks, options = {}) {
  const {
    sourceRowsDetailed = [], customTopics = {}, customSubtopics = {},
    assessmentWeeksList = [3, 6, 9, 12], subject = ''
  } = options;
  if (!Array.isArray(weeks)) return [];

  const sourceRows = Array.isArray(sourceRowsDetailed) ? sourceRowsDetailed.filter(r => r && (r.topic || r.subTopic || r.subtopic)) : [];
  const subjectIsBiology = /biology/i.test(String(subject));
  const usableSource = sourceRows.filter(r => !/assessment/i.test(String(r.topic || '')));

  return weeks.map((week, index) => {
    const weekNumber = Number(week.week || index + 1);
    if (assessmentWeeksList.includes(weekNumber) || week.isAssessment || week.isRevision) return week;

    const topicObj = Array.isArray(week.topics) && week.topics.length ? week.topics[0] : week;
    const currentTopic = topicObj.topic || week.topic || '';
    const currentSub = topicObj.subtopic || week.subTopic || week.subtopic || '';
    const requestedTopic = customTopics[weekNumber] || customTopics[String(weekNumber)] || '';
    const requestedSub = customSubtopics[weekNumber] || customSubtopics[String(weekNumber)] || '';

    let match = usableSource.find(r => Number(r.week) === weekNumber);
    if (!match && requestedTopic) {
      match = usableSource.find(r => schemeTextScore(r.topic, requestedTopic) >= 0.65);
    }
    if (!match && requestedSub) {
      match = usableSource.find(r => schemeTextScore(r.subTopic || r.subtopic, requestedSub) >= 0.65);
    }
    if (!match && currentTopic) {
      match = usableSource.find(r => schemeTextScore(r.topic, currentTopic) >= 0.75);
    }

    let finalTopic = match?.topic || requestedTopic || currentTopic;
    let finalSubtopic = match?.subTopic || match?.subtopic || requestedSub || currentSub;
    let finalCompetence = match?.specificCompetence || match?.specificCompetences || topicObj.specificCompetence || topicObj.specificCompetences || '';
    let finalActivities = match?.learningActivities || match?.activities || topicObj.learningActivities || topicObj.activities || '';
    let finalStandards = match?.expectedStandard || match?.expectedStandards || topicObj.expectedStandard || topicObj.expectedStandards || '';
    let finalResources = match?.resources || match?.aids || topicObj.resources || topicObj.aids || '';
    let finalStrategies = match?.strategies || match?.methods || topicObj.strategies || topicObj.methods || '';
    let finalReference = match?.reference || match?.references || topicObj.reference || topicObj.references || '';

    if (subjectIsBiology) {
      const family = biologySchemeFamily(`${finalSubtopic} ${finalCompetence} ${finalActivities}`);
      const familyTopic = biologyTopicForFamily(family);
      if (familyTopic) {
        const topicNorm = normaliseSchemeText(finalTopic);
        const familyNorm = normaliseSchemeText(familyTopic);
        const clearlyWrong = (family === 'maintenance' && /cellular life|principles of cellular life/.test(topicNorm)) ||
          (family === 'cellular' && /maintenance of the organism|continuity of life/.test(topicNorm)) ||
          (family === 'continuity' && /cellular life|maintenance of the organism/.test(topicNorm)) ||
          (family === 'concepts' && /cellular life|maintenance of the organism|continuity of life/.test(topicNorm));
        if (clearlyWrong) {
          finalTopic = familyTopic;
          const familyMatch = usableSource.find(r => normaliseSchemeText(r.topic).includes(familyNorm) &&
            schemeTextScore(r.subTopic || r.subtopic, finalSubtopic) >= 0.45);
          if (familyMatch) {
            finalTopic = familyMatch.topic || finalTopic;
            finalSubtopic = familyMatch.subTopic || familyMatch.subtopic || finalSubtopic;
            finalCompetence = familyMatch.specificCompetence || familyMatch.specificCompetences || finalCompetence;
            finalActivities = familyMatch.learningActivities || familyMatch.activities || finalActivities;
            finalStandards = familyMatch.expectedStandard || familyMatch.expectedStandards || finalStandards;
            finalResources = familyMatch.resources || familyMatch.aids || finalResources;
            finalStrategies = familyMatch.strategies || familyMatch.methods || finalStrategies;
            finalReference = familyMatch.reference || familyMatch.references || finalReference;
          }
        }
      }
    }

    if (requestedSub && !match) {
      const coherent = schemeTextScore(finalTopic, requestedSub) >= 0.25 ||
        (subjectIsBiology && biologySchemeFamily(requestedSub) === biologySchemeFamily(finalTopic));
      if (coherent) finalSubtopic = requestedSub;
    }

    const topicRow = {
      topic: finalTopic,
      subtopic: finalSubtopic,
      specificCompetence: finalCompetence,
      learningActivities: finalActivities || (finalTopic ? `Introduction and discussion of ${finalTopic}; Group/individual activities on ${finalSubtopic || finalTopic}` : ''),
      expectedStandards: finalStandards || (finalCompetence ? `Learners demonstrate the competence: ${finalCompetence}.` : ''),
      resources: finalResources,
      strategies: finalStrategies,
      reference: finalReference,
      knowledge: match?.knowledge || topicObj.knowledge || '',
      skills: match?.skills || topicObj.skills || '',
      values: match?.values || topicObj.values || ''
    };

    return {
      ...week,
      week: weekNumber,
      topic: topicRow.topic,
      subTopic: topicRow.subtopic,
      specificCompetences: topicRow.specificCompetence,
      learningActivities: topicRow.learningActivities,
      expectedStandards: topicRow.expectedStandards,
      resources: topicRow.resources,
      strategies: topicRow.strategies,
      reference: topicRow.reference,
      topics: [topicRow]
    };
  });
}

function generateCBCScheme(grade, subject, term, user, customTopics = {}) {
  const weeks = [];
  const totalWeeks = 13;

  const subjectTopics = {
    'Biology': {
      topics: [
        { topic: '1.1.0 Concepts and Methods in Biology', subtopic: '1.1.1 Nature of Science inquiry in Biology', specificCompetence: 'Apply scientific inquiry in carrying out scientific investigations' },
        { topic: '1.1.0 Concepts and Methods in Biology', subtopic: '1.1.2 Branches of Biology', specificCompetence: 'Explore the branches of Biology and their applications' },
        { topic: '1.1.0 Concepts and Methods in Biology', subtopic: '1.1.3 Levels of Biological Organisation', specificCompetence: 'Classify the levels of biological organization from simple to complex' },
        { topic: '1.1.0 Concepts and Methods in Biology', subtopic: '1.1.4 Characteristics of living things', specificCompetence: 'Analyse the characteristics of living things' },
        { topic: '1.2.0 Principles of Cellular Life', subtopic: '1.2.1 Microscopes', specificCompetence: 'Use different types microscopes to examine specimens' },
        { topic: '1.2.0 Principles of Cellular Life', subtopic: '1.2.2 Basic Cell Structure', specificCompetence: 'Explore the basic cell structure' },
        { topic: '1.2.0 Principles of Cellular Life', subtopic: '1.2.3 Types of cell Specialisation', specificCompetence: 'Explore types of cell specialisation' },
        { topic: '1.2.0 Principles of Cellular Life', subtopic: '1.2.4 Cell Classification', specificCompetence: 'Classify cells according to their structure and function' },
        { topic: '1.3.0 Maintenance of the Organism', subtopic: '1.3.1 Nutrition in Man', specificCompetence: 'Classify types of food nutrients' },
        { topic: '1.3.0 Maintenance of the Organism', subtopic: '1.3.2 Sources of Food Nutrients', specificCompetence: 'Identify sources of food nutrients using food packaging labels' },
        { topic: '1.3.0 Maintenance of the Organism', subtopic: '1.3.3 Plant Nutrients', specificCompetence: 'Categorise plant nutrients into macro and micro nutrients' },
        { topic: '1.3.0 Maintenance of the Organism', subtopic: '1.3.4 Nutritional Deficiency Diseases', specificCompetence: 'Recommend appropriate nutrients to address deficiency diseases' },
        { topic: '1.4.0 Continuity of Life', subtopic: '1.4.1 Asexual and Sexual Reproduction', specificCompetence: 'Demonstrate understanding of how living organisms reproduce' },
        { topic: '1.4.0 Continuity of Life', subtopic: '1.4.2 Reproduction and Development in Human Beings', specificCompetence: 'Discuss understanding of reproduction and development in human beings' },
        { topic: '1.4.0 Continuity of Life', subtopic: '1.4.3 Reproduction in Microorganisms', specificCompetence: 'Evaluate the importance of reproduction in viruses, protozoa, bacteria and fungi' }
      ],
      methodOptions: [
        "Group work, Experiments, Field work, Research, Individual work",
        "Experimentation, group work, question and answer, demonstration",
        "Group work, Experiments, Field work, Research, Project work",
        "Demonstration, group work, think, pair and share, question and answer",
        "Role play, group work, question and answer, field work"
      ],
      aidsOptions: [
        "Apparatus, Books, Cell plants, Beakers, Clap stand",
        "Laboratory equipment, models, charts, specimens, microscopes",
        "Charts, diagrams, models, specimens, magnifying glasses",
        "Multi-media, charts, textbooks, real objects, packaging labels",
        "Field trip equipment, specimens, cameras, recording materials"
      ],
      valuesOptions: [
        "Responsibility, teamwork, curiosity, scientific inquiry",
        "Scientific inquiry, honesty, creativity, critical thinking",
        "Respect, cooperation, critical thinking, environmental awareness",
        "Integrity, diligence, innovation, appreciation of nature",
        "Accountability, empathy, resilience, collaboration"
      ],
      skillsOptions: [
        "Critical thinking, analysis, collaboration, observation",
        "Problem solving, research, presentation, scientific writing",
        "Communication, creativity, teamwork, data collection",
        "Leadership, innovation, adaptability, experimentation",
        "Self-study, collaboration, evaluation, reporting"
      ]
    },
    'Chemistry': {
      topics: [
        { topic: '1.1.0 Introduction to Chemistry', subtopic: '1.1.1 Nature of Chemistry', specificCompetence: 'Apply scientific inquiry in chemical investigations' },
        { topic: '1.1.0 Introduction to Chemistry', subtopic: '1.1.2 Laboratory Safety', specificCompetence: 'Demonstrate understanding of laboratory safety rules' },
        { topic: '1.1.0 Introduction to Chemistry', subtopic: '1.1.3 Laboratory Apparatus', specificCompetence: 'Identify and use laboratory apparatus correctly' },
        { topic: '1.2.0 Matter and its Properties', subtopic: '1.2.1 States of Matter', specificCompetence: 'Classify matter according to its states' },
        { topic: '1.2.0 Matter and its Properties', subtopic: '1.2.2 Separating Mixtures', specificCompetence: 'Apply methods of separating mixtures' },
        { topic: '1.3.0 Atomic Structure', subtopic: '1.3.1 Atomic Theory', specificCompetence: 'Explain the structure of an atom' }
      ],
      methodOptions: [
        "Group work, Experiments, Research, Individual work, Demonstration",
        "Experimentation, group work, question and answer, practical work",
        "Group work, Experiments, Research, Project work, Discussion",
        "Demonstration, group work, think, pair and share, problem solving"
      ],
      aidsOptions: [
        "Apparatus, Books, Beakers, Test tubes, Bunsen burner",
        "Laboratory equipment, models, charts, chemicals, safety equipment",
        "Charts, diagrams, models, specimens, periodic table",
        "Multi-media, charts, textbooks, real objects, lab equipment"
      ],
      valuesOptions: [
        "Responsibility, teamwork, curiosity, scientific inquiry",
        "Scientific inquiry, honesty, creativity, critical thinking",
        "Respect, cooperation, critical thinking, safety awareness",
        "Integrity, diligence, innovation, appreciation of chemistry"
      ],
      skillsOptions: [
        "Critical thinking, analysis, collaboration, observation",
        "Problem solving, research, presentation, scientific writing",
        "Communication, creativity, teamwork, data collection",
        "Leadership, innovation, adaptability, experimentation"
      ]
    },
    'Physics': {
      topics: [
        { topic: '1.1.0 Introduction to Physics', subtopic: '1.1.1 Nature of Physics', specificCompetence: 'Apply scientific inquiry in physical investigations' },
        { topic: '1.1.0 Introduction to Physics', subtopic: '1.1.2 Measurement', specificCompetence: 'Demonstrate understanding of measurement and units' },
        { topic: '1.2.0 Mechanics', subtopic: '1.2.1 Motion', specificCompetence: 'Analyse different types of motion' },
        { topic: '1.2.0 Mechanics', subtopic: '1.2.2 Forces', specificCompetence: 'Apply concepts of forces in daily life' }
      ],
      methodOptions: [
        "Group work, Experiments, Field work, Research, Individual work",
        "Experimentation, demonstration, question and answer, practical work",
        "Group work, Experiments, Research, Project work, Discussion",
        "Demonstration, group work, think, pair and share, problem solving"
      ],
      aidsOptions: [
        "Apparatus, Books, Measuring instruments, Equipment",
        "Laboratory equipment, models, charts, measuring tools",
        "Charts, diagrams, models, real objects, calculators",
        "Multi-media, charts, textbooks, specimens, equipment"
      ],
      valuesOptions: [
        "Responsibility, teamwork, curiosity, scientific inquiry",
        "Scientific inquiry, honesty, creativity, critical thinking",
        "Respect, cooperation, critical thinking, precision",
        "Integrity, diligence, innovation, appreciation of physics"
      ],
      skillsOptions: [
        "Critical thinking, analysis, collaboration, observation",
        "Problem solving, research, presentation, measurement skills",
        "Communication, creativity, teamwork, data analysis",
        "Leadership, innovation, adaptability, experimentation"
      ]
    },
    'Mathematics': {
      topics: [
        { topic: '1.1.0 Numbers and Operations', subtopic: '1.1.1 Number Systems', specificCompetence: 'Classify and operate on different number systems' },
        { topic: '1.1.0 Numbers and Operations', subtopic: '1.1.2 Operations on Numbers', specificCompetence: 'Apply operations on numbers accurately' },
        { topic: '1.2.0 Algebra', subtopic: '1.2.1 Algebraic Expressions', specificCompetence: 'Simplify and evaluate algebraic expressions' },
        { topic: '1.2.0 Algebra', subtopic: '1.2.2 Linear Equations', specificCompetence: 'Solve linear equations and inequalities' },
        { topic: '1.3.0 Geometry', subtopic: '1.3.1 Lines and Angles', specificCompetence: 'Apply properties of lines and angles' },
        { topic: '1.3.0 Geometry', subtopic: '1.3.2 Polygons', specificCompetence: 'Calculate perimeter and area of polygons' },
        { topic: '1.4.0 Mensuration', subtopic: '1.4.1 Area and Perimeter', specificCompetence: 'Calculate area and perimeter of plane figures' },
        { topic: '1.4.0 Mensuration', subtopic: '1.4.2 Volume and Capacity', specificCompetence: 'Calculate volume and capacity of solids' }
      ],
      methodOptions: [
        "Group work, Individual work, Question and answer, Practice",
        "Demonstration, group work, problem solving, individual work",
        "Group work, Research, Project work, Discussion",
        "Problem solving, group work, think, pair and share"
      ],
      aidsOptions: [
        "Charts, Models, Geometrical instruments, Textbooks",
        "Charts, diagrams, models, measuring tools, calculators",
        "Multi-media, charts, textbooks, real objects",
        "Geometrical instruments, charts, diagrams, models"
      ],
      valuesOptions: [
        "Accuracy, precision, logical thinking, perseverance",
        "Analytical thinking, creativity, critical thinking",
        "Respect, cooperation, critical thinking, problem solving",
        "Integrity, diligence, innovation, appreciation of mathematics"
      ],
      skillsOptions: [
        "Critical thinking, analysis, problem solving, computation",
        "Problem solving, research, presentation, logical reasoning",
        "Communication, creativity, teamwork, data analysis",
        "Leadership, innovation, adaptability, calculation"
      ]
    }
  };

  const subjectData = subjectTopics[subject] || {
    topics: [
      { topic: `1.1.0 Introduction to ${subject}`, subtopic: `1.1.1 Nature of ${subject}`, specificCompetence: `Apply scientific inquiry in ${subject} investigations` },
      { topic: `1.1.0 Introduction to ${subject}`, subtopic: `1.1.2 Key Concepts in ${subject}`, specificCompetence: `Demonstrate understanding of key concepts in ${subject}` },
      { topic: `1.2.0 Core Topics in ${subject}`, subtopic: `1.2.1 Fundamental Principles`, specificCompetence: `Apply fundamental principles of ${subject}` },
      { topic: `1.2.0 Core Topics in ${subject}`, subtopic: `1.2.2 Practical Applications`, specificCompetence: `Explore practical applications of ${subject}` }
    ],
    methodOptions: [
      "Group work, Experiments, Field work, Research, Individual work",
      "Demonstration, group work, question and answer, practical work",
      "Experimentation, discussion, group work, project work",
      "Research, presentation, practical work, collaboration"
    ],
    aidsOptions: [
      "Apparatus, Books, Charts, Models, Equipment",
      "Laboratory equipment, models, charts, textbooks",
      "Charts, diagrams, models, real objects",
      "Multi-media, charts, textbooks, specimens"
    ],
    valuesOptions: [
      "Responsibility, teamwork, curiosity, scientific inquiry",
      "Scientific inquiry, honesty, creativity, critical thinking",
      "Respect, cooperation, critical thinking, environmental awareness",
      "Integrity, diligence, innovation, appreciation of science"
    ],
    skillsOptions: [
      "Critical thinking, analysis, collaboration, observation",
      "Problem solving, research, presentation, scientific writing",
      "Communication, creativity, teamwork, data collection",
      "Leadership, innovation, adaptability, experimentation"
    ]
  };

  const topicsList = subjectData.topics || [];
  const methodOptions = subjectData.methodOptions || ["Group work, Experiments, Field work, Research, Individual work"];
  const aidsOptions = subjectData.aidsOptions || ["Apparatus, Books, Charts, Models, Equipment"];
  const valuesOptions = subjectData.valuesOptions || ["Responsibility, teamwork, curiosity, scientific inquiry"];
  const skillsOptions = subjectData.skillsOptions || ["Critical thinking, analysis, collaboration, observation"];

  const shuffledTopics = [...topicsList];
  for (let i = shuffledTopics.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledTopics[i], shuffledTopics[j]] = [shuffledTopics[j], shuffledTopics[i]];
  }

  const extendedTopics = [...shuffledTopics];
  while (extendedTopics.length < totalWeeks) {
    extendedTopics.push(...topicsList);
  }

  for (let i = 1; i <= totalWeeks; i++) {
    const weekNumber = i;
    const customTopic = customTopics[weekNumber];
    const isRevision = [1, 5, 9].includes(i);
    const isAssessment = [3, 6, 9, 12].includes(i);

    let weekTopics = [];

    if (isRevision) {
      weekTopics = [{
        topic: 'REVISION WEEK',
        subtopic: 'Revision of covered topics',
        specificCompetence: 'Correct their past misconceptions and consolidate learning',
        methods: 'Class discussion, Question and answer, Group work, Peer teaching',
        aids: 'Test papers, Revision notes, Charts, Summary materials',
        references: 'Previous notes, Marking keys, Teacher\'s guide',
        knowledge: 'Consolidated understanding of topics covered',
        skills: 'Review, recall, synthesis of information',
        values: 'Perseverance, self-improvement, collaboration'
      }];
    } else if (isAssessment) {
      weekTopics = [{
        topic: 'ASSESSMENT WEEK',
        subtopic: 'Assessment and Evaluation',
        specificCompetence: 'Demonstrate understanding of the topics covered through assessment',
        methods: 'Test, Examination, Practical assessment, Quiz',
        aids: 'Examination papers, Answer sheets, Marking scheme',
        references: 'Teacher\'s guide, Marking scheme, Syllabus',
        knowledge: 'Demonstrated understanding of covered topics',
        skills: 'Test-taking, time management, application of knowledge',
        values: 'Honesty, accountability, academic integrity'
      }];
    } else if (customTopic) {
      const topicIndex = (i - 1) % extendedTopics.length;
      const defaultTopic = extendedTopics[topicIndex] || { topic: customTopic, subtopic: '', specificCompetence: '' };
      weekTopics = [{
        topic: defaultTopic.topic || customTopic,
        subtopic: defaultTopic.subtopic || customTopic,
        specificCompetence: defaultTopic.specificCompetence || `By the end of this lesson, learners will be able to understand and apply knowledge of ${customTopic}`,
        methods: methodOptions[i % methodOptions.length],
        aids: aidsOptions[i % aidsOptions.length],
        references: "Teacher-provided curriculum materials",
        knowledge: `Comprehensive knowledge of ${customTopic}`,
        skills: skillsOptions[i % skillsOptions.length],
        values: valuesOptions[i % valuesOptions.length]
      }];
    } else {
      const topicIndex = (i - 1) % extendedTopics.length;
      const topicData = extendedTopics[topicIndex];

      weekTopics = [{
        topic: topicData.topic || `Topic ${i}`,
        subtopic: topicData.subtopic || `Subtopic ${i}`,
        specificCompetence: topicData.specificCompetence || `By the end of this lesson, learners will be able to understand and explain the concepts`,
        methods: methodOptions[i % methodOptions.length],
        aids: aidsOptions[i % aidsOptions.length],
        references: "Teacher-provided curriculum materials",
        knowledge: `Comprehensive knowledge of ${topicData.topic}`,
        skills: skillsOptions[i % skillsOptions.length],
        values: valuesOptions[i % valuesOptions.length]
      }];
    }

    weeks.push({
      week: i,
      topics: weekTopics,
      assessment: isAssessment ? `End of Week ${i} Assessment` : null,
      isRevision: isRevision,
      isAssessment: isAssessment
    });
  }

  return {
    weeks: weeks,
    assessmentWeeks: [3, 6, 9, 12],
    testTopics: [`Mid-term test on ${subject}`, `End of term test on ${subject}`],
    curriculum: 'cbc'
  };
}

function generateOBCScheme(grade, subject, term, user, customTopics = {}) {
  const weeks = [];
  const totalWeeks = 13;

  const subjectTopics = {
    'Biology': [
      'Cell Structure and Function', 'Genetics and Heredity', 'Ecology and Environment',
      'Human Anatomy', 'Plant Physiology', 'Sense Organs and Locomotion',
      'Reproduction', 'Nutrition', 'Transport Systems',
      'Respiration', 'Excretion', 'Nervous System',
      'Endocrine System', 'Immunity and Disease', 'Evolution'
    ],
    'Mathematics': [
      'Algebra and Equations', 'Geometry and Trigonometry', 'Statistics and Probability',
      'Calculus', 'Vectors and Matrices', 'Sets and Logic',
      'Number Theory', 'Graphs and Functions', 'Sequences and Series',
      'Differentiation', 'Integration', 'Complex Numbers',
      'Linear Programming', 'Financial Mathematics', 'Mechanics'
    ],
    'Chemistry': [
      'Atomic Structure', 'Chemical Bonding', 'Organic Chemistry',
      'Acids and Bases', 'Periodic Table', 'Stoichiometry',
      'Thermodynamics', 'Kinetics', 'Electrochemistry',
      'Equilibrium', 'Chemical Reactions', 'States of Matter',
      'Solutions', 'Environmental Chemistry', 'Biochemistry'
    ],
    'Physics': [
      'Mechanics', 'Thermodynamics', 'Waves and Sound',
      'Electricity and Magnetism', 'Optics', 'Nuclear Physics',
      'Kinematics', 'Dynamics', 'Gravitation',
      'Quantum Physics', 'Astrophysics', 'Fluid Mechanics',
      'Relativity', 'Electronics', 'Energy and Power'
    ]
  };

  const topicsList = subjectTopics[subject] || [
    `Introduction to ${subject}`,
    `Basic concepts of ${subject}`,
    `Advanced ${subject} topics`,
    `Practical applications of ${subject}`,
    `Review and assessment of ${subject}`
  ];

  const shuffledTopics = [...topicsList];
  for (let i = shuffledTopics.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledTopics[i], shuffledTopics[j]] = [shuffledTopics[j], shuffledTopics[i]];
  }

  const extendedTopics = [...shuffledTopics];
  while (extendedTopics.length < totalWeeks) {
    extendedTopics.push(...topicsList);
  }

  const methodOptions = [
    "Lecture, discussion, group work, question and answer",
    "Experimentation, group work, question and answer",
    "Demonstration, group work, think, pair and share",
    "Experimentation, discussion, question and answer",
    "Role play, group work, question and answer"
  ];

  const aidsOptions = [
    "Whiteboard, charts, textbooks, diagrams",
    "Laboratory equipment, models, charts",
    "Charts, diagrams, models, specimens",
    "Multi-media, charts, textbooks",
    "Field trips, specimens, cameras"
  ];

  const valuesOptions = [
    "Responsibility, teamwork, curiosity",
    "Scientific inquiry, honesty, creativity",
    "Respect, cooperation, critical thinking",
    "Integrity, diligence, innovation",
    "Accountability, empathy, resilience"
  ];

  const skillsOptions = [
    "Critical thinking, analysis, collaboration",
    "Problem solving, research, presentation",
    "Communication, creativity, teamwork",
    "Leadership, innovation, adaptability",
    "Self-study, collaboration, evaluation"
  ];

  for (let i = 1; i <= totalWeeks; i++) {
    const weekTopics = [];
    const weekNumber = i;
    const customTopic = customTopics[weekNumber];
    const isRevision = [1, 5, 9].includes(i);
    const isAssessment = [3, 6, 9, 12].includes(i);

    if (isRevision) {
      weekTopics.push({
        topic: 'REVISION WEEK',
        specificOutcome: 'Correct their past misconceptions',
        methods: 'Class discussion, Question and answer, Group work',
        aids: 'Test papers, Revision notes',
        references: 'Test papers, Marking keys',
        knowledge: '', skills: '', values: ''
      });
    } else if (isAssessment) {
      weekTopics.push({
        topic: 'ASSESSMENT',
        specificOutcome: 'Demonstrate understanding of the topics covered',
        methods: 'Test, Examination, Practical assessment',
        aids: 'Examination papers, Answer sheets',
        references: 'Teacher\'s guide, Marking scheme',
        knowledge: '', skills: '', values: ''
      });
    } else if (customTopic) {
      weekTopics.push({
        topic: customTopic,
        specificOutcome: `By the end of this lesson, learners will be able to understand and apply knowledge of ${customTopic}`,
        methods: "Lecture, discussion, group work, question and answer",
        aids: "Whiteboard, charts, textbooks, diagrams",
        references: "Teacher-provided curriculum materials",
        knowledge: `Comprehensive knowledge of ${customTopic}`,
        skills: "Critical thinking, analysis, collaboration",
        values: "Responsibility, teamwork, curiosity"
      });
    } else {
      const topicIndex = (i - 1) % extendedTopics.length;
      const topicName = extendedTopics[topicIndex];
      const methodIndex = (i - 1) % methodOptions.length;
      const aidsIndex = (i - 1) % aidsOptions.length;
      const skillsIndex = (i - 1) % skillsOptions.length;
      const valuesIndex = (i - 1) % valuesOptions.length;

      weekTopics.push({
        topic: topicName,
        specificOutcome: `By the end of this lesson, learners will be able to understand and explain ${topicName}`,
        methods: methodOptions[methodIndex],
        aids: aidsOptions[aidsIndex],
        references: "Teacher-provided curriculum materials",
        knowledge: `Comprehensive knowledge of ${topicName}`,
        skills: skillsOptions[skillsIndex],
        values: valuesOptions[valuesIndex]
      });
    }

    weeks.push({
      week: i,
      topics: weekTopics,
      assessment: isAssessment ? `End of Week ${i} Assessment` : null
    });
  }

  return {
    weeks: weeks,
    assessmentWeeks: [3, 6, 9, 12],
    testTopics: [`Mid-term test on ${subject}`, `End of term test on ${subject}`],
    curriculum: 'obc'
  };
}

// ============ AUTH ROUTES ============
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, school, province, district, grades, subjects } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(409).json({ error: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        fullName, email, passwordHash: hashedPassword, school, province, district,
        grades: grades || [], subjects: subjects || [], role: 'FREE', lastActive: new Date(),
      }
    });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    const { passwordHash, ...userWithoutPassword } = user;
    res.status(201).json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
    await prisma.user.update({ where: { id: user.id }, data: { lastActive: new Date() } });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    const { passwordHash, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ============ LESSON GENERATION ROUTE (with quality gate) ============
app.post('/api/lessons/generate', authenticate, async (req, res) => {
  try {
    const { topic, grade, subject, classSize, curriculum, subtopic, term } = req.body;

    if (!topic || !grade || !subject) {
      return res.status(400).json({ error: 'Missing required fields: topic, grade, subject' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role !== 'ADMIN' && user.lessonsUsed >= user.lessonsLimit) {
      return res.status(403).json({
        error: 'Lesson limit reached. Please upgrade your plan to generate more lessons.'
      });
    }

    const curriculumType = curriculum || 'cbc';

    // ---- Curriculum / level validation ----
    const normalizedGrade = String(grade).trim().replace(/\s+/g, ' ');
    const gradeMatch = normalizedGrade.match(/^Grade\s+(\d+)$/i);
    const formMatch = normalizedGrade.match(/^Form\s+(\d+)$/i);
    const gradeNumber = gradeMatch ? Number(gradeMatch[1]) : null;
    const formNumber = formMatch ? Number(formMatch[1]) : null;

    const secondaryCBCSubjects = new Set([
      'Agricultural Science', 'Art and Design', 'Biology', 'Chemistry',
      'Civic Education', 'Commerce', 'Computer Science', 'Design and Technology Studies',
      'English', 'Fashion and Fabrics', 'Food and Nutrition', 'French', 'Geography',
      'History', 'Hospitality Management', 'ICT', 'Literature in English',
      'Mathematics I', 'Mathematics II', 'Musical Arts Education',
      'Physical Education and Sport', 'Physics', 'Religious Education',
      'Travel and Tourism', 'Zambian Languages', 'Principles of Accounts'
    ]);
    const normalizedSubject = String(subject).trim().toLowerCase();
    const isSecondaryCBCSubject = Array.from(secondaryCBCSubjects)
      .some((name) => name.toLowerCase() === normalizedSubject);

    if (curriculumType === 'cbc') {
      const validCBCLevel = isSecondaryCBCSubject
        ? (formNumber !== null && formNumber >= 1 && formNumber <= 4)
        : ((gradeNumber !== null && gradeNumber >= 1 && gradeNumber <= 6) ||
           (formNumber !== null && formNumber >= 1 && formNumber <= 4));
      if (!validCBCLevel) {
        return res.status(400).json({
          error: isSecondaryCBCSubject
            ? `Invalid CBC level for ${subject}. Use Form 1–4 for 2024 CBC secondary subjects.`
            : 'Invalid CBC grade/form. Use Grade 1–6 or Form 1–4 for the 2024 Competence-Based Curriculum.'
        });
      }
    } else {
      const validOBCLevel = (gradeNumber !== null && gradeNumber >= 1 && gradeNumber <= 12) ||
        (formNumber !== null && formNumber >= 1 && formNumber <= 6);
      if (!validOBCLevel) {
        return res.status(400).json({
          error: 'Invalid OBC grade/form. Use Grade 1–12 or Form 1–6.'
        });
      }
    }

    const size = parseInt(classSize) || 40;
    const boys = Math.floor(size / 2) || 18;
    const girls = Math.ceil(size / 2) || 22;

    let aiContent = null;
    let useFallback = false;
    let curriculumContext = null;
    let generationMode = 'deepseek';

    // =========================================================
    // GENERATION + STRICT REPAIR LOOP
    // =========================================================
    try {
      curriculumContext = await getCurriculumContextAsync({
        curriculum: curriculumType, grade, subject, term, topic, subtopic
      });

      const buildInitialMessages = () => {
        const prompt = curriculumType === 'cbc'
          ? generateCBCPrompt(topic, grade, subject, classSize, user, subtopic, term, curriculumContext)
          : generateOBCPrompt(topic, grade, subject, classSize, user, subtopic, term, curriculumContext);

        return [
          {
            role: 'system',
            content: `You are an expert Zambian teacher creating ${curriculumType.toUpperCase()} lesson plans.

The user will provide a topic and requirements for a lesson plan.
Parse the information and output it in valid JSON format.

For CBC: Include a detailed lessonProgression array with stages, times, teacherRole, learnerRole, and assessmentCriteria. Each row must contain actual topic-specific content and a real learner task.
For OBC: Include a detailed lessonDevelopment array with time, learningPoints, teacherActivities, pupilActivities, and methods. Each row must contain actual topic-specific teaching content and real learner tasks.
For BOTH formats: the lesson must be fully teachable, content-rich and specific to the selected subject/topic. Never use generic filler, empty arrays, vague activities, or copied content from another subject.

CURRICULUM ISOLATION:
- CBC means the current 2024 Competence-Based Curriculum.
- OBC means the legacy Outcome-Based/Objective-Based curriculum.
- Never mix CBC source content into an OBC lesson, and never mix OBC source content into a CBC lesson.

CRITICAL: The lessonProgression and lessonDevelopment arrays MUST have content. Do NOT return empty arrays.
Never use filler phrases such as:
"using appropriate examples", "subject-appropriate activity",
"relevant subject questions or activities", "main concepts, terms, processes",
"key ideas of X using appropriate examples", "investigate or classify information related to",
"apply the new knowledge to the activity", "complete an application task",
"apply your knowledge of X to a relevant subject question or activity",
"explain the main idea, relationship or process",
"give evidence that demonstrates the stated competence".

The sub-topic overrides the topic. If a sub-topic is supplied, stay inside it for the entire lesson.

Return ONLY the JSON object, no other text.`
          },
          { role: 'user', content: prompt }
        ];
      };

      console.log(`📝 Generating ${curriculumType.toUpperCase()} lesson with DeepSeek...`);
      aiContent = await generateDeepSeekJSON(buildInitialMessages(), {
        max_tokens: 7000,
        temperature: 0.3
      });

      const fallback = curriculumType === 'cbc'
        ? generateFallbackCBC(topic, grade, subject, classSize, user, curriculumContext)
        : generateFallbackOBC(topic, grade, subject, classSize, user);
      aiContent = { ...fallback, ...aiContent };

      if (curriculumType === 'cbc' && (!aiContent.lessonProgression || aiContent.lessonProgression.length === 0)) {
        console.log('📝 CBC lessonProgression empty — force-populating.');
        aiContent.lessonProgression = generateLessonProgression(topic, subject, grade);
      }
      if (curriculumType === 'obc' && (!aiContent.lessonDevelopment || aiContent.lessonDevelopment.length === 0)) {
        console.log('📝 OBC lessonDevelopment empty — force-populating.');
        aiContent.lessonDevelopment = generateLessonContent(topic, subject, grade);
      }

      if (curriculumType === 'obc') {
        aiContent = repairOBCLessonContent(aiContent, topic, subtopic, subject, grade, term);
      } else {
        aiContent = repairCBCLessonContent(aiContent, topic, subtopic, subject, grade, term, curriculumContext, getCBCSubjectProfile(subject));
      }

      // ---- QUALITY GATE + STRICT REPAIR (DeepSeek path only) ----
      let gate = detectGenericLesson(aiContent, { curriculumType, topic, subtopic });

      if (gate.generic) {
        console.warn(`⚠️ Quality gate rejected lesson: ${gate.reasons.join('; ')}`);
        console.warn('🔁 Sending stricter repair prompt to DeepSeek...');

        let repairSucceeded = false;
        try {
          const repairMessages = [
            {
              role: 'system',
              content: 'You rewrite rejected lesson plans. Output ONLY valid JSON matching the required structure. No markdown, no commentary.'
            },
            {
              role: 'user',
              content: buildStrictRepairPrompt({
                curriculumType, topic, subtopic, grade, subject, term,
                previousContent: aiContent,
                reasons: gate.reasons
              })
            }
          ];

          const repaired = await generateDeepSeekJSON(repairMessages, {
            max_tokens: 7000,
            temperature: 0.2
          });

          if (repaired && typeof repaired === 'object') {
            aiContent = { ...aiContent, ...repaired };

            if (curriculumType === 'obc') {
              aiContent = repairOBCLessonContent(aiContent, topic, subtopic, subject, grade, term);
            } else {
              aiContent = repairCBCLessonContent(aiContent, topic, subtopic, subject, grade, term, curriculumContext, getCBCSubjectProfile(subject));
            }

            gate = detectGenericLesson(aiContent, { curriculumType, topic, subtopic });
            repairSucceeded = !gate.generic;
          }
        } catch (repairErr) {
          console.error('❌ Strict repair call failed:', repairErr.message);
        }

        if (!repairSucceeded) {
          console.warn('↩️ Strict repair did not produce a topic-specific lesson. Falling back to offline generator.');
          useFallback = true;
        }
      }

      if (!useFallback) {
        console.log(`✅ ${curriculumType.toUpperCase()} lesson passed the quality gate.`);
      }

    } catch (error) {
      console.log('⚠️ DeepSeek error, using fallback:', error.message);
      useFallback = true;
    }

    if (useFallback || !aiContent) {
      console.log(`📝 Using ${curriculumType.toUpperCase()} fallback (quality gate skipped)`);
      aiContent = curriculumType === 'cbc'
        ? generateFallbackCBC(topic, grade, subject, classSize, user, curriculumContext)
        : generateFallbackOBC(topic, grade, subject, classSize, user);
      generationMode = 'fallback';
    } else {
      generationMode = 'deepseek';
    }

    if (curriculumType === 'cbc' && (!aiContent.lessonProgression || aiContent.lessonProgression.length === 0)) {
      aiContent.lessonProgression = generateLessonProgression(topic, subject, grade);
    }
    if (curriculumType === 'obc' && (!aiContent.lessonDevelopment || aiContent.lessonDevelopment.length === 0)) {
      aiContent.lessonDevelopment = generateLessonContent(topic, subject, grade);
    }

    if (curriculumContext?.matched && curriculumContext.match) {
      const cm = curriculumContext.match;
      aiContent.title = cm.topic || aiContent.title;
      aiContent.subtopic = cm.subTopic || cm.subtopic || aiContent.subtopic;

      if (curriculumType === 'cbc') {
        aiContent.specificCompetence = cm.specificCompetence || cm.specificCompetences || aiContent.specificCompetence;
        aiContent.expectedStandard = cm.expectedStandard || cm.expectedStandards || aiContent.expectedStandard;
        aiContent.materials = Array.isArray(cm.resources) ? cm.resources : (Array.isArray(cm.aids) ? cm.aids : aiContent.materials);
        if (Array.isArray(cm.competences) && cm.competences.length) aiContent.generalCompetences = cm.competences;
        if (cm.specificCompetence) {
          aiContent.lessonGoal = `By the end of the lesson, learners will be able to ${String(cm.specificCompetence).replace(/^(demonstrate|explore|interpret|construct|apply|identify|explain)\s+/i, '').trim().replace(/[.]$/, '')}.`;
        }
      } else {
        aiContent.specificOutcome = cm.specificOutcome || cm.objective || aiContent.specificOutcome || '';
        aiContent.teachingAids = Array.isArray(cm.aids) ? cm.aids : aiContent.teachingAids;
        if (cm.methods) aiContent.curriculumMethods = cm.methods;
      }

      if (cm.knowledge) aiContent.curriculumKnowledge = cm.knowledge;
      if (cm.skills) aiContent.curriculumSkills = cm.skills;
      if (cm.values) aiContent.curriculumValues = cm.values;
      if (cm.methods) aiContent.curriculumMethods = cm.methods;
      if (cm.officialExcerpt) aiContent.curriculumEvidence = cm.officialExcerpt;
      if (cm.reference || cm.references) aiContent.curriculumReference = cm.reference || cm.references;
    }

    if (curriculumType === 'obc') {
      aiContent = repairOBCLessonContent(aiContent, topic, subtopic, subject, grade, term);
    }
    if (curriculumType === 'cbc') {
      aiContent = repairCBCLessonContent(aiContent, topic, subtopic, subject, grade, term, curriculumContext, getCBCSubjectProfile(subject));
    }

    // HARD FORMAT ISOLATION
    if (curriculumType === 'cbc') {
      delete aiContent.lessonDevelopment;
      delete aiContent.specificOutcome;
      delete aiContent.learnersEvaluationText;
      delete aiContent.curriculumMethods;
      delete aiContent.curriculumKnowledge;
      delete aiContent.curriculumSkills;
      delete aiContent.curriculumValues;
    } else if (curriculumType === 'obc') {
      delete aiContent.lessonProgression;
      delete aiContent.generalCompetences;
      delete aiContent.specificCompetence;
      delete aiContent.lessonGoal;
      delete aiContent.expectedStandard;
      delete aiContent.learningEnvironment;
      delete aiContent.materials;
      delete aiContent.homework;
    }

    if (curriculumType === 'cbc' && Array.isArray(aiContent.lessonProgression)) {
      const parseMinutes = (value) => {
        const m = String(value || '').match(/(\d+)\s*(?:min|mins|minutes?)/i);
        return m ? Number(m[1]) : 0;
      };
      const total = aiContent.lessonProgression.reduce((sum, row) => sum + parseMinutes(row.time || row.duration), 0);
      if (total !== 80 && aiContent.lessonProgression.length) {
        const diff = 80 - total;
        const last = aiContent.lessonProgression[aiContent.lessonProgression.length - 1];
        const current = parseMinutes(last.time || last.duration) || 1;
        last.time = `${Math.max(1, current + diff)} min`;
      }
    }

    let referencesArray = Array.isArray(aiContent.references)
      ? aiContent.references
      : (aiContent.references ? [aiContent.references] : []);

    if (curriculumType === 'cbc') {
      const officialRefs = getReferenceTitles({ subject, grade, term, context: curriculumContext });
      if (officialRefs.length) referencesArray = officialRefs;
      else if (!referencesArray.length) referencesArray = ['No verified official reference is loaded for this selection'];
    } else if (!referencesArray.length) {
      referencesArray = ['Teacher-provided curriculum materials'];
    }

    const materialsArray = Array.isArray(aiContent.materials)
      ? aiContent.materials
      : (aiContent.materials ? [aiContent.materials] : ["Manila paper", "Markers", "Charts", "Worksheet", "Real objects"]);

    const teachingAidsArray = Array.isArray(aiContent.teachingAids)
      ? aiContent.teachingAids
      : (aiContent.teachingAids ? [aiContent.teachingAids] : ["Whiteboard", "Charts", "Diagrams"]);

    const generalCompetencesArray = Array.isArray(aiContent.generalCompetences)
      ? aiContent.generalCompetences
      : ["Analytical thinking", "Collaboration", "Communication", "Critical thinking"];

    const learningOutcomesArray = Array.isArray(aiContent.learningOutcomes)
      ? aiContent.learningOutcomes
      : [`Understand ${topic}`, `Apply ${topic}`, `Analyze ${topic}`];

    const learnersEvaluationArray = Array.isArray(aiContent.learnersEvaluation)
      ? aiContent.learnersEvaluation
      : [`Define ${topic}`, `Give examples of ${topic}`, `Explain the importance of ${topic}`];

    const lessonProgressionArray = Array.isArray(aiContent.lessonProgression)
      ? aiContent.lessonProgression
      : generateLessonProgression(topic, subject, grade);

    let lessonDevelopmentArray = Array.isArray(aiContent.lessonDevelopment)
      ? aiContent.lessonDevelopment
      : [];

    if (lessonDevelopmentArray.length === 0 && curriculumType === 'obc') {
      console.log('📝 lessonDevelopment empty — populating default content.');
      lessonDevelopmentArray = generateLessonContent(topic, subject, grade);
    }

    if (curriculumType === 'obc') {
      lessonDevelopmentArray = lessonDevelopmentArray.map((item, index) => ({
        ...item,
        time: item.time || ['10 min', '15 min', '15 min', '10 min'][index] || '10 min',
        learningPoints: item.learningPoints ?? item.content ?? '',
        teacherActivities: item.teacherActivities ?? item.teacherActivity ?? '',
        pupilActivities: item.pupilActivities ?? item.pupilActivity ?? '',
        content: item.content ?? item.learningPoints ?? '',
        teacherActivity: item.teacherActivity ?? item.teacherActivities ?? '',
        pupilActivity: item.pupilActivity ?? item.pupilActivities ?? ''
      }));
    }

    // Attach generation metadata so the frontend can warn the user
    aiContent._generationMode = generationMode;
    if (generationMode === 'fallback') {
      aiContent._generationWarning = 'AI generation was unavailable or produced generic content. This is a template-based fallback lesson — please review and adapt it before teaching.';
    }

    const lesson = await prisma.lesson.create({
      data: {
        userId: req.userId,
        grade, subject, topic,
        subtopic: aiContent.subtopic || subtopic || '',
        title: aiContent.title || topic,
        classSize: size,
        duration: aiContent.duration || '80 MINUTES',
        curriculum: curriculumType,
        objectives: learningOutcomesArray,
        development: lessonDevelopmentArray.map(d => d.learningPoints || d.content) || [],
        activities: lessonDevelopmentArray.map(d => d.pupilActivity || d.pupilActivities) || [],
        assessment: learnersEvaluationArray.join(', ') || '',
        curriculumCodes: curriculumContext?.matched && curriculumContext.match?.topic ? [curriculumContext.match.topic] : [],
        provinceContext: user.province || '',
        lessonDevelopment: lessonDevelopmentArray,
        lessonProgression: lessonProgressionArray,
        learningOutcomes: learningOutcomesArray,
        learnersEvaluation: learnersEvaluationArray,
        teacherEvaluation: aiContent.teacherEvaluation || '',
        generalCompetences: generalCompetencesArray,
        specificCompetence: aiContent.specificCompetence || '',
        lessonGoal: aiContent.lessonGoal || '',
        rationale: aiContent.rationale || '',
        priorKnowledge: aiContent.priorKnowledge || '',
        references: referencesArray,
        learningEnvironment: aiContent.learningEnvironment || '',
        materials: materialsArray,
        expectedStandard: aiContent.expectedStandard || '',
        homework: aiContent.homework || '',
        lessonEvaluation: aiContent.lessonEvaluation || '',
        teacherName: user.fullName || '',
        school: user.school || '',
        province: user.province || '',
        district: user.district || '',
        date: aiContent.date || new Date().toISOString().split('T')[0],
        time: aiContent.time || '',
        boys: aiContent.boys || 0,
        girls: aiContent.girls || 0,
        teachingAids: teachingAidsArray
      }
    });

    await prisma.user.update({
      where: { id: req.userId },
      data: { lessonsUsed: user.lessonsUsed + 1 }
    });

    const responseData = {
      ...aiContent,
      id: lesson.id,
      createdAt: lesson.createdAt,
      grade, subject, topic,
      classSize: size,
      curriculum: curriculumType,
      school: user.school || '',
      province: user.province || '',
      district: user.district || '',
      teacherName: user.fullName || '',
      _generationMode: generationMode,
      _generationWarning: aiContent._generationWarning || null
    };

    if (curriculumType === 'cbc') {
      responseData.lessonProgression = lessonProgressionArray;
      responseData.curriculumSourceStatus = curriculumContext?.sourceStatus || 'SOURCE_NOT_FOUND';
      responseData.curriculumSource = curriculumContext?.source || null;
      responseData.curriculumMatch = curriculumContext?.match || null;
    } else {
      responseData.lessonDevelopment = lessonDevelopmentArray;
      responseData.curriculumSourceStatus = curriculumContext?.sourceStatus || 'OBC_SOURCE_NOT_FOUND';
      responseData.curriculumSource = curriculumContext?.source || null;
      responseData.curriculumMatch = curriculumContext?.match || null;
    }

    res.status(201).json(responseData);

  } catch (error) {
    console.error('❌ Lesson generation error:', error);
    res.status(500).json({
      error: 'Failed to generate lesson',
      details: error.message
    });
  }
});

// ============ SCHEME OF WORK GENERATION ROUTE ============
app.post('/api/schemes/generate', authenticate, async (req, res) => {
  try {
    const {
      grade, subject, term, year, school,
      weeks: totalWeeks, assessmentWeeks, testTopics,
      weekTopics, weekSubtopics, subtopic, curriculum
    } = req.body;

    if (!grade || !subject) {
      return res.status(400).json({ error: 'Missing required fields: grade, subject' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role !== 'ADMIN' && user.schemesUsed >= user.schemesLimit) {
      return res.status(403).json({
        error: 'Scheme limit reached. Please upgrade your plan to generate more schemes.'
      });
    }

    const curriculumType = String(curriculum || 'cbc').toLowerCase();

    if (curriculumType === 'cbc') {
      const registeredSubject = getRegisteredOfficialSource(subject);
      const secondaryGrade = /^grade\s*(?:[8-9]|1[0-2])$/i.test(String(grade || '').trim());
      const unsupportedForm = /^form\s*(?:5|6)$/i.test(String(grade || '').trim());
      if (registeredSubject && (secondaryGrade || unsupportedForm)) {
        return res.status(400).json({
          error: `For the 2024 CBC ${subject} syllabus, select Form 1, Form 2, Form 3 or Form 4. ${grade} is an old/legacy grade label and must be generated under OBC.`,
          code: 'CBC_SECONDARY_REQUIRES_FORM_1_4',
          curriculum: 'cbc',
          subject,
          allowedGrades: ['Form 1', 'Form 2', 'Form 3', 'Form 4']
        });
      }
    }

    const syllabusVersion = curriculumType === 'cbc'
      ? 'NEW_2024_CBC'
      : 'OLD_LEGACY_OBC';
    let sourcePacks = listCurriculumSources({ curriculum: curriculumType, grade, subject, term });
    let sourceRowsDetailed = listCurriculumRows({ curriculum: curriculumType, grade, subject, term });

    if (curriculumType === 'cbc') {
      try {
        const cdcResources = await listCDCResources({ grade, subject, term });
        const cdcRows = await loadCDCRows({ grade, subject, term });
        if (cdcRows.length || cdcResources.length) {
          sourcePacks = cdcResources.length
            ? cdcResources.map((r) => ({
                curriculum: 'cbc', subject, grade, term, sourceType: 'cdc_digital_library',
                sourceBasis: 'CDC Digital Library — Curriculum Development Centre, Ministry of Education, Zambia',
                officialSource: r.url, file: `cdc:${r.id}`,
                title: r.title, resourceUrl: r.url,
                topics: [...new Set(cdcRows.filter(x => x.cdcResourceUrl === r.url || x.cdcResourceTitle === r.title).map(x => x.topic).filter(Boolean))],
                subtopics: [...new Set(cdcRows.filter(x => x.cdcResourceUrl === r.url || x.cdcResourceTitle === r.title).map(x => x.subTopic).filter(Boolean))]
              }))
            : [{
                curriculum: 'cbc', subject, grade, term,
                sourceType: 'ministry_dcd_syllabus',
                sourceBasis: 'Ministry of Education, Directorate of Curriculum Development — finalized syllabus',
                officialSource: cdcRows[0]?.officialSource || '', file: 'ministry:dcd',
                title: cdcRows[0]?.cdcResourceTitle || `${subject} ${grade} finalized syllabus`,
                resourceUrl: cdcRows[0]?.cdcResourceUrl || cdcRows[0]?.officialSource || '',
                topics: [...new Set(cdcRows.map(x => x.topic).filter(Boolean))],
                subtopics: [...new Set(cdcRows.map(x => x.subTopic || x.subtopic).filter(Boolean))]
              }];
          if (cdcRows.length) sourceRowsDetailed = cdcRows.map((row) => ({ ...row, _source: { subject, grade, term, sourceType: row.sourceType || (cdcResources.length ? 'cdc_digital_library' : 'ministry_dcd_syllabus'), sourceBasis: row.sourceBasis || (cdcResources.length ? 'CDC Digital Library — Curriculum Development Centre, Ministry of Education, Zambia' : 'Ministry of Education, Directorate of Curriculum Development — finalized syllabus'), officialSource: row.cdcResourceUrl || row.officialSource || '', file: `${cdcResources.length ? 'cdc' : 'ministry'}:${row.cdcResourceTitle || ''}` } }));
        }
      } catch (error) {
        console.warn(`⚠️ CDC scheme source lookup failed: ${error.message}`);
      }
    }

    const sourceRows = sourceRowsDetailed.map((row) => ({
      week: row.week,
      topic: row.topic,
      subTopic: row.subTopic || row.subtopic || '',
      specificCompetence: row.specificCompetence || row.specificCompetences || '',
      expectedStandard: row.expectedStandard || row.expectedStandards || '',
      methods: row.methods || row.strategies || '',
      resources: row.resources || row.aids || '',
      knowledge: row.knowledge || '',
      skills: row.skills || '',
      values: row.values || '',
      reference: (() => {
        const localReference = row.reference || row.references || '';
        const titles = getReferenceTitles({
          subject, grade, term,
          context: {
            matched: Boolean(localReference),
            match: localReference ? { reference: localReference } : null,
            source: row._source || null
          }
        });
        return titles.join('; ');
      })(),
      source: row._source
    }));

    console.log(`📚 Curriculum source packs found: ${sourcePacks.length}`);
    console.log(`📝 Generating ${curriculumType.toUpperCase()} scheme with DeepSeek (${syllabusVersion})...`);

    const assessmentWeeksList = assessmentWeeks || [3, 6, 9, 12];
    const customTopics = weekTopics || {};
    const customSubtopics = weekSubtopics || {};
    const totalWeeksCount = totalWeeks || 13;
    const subtopicsList = subtopic ? subtopic.split(',').map(s => s.trim()) : [];

    let aiContent = null;
    let useFallback = false;

    try {
      let prompt;
      const schemeResearch = '';

      if (curriculumType === 'cbc') {
        let customTopicsString = '';
        let matchedSourceDetails = '';
        for (const week of Object.keys(customTopics)) {
          if (customTopics[week]) {
            customTopicsString += `Week ${week}: ${customTopics[week]}\n`;
            const ctx = await getCurriculumContextAsync({ curriculum: curriculumType, grade, subject, term, topic: customTopics[week], subtopic: customSubtopics[week] });
            if (ctx.matched) matchedSourceDetails += `Week ${week}: ${formatContext(ctx)}\n`;
          }
        }

        const officialReferenceTitles = getReferenceTitles({ subject, grade, term });
        prompt = `
You are generating a Zambian school scheme of work.
SYLLABUS VERSION: NEW 2024 COMPETENCE-BASED CURRICULUM (CBC)
Grade/Form: "${grade}"
Subject: "${subject}"
Term: "${term || 'Term 1'}"

IMPORTANT SYLLABUS RULES:
- Follow the current Zambia Ministry of Education 2024 syllabus for the selected subject, grade/form and term.
- Do NOT use the old/legacy syllabus when CBC is selected.
- Use official syllabus topic/sub-topic terminology and numbering where known.
- Do not invent unrelated topics merely to fill weeks.
- If the user supplies topics/subtopics, preserve them and build the CBC competences, activities and standards around them.
- If an official topic cannot be confidently identified, use the closest syllabus-aligned topic.
- The output must remain suitable for a Zambian Ministry of Education CBC scheme of work.
${customTopicsString ? `User topics (respect these):\n${customTopicsString}` : 'Generate appropriate topics for all weeks from the selected 2024 CBC syllabus.'}
Assessment weeks: ${assessmentWeeksList.join(', ')}

OFFICIAL DCD REFERENCE CONTROL:
${officialReferenceTitles.length ? officialReferenceTitles.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'No registered official DCD reference is available for this selection.'}
- These are verified reference titles from the Zambia Ministry of Education Directorate of Curriculum Development registry.
- Do not invent textbooks, Teaching Module titles, authors, publishers or page numbers.

LOCAL CURRICULUM SOURCE CONTROL:
${sourceRows.length ? JSON.stringify(sourceRows, null, 2) : 'NO VERIFIED LOCAL SOURCE PACK IS AVAILABLE FOR THIS SUBJECT/GRADE/TERM. Do not invent official syllabus codes, page numbers or CDC claims.'}
- When a local source pack is available, its rows are the authoritative local sequence for this generation. Preserve the supplied topic/subtopic/competence wording rather than replacing it with a generic DeepSeek sequence.
- Never use a subject-specific default such as Biology when the selected subject is different.
- References must use the verified DCD reference titles supplied above. Never invent a textbook or page.
${matchedSourceDetails ? `VERIFIED DETAILS FOR USER-SUPPLIED TOPICS:\n${matchedSourceDetails}` : ''}
- If a verified local source row matches a supplied topic, preserve its official wording, competence, resources and reference.
- If a verified source pack exists but the user leaves a week topic blank, use the source pack sequence rather than inventing a different topic.
- If no verified source exists, generate a useful scheme but do not label invented topic codes/references as official CDC content.

Return ONLY valid JSON with this CBC scheme structure:
{
  "weeks": [
    {
      "week": 1,
      "topics": [
        {
          "topic": "Topic code and name",
          "subtopic": "Subtopic name",
          "specificCompetence": "What learners should achieve",
          "methods": "Teaching methods",
          "aids": "Teaching aids/resources",
          "references": "Reference books",
          "knowledge": "Knowledge gained",
          "skills": "Skills developed",
          "values": "Values adopted"
        }
      ],
      "assessment": null,
      "isRevision": false,
      "isAssessment": false
    }
  ],
  "assessmentWeeks": [3, 6, 9, 12],
  "testTopics": ["Mid-term test", "End of term test"]
}
`;
      } else {
        let customTopicsString = '';
        Object.keys(customTopics).forEach(week => {
          if (customTopics[week]) customTopicsString += `Week ${week}: ${customTopics[week]}\n`;
        });

        prompt = `
You are generating a Zambian school scheme of work.
SYLLABUS VERSION: OLD / LEGACY ZAMBIAN O-LEVEL SYLLABUS
Grade/Form: "${grade}"
Subject: "${subject}"
Term: "${term || 'Term 1'}"

IMPORTANT SYLLABUS RULES:
- Follow the older/legacy Zambia syllabus structure for the selected subject, grade/form and term.
- Do NOT replace the old syllabus topics with the 2024 CBC topic sequence when OBC is selected.
- Preserve established old-syllabus topic/sub-topic names and numbering where known.
- If the user supplies topics/subtopics, preserve them.
- Do not invent unrelated content just to fill weeks.
- Keep objectives, methods, aids, knowledge, skills and values appropriate to the old Objective-Based Curriculum format.
${customTopicsString ? `User topics (respect these):\n${customTopicsString}` : 'Generate appropriate topics for all weeks following the legacy syllabus sequence.'}
Assessment weeks: ${assessmentWeeksList.join(', ')}

Return ONLY valid JSON with this OBC scheme structure:
{
  "weeks": [
    {
      "week": 1,
      "topics": [
        {
          "topic": "Topic name",
          "specificOutcome": "What learners should achieve",
          "methods": "Teaching methods",
          "aids": "Teaching aids",
          "references": "Reference books",
          "knowledge": "Knowledge gained",
          "skills": "Skills developed",
          "values": "Values adopted"
        }
      ],
      "assessment": null
    }
  ],
  "assessmentWeeks": [3, 6, 9, 12],
  "testTopics": ["Mid-term test", "End of term test"]
}
`;
      }

      if (schemeResearch) {
        prompt += `\n\nONLINE RESEARCH ENRICHMENT (supporting evidence only):\n${schemeResearch}\nRULE: Online research may enrich activities, examples, explanations and learner tasks, but it MUST NOT override the official curriculum source, topic, subtopic, competence, standard, code, sequence, or CBC/OBC syllabus family.\n`;
      }

      const messages = [
        {
          role: "system",
          content: `
You are an expert curriculum planner for Zambian schools creating ${curriculumType.toUpperCase()} schemes of work.

The user will provide grade, subject, and term information.
Parse the information and output it in valid JSON format.

Syllabus selection is mandatory:
- NEW_2024_CBC: use the current 2024 Zambia Ministry of Education Competence-Based syllabus and CBC terminology.
- OLD_LEGACY_OBC: use the older/legacy Zambian syllabus and Objective-Based terminology.
For CBC: Include topic, subtopic, specificCompetences, learningActivities, expectedStandards, resources, strategies, and reference.
For OBC: Include topic, specificOutcome, methods, aids, references, knowledge, skills, and values.

Return ONLY the JSON object, no other text.
`
        },
        { role: "user", content: prompt }
      ];

      aiContent = await generateDeepSeekJSON(messages, { max_tokens: 4000, temperature: 0.1 });
      console.log('✅ DeepSeek generated scheme successfully');

    } catch (error) {
      console.log('⚠️ DeepSeek error, using fallback:', error.message);
      useFallback = true;
    }

    if (!aiContent || useFallback) {
      console.log(`📝 Using ${curriculumType.toUpperCase()} fallback scheme generator`);
      if (curriculumType === 'cbc' && sourceRowsDetailed.length) {
        aiContent = {
          weeks: sourceRowsDetailed.map((row, index) => ({
            week: Number(row.week || index + 1),
            topics: [{
              topic: row.topic || '',
              subtopic: row.subTopic || row.subtopic || '',
              specificCompetence: row.specificCompetence || row.specificCompetences || '',
              methods: row.methods || row.strategies || '',
              aids: row.resources || row.aids || '',
              references: row.reference || row.references || 'Teacher-provided curriculum materials',
              knowledge: row.knowledge || '',
              skills: row.skills || '',
              values: row.values || ''
            }],
            isRevision: false,
            isAssessment: false
          })),
          assessmentWeeks: assessmentWeeksList,
          testTopics: testTopics || []
        };
      } else if (curriculumType === 'cbc') {
        aiContent = generateCBCScheme(grade, subject, term, user, customTopics);
      } else {
        aiContent = generateOBCScheme(grade, subject, term, user, customTopics);
      }
    }

    const weeks = (aiContent?.weeks || []).map(week => {
      if (curriculumType === 'cbc') {
        const topic = Array.isArray(week.topics) && week.topics.length > 0 ? week.topics[0] : week;
        const weekNumber = Number(week.week);
        const forcedSubtopic = customSubtopics[weekNumber] || customSubtopics[String(weekNumber)] || '';
        const topicName = topic.topic || '';
        const competence = topic.specificCompetences ?? topic.specificCompetence ?? topic.competencies ?? '';
        const activities = topic.learningActivities ?? topic.activities ?? '';
        const standards = topic.expectedStandards ?? topic.expectedStandard ??
          (competence ? `Learners demonstrate the competence: ${Array.isArray(competence) ? competence.join('; ') : competence}.` : '');
        const resources = topic.resources ?? topic.aids ?? '';
        const strategies = topic.strategies ?? topic.methods ?? '';
        const reference = topic.reference ?? topic.references ?? '';
        const sourceMatch = sourceRowsDetailed.find((row) =>
          Number(row.week) === weekNumber ||
          (String(row.topic || '').trim().toLowerCase() && String(row.topic || '').trim().toLowerCase() === String(topicName || '').trim().toLowerCase())
        );
        const finalTopic = sourceMatch?.topic || topicName;
        const finalSubTopic = forcedSubtopic || sourceMatch?.subTopic || sourceMatch?.subtopic || topic.subTopic || topic.subtopic || '';
        const finalCompetence = sourceMatch?.specificCompetence || sourceMatch?.specificCompetences || competence;
        const finalActivities = sourceMatch?.learningActivities || activities;
        const finalStandards = sourceMatch?.expectedStandard || sourceMatch?.expectedStandards || standards;
        const finalResources = sourceMatch?.resources || sourceMatch?.aids || resources;
        const finalStrategies = sourceMatch?.strategies || sourceMatch?.methods || strategies;
        const officialReferenceText = getReferenceTitles({ subject, grade, term }).join('; ');
        const aiReferenceIsGeneric = !reference || /teacher-provided curriculum materials/i.test(String(reference));
        const finalReference = sourceMatch?.reference || sourceMatch?.references ||
          (aiReferenceIsGeneric ? officialReferenceText : reference) ||
          'No verified official reference is loaded for this selection';

        return {
          week: weekNumber,
          topic: finalTopic,
          subTopic: finalSubTopic,
          specificCompetences: finalCompetence,
          learningActivities: finalActivities || (finalTopic ? [`Introduction and discussion of ${finalTopic}`, `Group/individual activities on ${finalTopic}`] : ''),
          expectedStandards: finalStandards,
          resources: finalResources,
          strategies: finalStrategies,
          reference: finalReference,
          isRevision: week.isRevision || false,
          isAssessment: week.isAssessment || false,
          topics: Array.isArray(week.topics) ? week.topics : [topic]
        };
      }

      return {
        week: week.week,
        topics: (week.topics || []).map(topic => ({
          topic: topic.topic || '',
          subtopic: topic.subtopic || '',
          specificCompetence: topic.specificCompetence || topic.specificOutcome || '',
          specificOutcome: topic.specificOutcome || '',
          methods: topic.methods || '',
          aids: topic.aids || '',
          references: topic.references || '',
          knowledge: topic.knowledge || '',
          skills: topic.skills || '',
          values: topic.values || ''
        })),
        assessment: week.assessment || null,
        isRevision: week.isRevision || false,
        isAssessment: week.isAssessment || false
      };
    });

    if (curriculumType === 'cbc') {
      const repairedWeeks = repairCBCSchemeAlignment(weeks, {
        sourceRowsDetailed, customTopics, customSubtopics, assessmentWeeksList, subject
      });
      weeks.splice(0, weeks.length, ...repairedWeeks);
    }

    if (subtopicsList.length > 0) {
      let weekIndex = 0;
      for (let i = 0; i < weeks.length; i++) {
        if (!assessmentWeeksList.includes(weeks[i].week) && !weeks[i].isRevision && !weeks[i].isAssessment) {
          if (weekIndex < subtopicsList.length && weeks[i].topics?.[0]) {
            const manualSubtopic = subtopicsList[weekIndex];
            if (curriculumType === 'cbc') {
              const current = weeks[i].subTopic || weeks[i].topics[0].subtopic || '';
              if (!current) {
                weeks[i].subTopic = manualSubtopic;
                weeks[i].topics[0].subtopic = manualSubtopic;
              }
              if (!weeks[i].specificCompetences) {
                weeks[i].specificCompetences = `By the end of this lesson, learners will be able to understand and explain ${weeks[i].subTopic || manualSubtopic}`;
              }
              if (!weeks[i].topics[0].specificCompetence) {
                weeks[i].topics[0].specificCompetence = weeks[i].specificCompetences;
              }
              if (!weeks[i].expectedStandards) {
                weeks[i].expectedStandards = `Learners explain and apply ${weeks[i].subTopic || manualSubtopic} correctly.`;
              }
            } else {
              weeks[i].topics[0].subtopic = manualSubtopic;
              if (!weeks[i].topics[0].specificOutcome) {
                weeks[i].topics[0].specificOutcome = `By the end of this lesson, learners will be able to understand and explain ${manualSubtopic}`;
              }
            }
            weekIndex++;
          }
        }
      }
    }

    const generatedScheme = {
      grade, subject,
      term: term || 'Term 1',
      year: year || new Date().getFullYear().toString(),
      totalWeeks: totalWeeksCount,
      school: school || user.school || '',
      teacherName: user.fullName || '',
      subtopic: subtopic || '',
      weeks: weeks,
      assessmentWeeks: assessmentWeeksList,
      testTopics: testTopics || [`Mid-term test on ${subject}`, `End of term test on ${subject}`],
      curriculum: curriculumType,
      curriculumSourceStatus: curriculumType === 'cbc'
        ? (sourcePacks.some(s => s.sourceType === 'cdc_digital_library') ? 'VERIFIED_CDC_LIBRARY_AVAILABLE' : (sourcePacks.length ? 'VERIFIED_LOCAL_PACK_AVAILABLE' : 'NO_CDC_SOURCE'))
        : (sourcePacks.length ? 'VERIFIED_LOCAL_PACK_AVAILABLE' : 'OBC_MODE'),
      curriculumSources: sourcePacks,
      createdAt: new Date().toISOString()
    };

    const scheme = await prisma.scheme.create({
      data: {
        userId: req.userId,
        grade, subject,
        term: term || 'Term 1',
        year: year || new Date().getFullYear().toString(),
        totalWeeks: totalWeeksCount,
        weeks: weeks,
        assessmentWeeks: generatedScheme.assessmentWeeks,
        school: school || user.school || '',
        teacherName: user.fullName || '',
        subtopic: subtopic || '',
        testTopics: generatedScheme.testTopics,
        curriculum: curriculumType
      }
    });

    await prisma.user.update({
      where: { id: req.userId },
      data: { schemesUsed: user.schemesUsed + 1 }
    });

    console.log(`✅ ${curriculumType.toUpperCase()} scheme generated successfully`);
    res.status(201).json({
      ...generatedScheme,
      id: scheme.id,
      createdAt: scheme.createdAt
    });

  } catch (error) {
    console.error('❌ Scheme generation error:', error);
    res.status(500).json({
      error: 'Failed to generate scheme of work',
      details: error.message
    });
  }
});

// ============ SCHEME EXPORT ROUTES ============
function cbcListText(value) {
  if (Array.isArray(value)) return value.join('\n');
  return String(value ?? '');
}

function cbcExportRow(week) {
  return {
    week: String(week.week ?? ''),
    topic: String(week.topic ?? ''),
    subTopic: String(week.subTopic ?? week.subtopic ?? ''),
    specificCompetences: cbcListText(week.specificCompetences ?? week.specificCompetence ?? week.competencies ?? ''),
    learningActivities: cbcListText(week.learningActivities ?? week.activities ?? ''),
    expectedStandards: String(week.expectedStandards ?? week.expectedStandard ?? ''),
    resources: cbcListText(week.resources ?? week.aids ?? ''),
    strategies: cbcListText(week.strategies ?? week.methods ?? ''),
    reference: cbcListText(week.reference ?? week.references ?? 'Teacher-provided curriculum materials')
  };
}

function cbcCell(text, options = {}) {
  return new TableCell({
    width: { size: options.width || 100, type: WidthType.PERCENTAGE },
    children: [new Paragraph({
      alignment: options.align || AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: 180 },
      children: [new TextRun({
        text: String(text ?? ''),
        bold: !!options.bold,
        font: 'Times New Roman',
        size: options.size || 14
      })]
    })]
  });
}

app.get('/api/schemes/export/:id/word', authenticate, async (req, res) => {
  try {
    const scheme = await prisma.scheme.findUnique({ where: { id: req.params.id } });
    if (!scheme) return res.status(404).json({ error: 'Scheme not found' });
    if (scheme.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    if (String(scheme.curriculum || '').toLowerCase() === 'cbc') {
      const widths = [6, 11, 13, 15, 17, 13, 11, 13, 13];
      const headerNames = ['week','Topic','Sub- topic','Specific competences','Learning activities','Expected standards','T/L\nRESOURCES','STRATEGIES\nTECHNIQUES','REFERENCE'];
      const tableRows = [new TableRow({
        children: headerNames.map((h, i) => cbcCell(h, { bold: true, align: AlignmentType.CENTER, width: widths[i], size: 14 }))
      })];

      for (const week of (scheme.weeks || [])) {
        const r = cbcExportRow(week);
        tableRows.push(new TableRow({ children: [
          cbcCell(r.week, { align: AlignmentType.CENTER, width: widths[0] }),
          cbcCell(r.topic, { width: widths[1] }),
          cbcCell(r.subTopic, { width: widths[2] }),
          cbcCell(r.specificCompetences, { width: widths[3] }),
          cbcCell(r.learningActivities, { width: widths[4] }),
          cbcCell(r.expectedStandards, { width: widths[5] }),
          cbcCell(r.resources, { width: widths[6] }),
          cbcCell(r.strategies, { width: widths[7] }),
          cbcCell(r.reference, { width: widths[8] })
        ] }));
      }

      const doc = new Document({ sections: [{
        properties: {
          page: {
            size: { width: 16838, height: 11906, orientation: 'landscape' },
            margin: { top: 360, right: 360, bottom: 360, left: 360 }
          }
        },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: 'MINISTRY OF EDUCATION', font: 'Times New Roman', size: 22, bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: scheme.school || '', font: 'Times New Roman', size: 21, bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: 'DEPARTMENT OF NATURAL SCIENCES', font: 'Times New Roman', size: 21, bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: `SCHEMES OF WORK FOR ${String(scheme.subject || '').toUpperCase()}`, font: 'Times New Roman', size: 21, bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 100 }, children: [new TextRun({ text: `SUBJECT: ${String(scheme.subject || '').toUpperCase()}     FORM: ${scheme.grade || ''}     TERM: ${termWord(scheme.term)}     YEAR: ${scheme.year || new Date().getFullYear()}`, font: 'Times New Roman', size: 18, bold: true })] }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows })
        ]
      }] });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${scheme.subject}_Scheme_of_Work_Term_${scheme.term}.docx"`);
      return res.send(buffer);
    }

    const tableRows = [];
    const headerRow = new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: 'WEEK', bold: true })], width: { size: 5, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'TOPIC', bold: true })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'SUBTOPIC', bold: true })], width: { size: 15, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'SPECIFIC COMPETENCE', bold: true })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'METHODS', bold: true })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'AIDS', bold: true })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'REFERENCES', bold: true })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'KNOWLEDGE', bold: true })], width: { size: 5, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'SKILLS', bold: true })], width: { size: 5, type: WidthType.PERCENTAGE } }),
      ],
    });
    tableRows.push(headerRow);

    scheme.weeks.forEach(week => {
      const topics = week.topics || [];
      const topicText = topics.map(t => t.topic || '').join('\n');
      const subtopicText = topics.map(t => t.subtopic || '').join('\n');
      const competenceText = topics.map(t => t.specificCompetence || t.specificOutcome || '').join('\n');
      const methodsText = topics.map(t => t.methods || '').join('\n');
      const aidsText = topics.map(t => t.aids || '').join('\n');
      const refsText = topics.map(t => t.references || '').join('\n');
      const knowledgeText = topics.map(t => t.knowledge || '').join('\n');
      const skillsText = topics.map(t => t.skills || '').join('\n');

      const dataRow = new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: String(week.week) })] }),
          new TableCell({ children: [new Paragraph({ text: topicText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: subtopicText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: competenceText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: methodsText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: aidsText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: refsText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: knowledgeText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: skillsText || '-' })] }),
        ],
      });
      tableRows.push(dataRow);
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({ text: 'MINISTRY OF EDUCATION', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: 'SCHEME OF WORK', heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: `School: ${scheme.school || 'School Name'}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Subject: ${scheme.subject}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Grade: ${scheme.grade}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Term: ${scheme.term}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Year: ${scheme.year}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Curriculum: ${scheme.curriculum || 'CBC'}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Assessment Weeks: ${scheme.assessmentWeeks?.join(', ') || 'None'}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: '' }),
          new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '© 2026 mytoolbox - Made for teachers in Zambia', alignment: AlignmentType.CENTER }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="scheme_${scheme.id}.docx"`);
    res.send(buffer);

  } catch (error) {
    console.error('❌ Word export error:', error);
    return res.status(500).json({ error: 'Failed to export scheme as Word' });
  }
});

app.get('/api/schemes/export/:id/pdf', authenticate, async (req, res) => {
  try {
    const scheme = await prisma.scheme.findUnique({ where: { id: req.params.id } });
    if (!scheme) return res.status(404).json({ error: 'Scheme not found' });
    if (scheme.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    if (String(scheme.curriculum || '').toLowerCase() === 'cbc') {
      const doc = new PDFDocument({ margin: 22, size: 'A3', layout: 'landscape' });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => res.send(Buffer.concat(chunks)));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${scheme.subject}_Scheme_of_Work_Term_${scheme.term}.pdf"`);

      doc.font('Helvetica-Bold').fontSize(15).text('MINISTRY OF EDUCATION', { align: 'center' });
      doc.fontSize(14).text(scheme.school || '', { align: 'center' });
      doc.fontSize(14).text('DEPARTMENT OF NATURAL SCIENCES', { align: 'center' });
      doc.fontSize(14).text(`SCHEMES OF WORK FOR ${String(scheme.subject || '').toUpperCase()}`, { align: 'center' });
      doc.fontSize(11).text(`SUBJECT: ${String(scheme.subject || '').toUpperCase()}     FORM: ${scheme.grade || ''}     TERM: ${termWord(scheme.term)}     YEAR: ${scheme.year || new Date().getFullYear()}`, { align: 'center' });
      doc.moveDown(0.6);

      const headers = ['week','Topic','Sub- topic','Specific competences','Learning activities','Expected standards','T/L RESOURCES','STRATEGIES / TECHNIQUES','REFERENCE'];
      const baseWidths = [35, 80, 90, 125, 145, 110, 95, 110, 115];
      const usable = doc.page.width - 44;
      const scale = usable / baseWidths.reduce((a,b) => a + b, 0);
      const widths = baseWidths.map(w => w * scale);
      const startX = 22;
      let y = doc.y;

      const drawCell = (x, yy, w, h, text, bold = false, align = 'left') => {
        doc.rect(x, yy, w, h).stroke();
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.4).text(String(text || ''), x + 3, yy + 3, { width: w - 6, height: h - 6, align, ellipsis: true });
      };

      let x = startX;
      headers.forEach((h, i) => { drawCell(x, y, widths[i], 28, h, true, 'center'); x += widths[i]; });
      y += 28;

      for (const week of (scheme.weeks || [])) {
        const r = cbcExportRow(week);
        const vals = [r.week, r.topic, r.subTopic, r.specificCompetences, r.learningActivities, r.expectedStandards, r.resources, r.strategies, r.reference];
        const heights = vals.map((v, i) => Math.ceil(String(v || '').length / Math.max(12, Math.floor(widths[i] / 4.1))) * 7 + 10);
        const h = Math.max(26, Math.min(160, Math.max(...heights)));
        x = startX;
        vals.forEach((v, i) => { drawCell(x, y, widths[i], h, v, false, i === 0 ? 'center' : 'left'); x += widths[i]; });
        y += h;
        if (y > doc.page.height - 45) {
          doc.addPage();
          y = 25;
          x = startX;
          headers.forEach((h2, i) => { drawCell(x, y, widths[i], 28, h2, true, 'center'); x += widths[i]; });
          y += 28;
        }
      }
      doc.end();
      return;
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="scheme_${scheme.id}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).text('MINISTRY OF EDUCATION', { align: 'center' });
    doc.fontSize(14).text('SCHEME OF WORK', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`School: ${scheme.school || 'School Name'}`, { align: 'center' });
    doc.text(`Subject: ${scheme.subject}`, { align: 'center' });
    doc.text(`Grade: ${scheme.grade}`, { align: 'center' });
    doc.text(`Term: ${scheme.term}`, { align: 'center' });
    doc.text(`Year: ${scheme.year}`, { align: 'center' });
    doc.text(`Curriculum: ${scheme.curriculum || 'CBC'}`, { align: 'center' });
    doc.text(`Assessment Weeks: ${scheme.assessmentWeeks?.join(', ') || 'None'}`, { align: 'center' });
    doc.moveDown();

    const tableTop = doc.y;
    const columnWidths = [30, 50, 50, 60, 40, 40, 40, 30, 30];
    const headers = ['WK', 'TOPIC', 'SUBTOPIC', 'SPECIFIC COMPETENCE', 'METHODS', 'AIDS', 'REFERENCES', 'KNOWLEDGE', 'SKILLS'];

    let x = 50;
    let y = tableTop;

    doc.rect(50, y - 5, 495, 25).fill('#e0e0e0');
    doc.fillColor('black');

    headers.forEach((header, i) => {
      doc.fontSize(8).text(header, x, y, { width: columnWidths[i], align: 'center' });
      x += columnWidths[i];
    });

    y += 25;

    scheme.weeks.forEach(week => {
      const topics = week.topics || [];
      const topicText = topics.map(t => t.topic || '').join('\n');
      const subtopicText = topics.map(t => t.subtopic || '').join('\n');
      const competenceText = topics.map(t => t.specificCompetence || t.specificOutcome || '').join('\n');
      const methodsText = topics.map(t => t.methods || '').join('\n');
      const aidsText = topics.map(t => t.aids || '').join('\n');
      const refsText = topics.map(t => t.references || '').join('\n');
      const knowledgeText = topics.map(t => t.knowledge || '').join('\n');
      const skillsText = topics.map(t => t.skills || '').join('\n');

      const rowData = [
        String(week.week),
        topicText || '-',
        subtopicText || '-',
        competenceText || '-',
        methodsText || '-',
        aidsText || '-',
        refsText || '-',
        knowledgeText || '-',
        skillsText || '-'
      ];

      let maxHeight = 20;
      rowData.forEach((text, i) => {
        doc.fontSize(7).text(text, 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y, {
          width: columnWidths[i],
          align: 'left',
          ellipsis: true,
        });
        const height = doc.heightOfString(text, { width: columnWidths[i] });
        if (height > maxHeight) maxHeight = height;
      });

      let currentX = 50;
      rowData.forEach((text, i) => {
        doc.rect(currentX, y, columnWidths[i], maxHeight + 5).stroke();
        currentX += columnWidths[i];
      });

      y += maxHeight + 10;

      if (y > 750) {
        doc.addPage();
        y = 50;
      }
    });

    doc.moveDown();
    doc.fontSize(10).text('© 2026 mytoolbox - Made for teachers in Zambia', { align: 'center' });

    doc.end();

  } catch (error) {
    console.error('❌ PDF export error:', error);
    return res.status(500).json({ error: 'Failed to export scheme as PDF' });
  }
});

// ============ NOTES ROUTES ============
app.get('/api/notes', authenticate, async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 20
    });
    res.json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

app.get('/api/notes/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const note = await prisma.note.findUnique({ where: { id: id } });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });
    res.json(note);
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

app.post('/api/notes/upload', authenticate, notesUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Please select a notes file.' });
    const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
    let content = '';

    if (ext === 'pdf' || req.file.mimetype === 'application/pdf') {
      const parsed = await pdfParse(req.file.buffer);
      content = (parsed.text || '').trim();
    } else if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') {
      content = req.file.buffer.toString('utf8').trim();
    } else {
      return res.status(415).json({ error: 'DOC/DOCX upload is accepted by the interface, but this server version only extracts PDF and text notes. Please upload PDF or TXT/MD/CSV/JSON.' });
    }

    if (!content) return res.status(422).json({ error: 'The uploaded file contains no readable text.' });
    if (content.length > 200000) content = content.slice(0, 200000);

    const title = (req.body?.title || req.file.originalname.replace(/\.[^.]+$/, '')).trim();
    const note = await prisma.note.create({
      data: {
        userId: req.userId,
        title: title || 'Uploaded Notes',
        content,
        subject: req.body?.subject || null,
        grade: req.body?.grade || null
      }
    });
    res.status(201).json({ ...note, filename: req.file.originalname, extractedCharacters: content.length });
  } catch (error) {
    console.error('Error uploading note:', error);
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'File is too large. Maximum size is 15 MB.' : 'File upload failed.' });
    res.status(400).json({ error: error.message || 'Failed to process uploaded note.' });
  }
});

app.post('/api/notes', authenticate, async (req, res) => {
  try {
    const { title, content, subject, grade } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
    const note = await prisma.note.create({
      data: { userId: req.userId, title, content, subject, grade }
    });
    res.status(201).json(note);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

app.put('/api/notes/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, subject, grade } = req.body;
    const existingNote = await prisma.note.findUnique({ where: { id: id } });
    if (!existingNote) return res.status(404).json({ error: 'Note not found' });
    if (existingNote.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });
    const note = await prisma.note.update({
      where: { id: id },
      data: { title, content, subject, grade },
    });
    res.json(note);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

app.delete('/api/notes/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const existingNote = await prisma.note.findUnique({ where: { id: id } });
    if (!existingNote) return res.status(404).json({ error: 'Note not found' });
    if (existingNote.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });
    await prisma.note.delete({ where: { id: id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ============ ASSESSMENTS ROUTES ============
app.post('/api/assessments/generate', authenticate, async (req, res) => {
  try {
    const { title, type = 'test', subject, grade, topic, description = '' } = req.body || {};
    if (!title || !subject || !grade || !topic) {
      return res.status(400).json({ error: 'Title, subject, grade and topic are required.' });
    }

    const fallback = [
      { id: 'q1', type: 'multiple-choice', question: `Which statement best describes ${topic} in ${subject}?`, options: [`A correct definition or principle of ${topic}`, `An unrelated concept`, `A historical date only`, `A laboratory safety rule only`], answer: `A correct definition or principle of ${topic}`, marks: 2 },
      { id: 'q2', type: 'multiple-choice', question: `Which example correctly demonstrates ${topic}?`, options: [`A relevant example of ${topic}`, `An unrelated example`, `A contradiction of ${topic}`, `None of the above`], answer: `A relevant example of ${topic}`, marks: 2 },
      { id: 'q3', type: 'short-answer', question: `Define ${topic} and give two important points about it.`, answer: `A correct definition plus two relevant points about ${topic}.`, marks: 4 },
      { id: 'q4', type: 'short-answer', question: `Explain how ${topic} applies to a practical or everyday situation.`, answer: `A clear topic-specific explanation with a relevant example.`, marks: 5 },
      { id: 'q5', type: 'essay', question: `Discuss ${topic}. Include key concepts, examples and its importance in ${subject}.`, answer: `Award marks for accurate concepts, examples, explanation and relevance.`, marks: 7 }
    ];

    const prompt = `Create a ${type} assessment for a Zambian school. Return ONLY valid JSON, no markdown.\n` +
      `Subject: ${subject}\nGrade/Form: ${grade}\nSpecific topic: ${topic}\nTitle: ${title}\n` +
      `Instructions/context: ${description || 'Use the stated topic only.'}\n` +
      `Return exactly: {"description":"...","questions":[{"id":"q1","type":"multiple-choice|short-answer|essay","question":"...","options":["..."],"answer":"...","marks":2}]}\n` +
      `Create 5-10 questions. Questions MUST be specifically about ${topic}, not generic ${subject}. Include a mixture of question types. Use realistic school-level content. For multiple-choice use exactly four options. Include concise marking answers. Ensure the JSON is syntactically valid.`;

    let generated = null;
    try {
      generated = await generateDeepSeekJSON([
        { role: 'system', content: 'You are an expert Zambian secondary-school assessment setter. Output strict JSON only.' },
        { role: 'user', content: prompt }
      ], { max_tokens: 5000, temperature: 0.2 });
    } catch (aiError) {
      console.error('Assessment AI generation failed:', aiError?.message || aiError);
    }

    const questions = Array.isArray(generated?.questions) && generated.questions.length
      ? generated.questions.map((q, i) => ({
          id: q.id || `q${i + 1}`,
          type: ['multiple-choice', 'short-answer', 'essay'].includes(q.type) ? q.type : 'short-answer',
          question: String(q.question || `Explain ${topic}.`),
          options: q.type === 'multiple-choice' ? (Array.isArray(q.options) ? q.options.slice(0, 4) : fallback[0].options) : undefined,
          answer: String(q.answer || ''),
          marks: Math.max(1, Number(q.marks) || 5)
        }))
      : fallback;

    res.json({
      title, type, subject, grade, topic,
      description: generated?.description || description || `Assessment on ${topic}`,
      questions,
      maxScore: questions.reduce((sum, q) => sum + q.marks, 0),
      source: generated ? 'deepseek' : 'fallback'
    });
  } catch (error) {
    console.error('Assessment generation error:', error);
    res.status(500).json({ error: 'Failed to generate assessment.' });
  }
});

app.get('/api/assessments', authenticate, async (req, res) => {
  try {
    const assessments = await prisma.assessment.findMany({
      where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 20
    });
    res.json(assessments);
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
});

app.get('/api/assessments/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const assessment = await prisma.assessment.findUnique({ where: { id: id } });
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (assessment.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });
    res.json(assessment);
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
});

app.post('/api/assessments', authenticate, async (req, res) => {
  try {
    const { title, type, subject, grade, description, questions, maxScore } = req.body;
    if (!title || !type) return res.status(400).json({ error: 'Title and type are required' });
    const assessment = await prisma.assessment.create({
      data: {
        userId: req.userId, title, type, subject, grade, description,
        questions: questions || [], maxScore: maxScore || 0,
      }
    });
    res.status(201).json(assessment);
  } catch (error) {
    console.error('Error creating assessment:', error);
    res.status(500).json({ error: 'Failed to create assessment' });
  }
});

app.post('/api/assessments/:id/submit', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { score, answers } = req.body;
    const existingAssessment = await prisma.assessment.findUnique({ where: { id: id } });
    if (!existingAssessment) return res.status(404).json({ error: 'Assessment not found' });
    if (existingAssessment.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });
    const assessment = await prisma.assessment.update({
      where: { id: id },
      data: {
        score: score || 0,
        questions: answers || existingAssessment.questions,
        completedAt: new Date(),
      }
    });
    res.json(assessment);
  } catch (error) {
    console.error('Error submitting assessment:', error);
    res.status(500).json({ error: 'Failed to submit assessment' });
  }
});

app.delete('/api/assessments/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const existingAssessment = await prisma.assessment.findUnique({ where: { id: id } });
    if (!existingAssessment) return res.status(404).json({ error: 'Assessment not found' });
    if (existingAssessment.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });
    await prisma.assessment.delete({ where: { id: id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting assessment:', error);
    res.status(500).json({ error: 'Failed to delete assessment' });
  }
});

// ============ MANUAL PAYMENT ROUTES ============
const PLAN_CONFIG = {
  PRO: { amount: 150, role: 'PRO', schemesLimit: 100, lessonsLimit: 1000 },
  SCHOOL: { amount: 500, role: 'SCHOOL', schemesLimit: 1000, lessonsLimit: 10000 },
};

function normalizePlan(plan) {
  const value = String(plan || '').trim().toUpperCase();
  return PLAN_CONFIG[value] ? value : null;
}

function normalizeZambianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (/^260\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `260${digits.slice(1)}`;
  throw new Error('Invalid Zambian phone number. Use 0XXXXXXXXX or 260XXXXXXXXX.');
}

function createManualReference() {
  return `MT-MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function applySuccessfulPayment(payment) {
  const config = PLAN_CONFIG[payment.plan] || PLAN_CONFIG.PRO;
  await prisma.payment.update({
    where: { referenceId: payment.referenceId },
    data: { status: 'completed', completedAt: new Date() }
  });
  await prisma.user.update({
    where: { id: payment.userId },
    data: {
      role: config.role,
      schemesLimit: config.schemesLimit,
      lessonsLimit: config.lessonsLimit,
      subscriptionEndsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    }
  });
}

app.post('/api/payments/manual', authenticate, async (req, res) => {
  try {
    const { plan, phoneNumber, provider, transactionReference } = req.body;
    const normalizedPlan = normalizePlan(plan);
    if (!normalizedPlan) return res.status(400).json({ error: 'Invalid plan. Choose PRO or SCHOOL.' });

    const config = PLAN_CONFIG[normalizedPlan];
    let cleanPhone = '';
    try { cleanPhone = normalizeZambianPhone(phoneNumber); }
    catch (error) { return res.status(400).json({ error: error.message }); }

    const cleanProvider = String(provider || '').trim().toUpperCase();
    if (!['MTN', 'AIRTEL', 'ZAMTEL'].includes(cleanProvider)) {
      return res.status(400).json({ error: 'Choose MTN, Airtel or Zamtel.' });
    }

    const txRef = String(transactionReference || '').trim();
    if (!txRef || txRef.length < 3) {
      return res.status(400).json({ error: 'Enter the transaction/reference number from your mobile-money payment.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const duplicate = await prisma.payment.findFirst({ where: { externalId: txRef } });
    if (duplicate) return res.status(409).json({ error: 'That transaction reference has already been submitted.' });

    const referenceId = createManualReference();
    const transactionId = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const payment = await prisma.payment.create({
      data: {
        userId: req.userId,
        referenceId,
        transactionId,
        amount: config.amount,
        currency: 'ZMW',
        provider: cleanProvider.toLowerCase(),
        phoneNumber: cleanPhone,
        status: 'pending',
        externalId: txRef,
        plan: normalizedPlan,
      },
    });

    return res.status(201).json({
      success: true,
      paymentId: payment.id,
      referenceId,
      status: 'pending',
      amount: config.amount,
      plan: normalizedPlan,
      message: 'Payment notification received. We will verify your payment and activate your plan.',
    });
  } catch (error) {
    console.error('Manual payment submission error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to submit payment.' });
  }
});

app.get('/api/payments/history', authenticate, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 20,
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// ============ ADMIN ROUTES ============
const isAdmin = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId }, select: { role: true }
    });
    if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

app.get('/api/admin/payments/pending', authenticate, isAdmin, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 100,
      include: { user: { select: { fullName: true, email: true, school: true, phone: true } } },
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching pending payments:', error);
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
});

app.post('/api/admin/payments/:id/approve', authenticate, isAdmin, async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status === 'completed') return res.json({ success: true, message: 'Payment is already approved.' });
    if (payment.status !== 'pending') return res.status(400).json({ error: `Payment is already ${payment.status}.` });

    await applySuccessfulPayment(payment);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    res.json({ success: true, payment: updated, message: 'Payment approved and subscription activated for 90 days.' });
  } catch (error) {
    console.error('Error approving payment:', error);
    res.status(500).json({ error: error?.message || 'Failed to approve payment.' });
  }
});

app.post('/api/admin/payments/:id/reject', authenticate, isAdmin, async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status !== 'pending') return res.status(400).json({ error: `Payment is already ${payment.status}.` });

    const updated = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
    res.json({ success: true, payment: updated, message: 'Payment request rejected.' });
  } catch (error) {
    console.error('Error rejecting payment:', error);
    res.status(500).json({ error: error?.message || 'Failed to reject payment.' });
  }
});

app.get('/api/admin/stats', authenticate, isAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const activeSince = new Date(now.getTime() - 15 * 60 * 1000);

    const [
      totalUsers, totalLessons, totalSchemes, totalPayments,
      newUsersToday, lessonsToday, schemesToday, paymentsToday,
      completedRevenue, pendingModeration, activeUsers, proPayments, schoolPayments
    ] = await Promise.all([
      prisma.user.count(),
      prisma.lesson.count(),
      prisma.scheme.count(),
      prisma.payment.count(),
      prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.lesson.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.scheme.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.payment.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.payment.aggregate({ where: { status: 'completed' }, _sum: { amount: true } }),
      Promise.resolve(0),
      prisma.user.count({ where: { lastActive: { gte: activeSince } } }).catch(() => 0),
      prisma.payment.count({ where: { status: 'completed', plan: 'PRO' } }).catch(() => 0),
      prisma.payment.count({ where: { status: 'completed', plan: 'SCHOOL' } }).catch(() => 0)
    ]);

    res.json({
      stats: {
        totalUsers, totalLessons, totalSchemes, totalPayments,
        revenue: Number(completedRevenue?._sum?.amount || 0),
        totalRevenue: Number(completedRevenue?._sum?.amount || 0),
        newUsersToday, lessonsToday, schemesToday, paymentsToday,
        activeUsers, pendingModeration,
        systemHealth: 'Operational',
        uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
        proPayments, schoolPayments
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to load administrator statistics.' });
  }
});

app.get('/api/admin/users', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, fullName: true, email: true, school: true, province: true, district: true,
        role: true, lessonsUsed: true, lessonsLimit: true, schemesUsed: true, schemesLimit: true,
        createdAt: true, subscriptionEndsAt: true
      }
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/admin/users/detailed', authenticate, isAdmin, async (req, res) => {
  try {
    console.log('📊 Fetching detailed users...');
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, fullName: true, email: true, school: true, province: true, district: true,
        role: true, lessonsUsed: true, lessonsLimit: true, schemesUsed: true, schemesLimit: true,
        createdAt: true, subscriptionEndsAt: true, lastActive: true
      }
    });

    const formattedUsers = users.map(user => ({
      id: String(user.id || ''),
      fullName: String(user.fullName || ''),
      email: String(user.email || ''),
      school: String(user.school || ''),
      province: String(user.province || ''),
      district: String(user.district || ''),
      role: String(user.role || 'FREE'),
      lessonsUsed: Number(user.lessonsUsed || 0),
      lessonsLimit: Number(user.lessonsLimit || 5),
      schemesUsed: Number(user.schemesUsed || 0),
      schemesLimit: Number(user.schemesLimit || 3),
      createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
      subscriptionEndsAt: user.subscriptionEndsAt ? user.subscriptionEndsAt.toISOString() : null,
      lastActive: user.lastActive ? user.lastActive.toISOString() : new Date().toISOString(),
      totalLessons: 0, totalSchemes: 0, totalPayments: 0, totalNotes: 0, totalAssessments: 0,
      lessons: Number(user.lessonsUsed || 0),
      schemes: Number(user.schemesUsed || 0),
      payments: 0, notes: 0, assessments: 0
    }));

    console.log(`✅ Found ${formattedUsers.length} users`);
    res.json({ success: true, users: formattedUsers, total: formattedUsers.length });
  } catch (error) {
    console.error('❌ Error fetching detailed users:', error);
    res.json({ success: false, users: [], total: 0, error: error.message });
  }
});

app.get('/api/admin/users/:id/stats', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, fullName: true, email: true, school: true, province: true, district: true,
        role: true, lessonsUsed: true, lessonsLimit: true, schemesUsed: true, schemesLimit: true,
        createdAt: true, subscriptionEndsAt: true, lastActive: true
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const recentLessons = await prisma.lesson.findMany({
      where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 5,
      select: { id: true, topic: true, subject: true, grade: true, createdAt: true }
    }).catch(() => []);

    const recentPayments = await prisma.payment.findMany({
      where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 5,
      select: { id: true, amount: true, status: true, createdAt: true, plan: true }
    }).catch(() => []);

    const recentSchemes = await prisma.scheme.findMany({
      where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 5,
      select: { id: true, subject: true, grade: true, term: true, createdAt: true }
    }).catch(() => []);

    res.json({
      user: { ...user, _count: undefined },
      stats: {
        totalLessons: Number(user.lessonsUsed || 0),
        totalSchemes: Number(user.schemesUsed || 0),
        totalPayments: 0, totalNotes: 0, totalAssessments: 0
      },
      recentLessons: recentLessons.map(l => ({
        id: String(l.id || ''), topic: String(l.topic || ''), subject: String(l.subject || ''),
        grade: String(l.grade || ''), createdAt: l.createdAt ? l.createdAt.toISOString() : new Date().toISOString()
      })),
      recentPayments: recentPayments.map(p => ({
        id: String(p.id || ''), amount: Number(p.amount || 0), status: String(p.status || 'pending'),
        createdAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(), plan: String(p.plan || 'PRO')
      })),
      recentSchemes: recentSchemes.map(s => ({
        id: String(s.id || ''), subject: String(s.subject || ''), grade: String(s.grade || ''),
        term: String(s.term || ''), createdAt: s.createdAt ? s.createdAt.toISOString() : new Date().toISOString()
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics', details: error.message });
  }
});

app.get('/api/admin/system/stats', authenticate, isAdmin, async (req, res) => {
  try {
    console.log('📊 Fetching system stats...');
    const totalUsers = Number(await prisma.user.count().catch(() => 0));
    const totalLessons = Number(await prisma.lesson.count().catch(() => 0));
    const totalSchemes = Number(await prisma.scheme.count().catch(() => 0));
    const totalPayments = Number(await prisma.payment.count().catch(() => 0));
    const totalNotes = Number(await prisma.note.count().catch(() => 0));
    const totalAssessments = Number(await prisma.assessment.count().catch(() => 0));

    const revenueResult = await prisma.payment.aggregate({
      where: { status: 'completed' }, _sum: { amount: true }
    }).catch(() => ({ _sum: { amount: 0 } }));
    const totalRevenue = Number(revenueResult?._sum?.amount || 0);

    const freeUsers = Number(await prisma.user.count({ where: { role: 'FREE' } }).catch(() => 0));
    const proUsers = Number(await prisma.user.count({ where: { role: 'PRO' } }).catch(() => 0));
    const schoolUsers = Number(await prisma.user.count({ where: { role: 'SCHOOL' } }).catch(() => 0));
    const adminUsers = Number(await prisma.user.count({ where: { role: 'ADMIN' } }).catch(() => 0));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsersLast30Days = Number(await prisma.user.count({
      where: { createdAt: { gte: thirtyDaysAgo } }
    }).catch(() => 0));

    const recentUsers = await prisma.user.findMany({
      take: 10, orderBy: { createdAt: 'desc' },
      select: { id: true, fullName: true, email: true, school: true, role: true, createdAt: true, lessonsUsed: true, schemesUsed: true }
    }).catch(() => []);

    const formattedRecentUsers = recentUsers.map(user => ({
      id: String(user.id || ''), fullName: String(user.fullName || ''),
      email: String(user.email || ''), school: String(user.school || ''),
      role: String(user.role || 'FREE'),
      createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
      lessonsUsed: Number(user.lessonsUsed || 0), schemesUsed: Number(user.schemesUsed || 0)
    }));

    res.json({
      totals: { users: totalUsers, lessons: totalLessons, schemes: totalSchemes, payments: totalPayments, notes: totalNotes, assessments: totalAssessments, revenue: totalRevenue },
      growth: { newUsersLast30Days },
      subscriptions: { free: freeUsers, pro: proUsers, school: schoolUsers, admin: adminUsers },
      recent: { users: formattedRecentUsers, lessons: [], payments: [] }
    });
  } catch (error) {
    console.error('❌ Error fetching system stats:', error);
    res.json({
      totals: { users: 0, lessons: 0, schemes: 0, payments: 0, notes: 0, assessments: 0, revenue: 0 },
      growth: { newUsersLast30Days: 0 },
      subscriptions: { free: 0, pro: 0, school: 0, admin: 0 },
      recent: { users: [], lessons: [], payments: [] }
    });
  }
});

app.put('/api/admin/users/:id/role', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!['FREE', 'PRO', 'SCHOOL', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be FREE, PRO, SCHOOL, or ADMIN' });
    }
    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, fullName: true, email: true, role: true }
    });
    res.json(user);
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

app.get('/api/admin/lessons', authenticate, isAdmin, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      take: 50, orderBy: { createdAt: 'desc' },
      include: { user: { select: { fullName: true, email: true, school: true } } }
    });
    res.json(lessons);
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

app.get('/api/admin/schemes', authenticate, isAdmin, async (req, res) => {
  try {
    const schemes = await prisma.scheme.findMany({
      take: 50, orderBy: { createdAt: 'desc' },
      include: { user: { select: { fullName: true, email: true, school: true } } }
    });
    res.json(schemes);
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ error: 'Failed to fetch schemes' });
  }
});

app.get('/api/admin/payments', authenticate, isAdmin, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      take: 50, orderBy: { createdAt: 'desc' },
      include: { user: { select: { fullName: true, email: true } } }
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

app.delete('/api/admin/users/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.userId) return res.status(400).json({ error: 'Cannot delete your own account' });
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await prisma.user.delete({ where: { id } });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.get('/api/admin/health', authenticate, isAdmin, async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    let deepseekStatus = 'unknown';
    try {
      await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5
      });
      deepseekStatus = 'healthy';
    } catch (error) {
      deepseekStatus = 'unhealthy';
    }
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: { database: 'connected', deepseek: deepseekStatus, manualPayments: 'enabled' },
      memory: process.memoryUsage(),
      version: process.version
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// ============ GET ROUTES ============
app.get('/api/lessons', authenticate, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 20
    });
    res.json(lessons);
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

app.get('/api/lessons/mine', authenticate, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 20
    });
    res.json(lessons);
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

app.get('/api/schemes', authenticate, async (req, res) => {
  try {
    const schemes = await prisma.scheme.findMany({
      where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 10
    });
    res.json(schemes);
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ error: 'Failed to fetch schemes' });
  }
});

app.get('/api/schemes/mine', authenticate, async (req, res) => {
  try {
    const schemes = await prisma.scheme.findMany({
      where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 10
    });
    res.json(schemes);
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ error: 'Failed to fetch schemes' });
  }
});

// ============ CURRICULUM CATALOG API ============
app.get('/api/curriculum/subjects', async (req, res) => {
  try {
    const curriculum = String(req.query.curriculum || 'cbc').toLowerCase();
    const grade = String(req.query.grade || '');
    const term = String(req.query.term || '');
    const localSources = listCurriculumSources({ curriculum, grade, term });
    const catalog = catalogSubjects();
    let cdcSubjects = [];
    if (curriculum === 'cbc' && grade) {
      try {
        const { getSubjectCatalog } = require('./utils/cdcLibrary');
        cdcSubjects = await getSubjectCatalog({ grade });
      } catch (error) {
        console.warn(`⚠️ CDC subject catalog unavailable: ${error.message}`);
      }
    }
    const subjects = [...new Set([...catalog, ...localSources.map((s) => s.subject).filter(Boolean), ...cdcSubjects])].sort();
    const sourceBySubject = {};
    for (const source of localSources) sourceBySubject[source.subject] = true;
    if (curriculum === 'cbc') {
      for (const subject of subjects) {
        if (getRegisteredOfficialSource(subject)) sourceBySubject[subject] = true;
      }
    }
    res.json({
      curriculum, grade, term, subjects,
      sources: localSources,
      sourceAvailability: Object.fromEntries(subjects.map((s) => [s, Boolean(sourceBySubject[s])]))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load curriculum subjects' });
  }
});

app.get('/api/curriculum/topics', async (req, res) => {
  try {
    const curriculum = String(req.query.curriculum || 'cbc').toLowerCase();
    const grade = String(req.query.grade || '');
    const subject = String(req.query.subject || '');
    const term = String(req.query.term || '');
    let sources = listCurriculumSources({ curriculum, grade, subject, term });
    let rows = listCurriculumRows({ curriculum, grade, subject, term });
    if (curriculum === 'cbc') {
      try {
        const cdcResources = await listCDCResources({ grade, subject, term });
        const cdcRows = await loadCDCRows({ grade, subject, term });
        if (cdcResources.length || cdcRows.length) {
          sources = cdcResources.length
            ? cdcResources.map((r) => ({ curriculum: 'cbc', subject, grade, term, sourceType: 'cdc_digital_library', sourceBasis: 'CDC Digital Library — Curriculum Development Centre, Ministry of Education, Zambia', officialSource: r.url, title: r.title, file: `cdc:${r.id}` }))
            : [{ curriculum: 'cbc', subject, grade, term, sourceType: 'ministry_dcd_syllabus', sourceBasis: 'Ministry of Education, Directorate of Curriculum Development — finalized syllabus', officialSource: cdcRows[0]?.officialSource || '', title: cdcRows[0]?.cdcResourceTitle || `${subject} ${grade} finalized syllabus`, file: 'ministry:dcd' }];
          rows = cdcRows.map((r) => ({ ...r, _source: { subject, grade, term, sourceType: r.sourceType || (cdcResources.length ? 'cdc_digital_library' : 'ministry_dcd_syllabus'), sourceBasis: r.sourceBasis || (cdcResources.length ? 'CDC Digital Library — Curriculum Development Centre, Ministry of Education, Zambia' : 'Ministry of Education, Directorate of Curriculum Development — finalized syllabus'), officialSource: r.cdcResourceUrl || r.officialSource || '', file: `${cdcResources.length ? 'cdc' : 'ministry'}:${r.cdcResourceTitle || ''}` } }));
        }
      } catch (error) { console.warn(`⚠️ CDC topics unavailable: ${error.message}`); }
    }
    const topics = [...new Set(rows.map((r) => r.topic).filter(Boolean))];
    const subtopics = [...new Set(rows.map((r) => r.subTopic || r.subtopic).filter(Boolean))];
    res.json({
      curriculum, grade, subject, term,
      hasLocalSource: sources.length > 0,
      hasCDCSource: sources.some(s => s.sourceType === 'cdc_digital_library'),
      sourceStatus: sources.some(s => s.sourceType === 'cdc_digital_library') ? 'VERIFIED_CDC_LIBRARY_AVAILABLE' : (sources.length ? 'VERIFIED_LOCAL_PACK_AVAILABLE' : 'NO_CDC_SOURCE'),
      topics, subtopics, rows, sources
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load curriculum topics' });
  }
});

app.get('/api/curriculum/status', async (req, res) => {
  try {
    const curriculum = String(req.query.curriculum || 'cbc').toLowerCase();
    const grade = String(req.query.grade || '');
    const subject = String(req.query.subject || '');
    const term = String(req.query.term || '');
    let sources = listCurriculumSources({ curriculum, grade, subject, term });
    let cdcResources = [];
    if (curriculum === 'cbc') {
      try { cdcResources = await listCDCResources({ grade, subject, term }); } catch (error) { console.warn(`⚠️ CDC status lookup failed: ${error.message}`); }
      if (cdcResources.length) sources = cdcResources.map(r => ({ curriculum: 'cbc', subject, grade, term, sourceType: 'cdc_digital_library', title: r.title, officialSource: r.url, file: `cdc:${r.id}` }));
    }
    const officialSource = curriculum === 'cbc' ? getRegisteredOfficialSource(subject) : null;
    const status = curriculum === 'cbc'
      ? (cdcResources.length ? 'VERIFIED_CDC_LIBRARY_AVAILABLE' : (sources.length ? 'VERIFIED_LOCAL_PACK_AVAILABLE' : (officialSource ? 'OFFICIAL_SOURCE_REGISTERED_NO_LOCAL_PACK' : 'NO_CDC_SOURCE')))
      : 'OBC_MODE';
    res.json({
      curriculum, grade, subject, term, status, sources, cdcResources,
      officialSource: officialSource || null,
      references: curriculum === 'cbc' ? getReferenceTitles({ subject, grade, term }) : []
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load curriculum status' });
  }
});

// ============ START SERVER ============
function plannerSafe(v) { return String(v ?? ''); }
function plannerCell(text, bold=false, size=18) {
  return new TableCell({ children: [new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new TextRun({ text: plannerSafe(text), bold, font: 'Times New Roman', size })]
  })] });
}
function plannerPayload(body) {
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  return {
    title: body?.title || 'Term Planning Document',
    subject: body?.subject || '', grade: body?.grade || '',
    term: body?.term || '', year: body?.year || new Date().getFullYear(),
    teacher: body?.teacher || '', school: body?.school || '', rows
  };
}
function plannerDocx(data, type) {
  const isForecast = type === 'weekly-forecast';
  const title = isForecast ? 'WEEKLY FORECAST' : 'RECORD OF WORK';
  const headers = isForecast
    ? ['WK','UNIT','DAY','TOPIC/SUB-TOPIC','LEARNING OUTCOMES','TEACHING METHODS','T/L AIDS','REFERENCES','COMMENTS']
    : ['WEEK','DATE','TOPIC','SUB-TOPIC','WORK COVERED','REMARKS'];
  const keys = isForecast
    ? ['week','unit','day','topicSubtopic','learningOutcomes','teachingMethods','aids','references','comments']
    : ['week','date','topic','subTopic','workCovered','remarks'];
  const rows = [new TableRow({ children: headers.map(h => plannerCell(h, true, 16)) })];
  for (const row of data.rows) rows.push(new TableRow({ children: keys.map(k => plannerCell(row?.[k] ?? '', false, 15)) }));
  return new Document({ sections: [{ properties: { page: { size: { width: 16838, height: 11906, orientation: 'landscape' }, margin: { top: 450, right: 450, bottom: 450, left: 450 } } }, children: [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text:'REPUBLIC OF ZAMBIA', bold:true, font:'Times New Roman', size:20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text:'MINISTRY OF EDUCATION', bold:true, font:'Times New Roman', size:22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: data.school.toUpperCase(), bold:true, font:'Times New Roman', size:20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text:title, bold:true, font:'Times New Roman', size:22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text:`SUBJECT: ${data.subject.toUpperCase()}    GRADE/FORM: ${data.grade}    TERM: ${data.term}    YEAR: ${data.year}`, bold:true, font:'Times New Roman', size:17 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text:`TEACHER: ${data.teacher}`, font:'Times New Roman', size:17 })] }),
    new Table({ width:{size:100,type:WidthType.PERCENTAGE}, rows })
  ] }] });
}
function plannerPdf(data, type, res) {
  const isForecast = type === 'weekly-forecast';
  const title = isForecast ? 'WEEKLY FORECAST' : 'RECORD OF WORK';
  const headers = isForecast ? ['WK','UNIT','DAY','TOPIC/SUB-TOPIC','LEARNING OUTCOMES','TEACHING METHODS','T/L AIDS','REFERENCES','COMMENTS'] : ['WEEK','DATE','TOPIC','SUB-TOPIC','WORK COVERED','REMARKS'];
  const keys = isForecast ? ['week','unit','day','topicSubtopic','learningOutcomes','teachingMethods','aids','references','comments'] : ['week','date','topic','subTopic','workCovered','remarks'];
  const doc = new PDFDocument({ size:'A3', layout:'landscape', margin:28 });
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}_${String(data.subject||'document').replace(/[^a-z0-9_-]/gi,'_')}_${data.term||''}_${data.year||''}.pdf"`);
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(15).text('REPUBLIC OF ZAMBIA',{align:'center'});
  doc.fontSize(14).text('MINISTRY OF EDUCATION',{align:'center'});
  doc.fontSize(14).text(data.school || '',{align:'center'});
  doc.fontSize(15).text(title,{align:'center'});
  doc.fontSize(10).text(`SUBJECT: ${data.subject}    GRADE/FORM: ${data.grade}    TERM: ${data.term}    YEAR: ${data.year}    TEACHER: ${data.teacher}`,{align:'center'});
  doc.moveDown(.5);
  const totalW=doc.page.width-56, widths=headers.map((_,i)=> totalW/headers.length);
  let y=doc.y; const lineH=30;
  const cell=(x,w,h,t,b=false)=>{doc.rect(x,y,w,h).stroke();doc.font(b?'Helvetica-Bold':'Helvetica').fontSize(6.5).text(plannerSafe(t),x+2,y+3,{width:w-4,height:h-6,ellipsis:true});};
  let x=28; headers.forEach((h,i)=>{cell(x,widths[i],lineH,h,true);x+=widths[i]}); y+=lineH;
  for(const row of data.rows){
    const vals=keys.map(k=>row?.[k]??'');
    const h=Math.max(26, Math.min(95, ...vals.map((v,i)=>Math.ceil(plannerSafe(v).length/Math.max(12,Math.floor(widths[i]/4.3)))*7+10)));
    if(y+h>doc.page.height-35){doc.addPage();y=28;x=28;headers.forEach((h2,i)=>{cell(x,widths[i],lineH,h2,true);x+=widths[i]});y+=lineH;}
    x=28; vals.forEach((v,i)=>{cell(x,widths[i],h,v,false);x+=widths[i]}); y+=h;
  }
  doc.end();
}

app.post('/api/planner/export/:type/word', authenticate, async (req,res)=>{
  try {
    const type=req.params.type;
    if(!['record-of-work','weekly-forecast'].includes(type)) return res.status(400).json({error:'Invalid planner type'});
    const data=plannerPayload(req.body);
    const buffer=await Packer.toBuffer(plannerDocx(data,type));
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition',`attachment; filename="${type}_${String(data.subject||'document').replace(/[^a-z0-9_-]/gi,'_')}_${data.term||''}_${data.year||''}.docx"`);
    res.send(buffer);
  } catch(e){ console.error('Planner Word export error:',e); res.status(500).json({error:'Failed to export editable Word document'}); }
});

app.post('/api/planner/export/:type/pdf', authenticate, async (req,res)=>{
  try {
    const type=req.params.type;
    if(!['record-of-work','weekly-forecast'].includes(type)) return res.status(400).json({error:'Invalid planner type'});
    plannerPdf(plannerPayload(req.body),type,res);
  } catch(e){ console.error('Planner PDF export error:',e); if(!res.headersSent) res.status(500).json({error:'Failed to export PDF'}); }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Auth routes available at /api/auth/*`);
  console.log(`✅ Lesson generation available at /api/lessons/generate`);
  console.log(`✅ Scheme generation available at /api/schemes/generate`);
  console.log(`✅ Scheme export available at /api/schemes/export/:id/:format`);
  console.log(`✅ Notes routes available at /api/notes`);
  console.log(`✅ Assessments routes available at /api/assessments`);
  console.log(`✅ Payment routes available at /api/payments/*`);
  console.log(`✅ Admin routes available at /api/admin/*`);
  console.log(`✅ DeepSeek AI integration enabled`);
  console.log(`✅ Manual payment verification enabled`);
  console.log(`✅ CORS enabled for Vercel and Render frontend`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  prisma.$disconnect();
  process.exit(0);
});
