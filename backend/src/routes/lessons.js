const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// ✅ SET TO FALSE TO USE DEEPSEEK
const ALLOW_MOCK_GENERATION = false;

const prisma = new PrismaClient();

let OpenAI;
try {
  OpenAI = require('openai');
} catch (error) {
  console.log('⚠️ OpenAI package not installed');
}

let deepseekClient = null;
if (OpenAI && process.env.DEEPSEEK_API_KEY) {
  deepseekClient = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com/v1"
  });
  console.log('✅ DeepSeek client configured');
} else {
  console.log('⚠️ DeepSeek not configured');
}

// ============ HELPERS ============

function cleanAndParseJson(content) {
  if (typeof content !== 'string') throw new Error('AI response was not text');
  let cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(cleaned); } catch (e) {
    throw new Error(`Invalid JSON from AI: ${e.message}`);
  }
}

function ensureOBCDevelopment(lesson, topic) {
  const rows = Array.isArray(lesson?.lessonDevelopment) ? lesson.lessonDevelopment : [];
  const validRows = rows.filter((row) => row && typeof row === 'object').map((row) => ({
    time: String(row.time || '').trim(),
    learningPoints: String(row.learningPoints || '').trim(),
    teacherActivities: String(row.teacherActivities || '').trim(),
    pupilActivities: String(row.pupilActivities || '').trim(),
  })).filter((row) => row.time || row.learningPoints || row.teacherActivities || row.pupilActivities);

  if (validRows.length >= 4 && validRows.every((row) => row.learningPoints && row.teacherActivities && row.pupilActivities)) {
    return validRows;
  }

  // Guarantee an exportable OBC table even when the AI returns an incomplete array.
  return [
    { time: '10 min', learningPoints: `Meaning, characteristics and examples of ${topic}`, teacherActivities: `Introduce ${topic} using a familiar example, state the lesson outcome and ask focused questions about ${topic}.`, pupilActivities: `Discuss the example, define ${topic} in their own words and give one relevant example.` },
    { time: '15 min', learningPoints: `Key concepts, components or stages of ${topic}`, teacherActivities: `Guide learners through the key concepts or stages of ${topic} with a board illustration, examples and probing questions.`, pupilActivities: `Observe the illustration, identify the key parts or stages of ${topic}, discuss them in pairs and record the main points.` },
    { time: '15 min', learningPoints: `Application and practice of ${topic}`, teacherActivities: `Give a topic-specific classification, calculation, diagram, demonstration or problem-solving task on ${topic}, then facilitate group work.`, pupilActivities: `Work individually or in groups to complete the task on ${topic}, compare answers and explain their reasoning.` },
    { time: '10 min', learningPoints: `Summary, misconceptions and assessment of ${topic}`, teacherActivities: `Ask short topic-specific assessment questions, correct misconceptions and summarise the essential points about ${topic}.`, pupilActivities: `Answer the assessment questions, correct their work and state the key points learned about ${topic}.` },
  ];
}

function buildCBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return `You are an expert Zambian teacher preparing a Competence Based Curriculum (CBC) lesson plan.
Create ONE lesson for ${grade} ${subject} specifically on the exact topic: "${topic}".
Do not use generic placeholders. Every outcome, activity, assessment and progression step must explicitly teach, practise or assess ${topic}.
Use age-appropriate Zambian classroom practice and CBC language. Include learner-centred activities, competencies, values and formative assessment.
Return ONLY one valid JSON object. No markdown and no commentary.
Required shape:
{
  "title":"${topic}", "grade":"${grade}", "subject":"${subject}", "topic":"${topic}",
  "generalCompetences":["..."], "specificCompetence":"...", "lessonGoal":"...", "rationale":"...",
  "priorKnowledge":"...", "references":["..."], "learningEnvironment":"...", "materials":["..."],
  "expectedStandard":"...",
  "lessonProgression":[
    {"stage":"INTRODUCTION","time":"5 min","teacherRole":"...","learnerRole":"...","assessmentCriteria":"..."},
    {"stage":"DEVELOPMENT","time":"15 min","teacherRole":"...","learnerRole":"...","assessmentCriteria":"..."},
    {"stage":"PRACTICE/APPLICATION","time":"15 min","teacherRole":"...","learnerRole":"...","assessmentCriteria":"..."},
    {"stage":"CONCLUSION","time":"5 min","teacherRole":"...","learnerRole":"...","assessmentCriteria":"..."}
  ],
  "homework":"...", "lessonEvaluation":"..."
}
Make the progression activities concrete and topic-specific. Do not write phrases such as "explain concepts", "research the topic", or "understand the topic" without specifying what about ${topic}.`;
}

function buildOBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return `You are an expert Zambian teacher preparing an Objective Based Curriculum (OBC) lesson plan.
Create ONE lesson for ${grade} ${subject} specifically on the exact topic: "${topic}".
The lesson development table MUST contain detailed, topic-specific learning points, teacher activities and pupil activities. Do not use generic placeholders.
Return ONLY one valid JSON object. No markdown and no commentary.
Required shape:
{
  "title":"${topic}", "grade":"${grade}", "subject":"${subject}", "topic":"${topic}",
  "references":["..."], "teachingAids":["..."], "rationale":"...",
  "learningOutcomes":["By the end of the lesson, pupils should be able to ..."],
  "lessonDevelopment":[
    {"time":"10 min","learningPoints":"A precise point about ${topic}","teacherActivities":"A concrete teacher action using ${topic}","pupilActivities":"A concrete pupil action demonstrating ${topic}"},
    {"time":"15 min","learningPoints":"...","teacherActivities":"...","pupilActivities":"..."},
    {"time":"15 min","learningPoints":"...","teacherActivities":"...","pupilActivities":"..."},
    {"time":"10 min","learningPoints":"...","teacherActivities":"...","pupilActivities":"..."}
  ],
  "learnersEvaluation":["...","..."]
}
All rows must directly relate to ${topic}. Avoid generic text such as "Introduction", "Explain", "Listen", or "Research the topic" unless the action also states the exact ${topic} content.`;
}

// ============ MOCK FUNCTIONS ============

function generateCBCMockLesson(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return {
    title: topic,
    grade,
    subject,
    topic: topic,
    subtopic: '',
    teacherName,
    school: schoolName,
    province,
    district,
    date: new Date().toISOString().split('T')[0],
    time: "10:20-11:00",
    duration: "40 min",
    classSize: size,
    boys,
    girls,
    generalCompetences: ["Analytical thinking", "Collaboration", "Communication"],
    specificCompetence: `Understand ${topic}`,
    lessonGoal: `By the end of this lesson, learners will understand ${topic}`,
    rationale: `${topic} is important for learners`,
    priorKnowledge: "Basic knowledge",
    references: ["Textbook"],
    learningEnvironment: "Classroom",
    materials: ["Whiteboard", "Markers"],
    expectedStandard: "Understanding of the topic",
    lessonProgression: [
      { stage: "INTRODUCTION", time: "5 min", teacherRole: `Elicit prior knowledge and introduce the key idea of ${topic} using a question or real example.`, learnerRole: `Respond to questions and state what they already know about ${topic}.`, assessmentCriteria: `Correctly identifies a relevant prior idea about ${topic}.` },
      { stage: "DEVELOPMENT", time: "15 min", teacherRole: `Guide learners through the main concepts, processes or features of ${topic} using examples.`, learnerRole: `Discuss, observe examples and record the key points about ${topic}.`, assessmentCriteria: `Explains at least two accurate points about ${topic}.` },
      { stage: "PRACTICE/APPLICATION", time: "15 min", teacherRole: `Facilitate a learner-centred task requiring application of ${topic}.`, learnerRole: `Work individually or in groups to apply knowledge of ${topic} to a task/problem.`, assessmentCriteria: `Applies the concept of ${topic} correctly in the task.` },
      { stage: "CONCLUSION", time: "5 min", teacherRole: `Review the main learning points about ${topic} and correct misconceptions.`, learnerRole: `Summarise what was learned about ${topic} and answer exit questions.`, assessmentCriteria: `Gives an accurate summary of ${topic}.` }
    ],
    homework: "Research the topic",
    lessonEvaluation: "Successful",
    curriculum: 'cbc',
    objectives: [`Understand ${topic}`],
    development: ['Introduction', 'Main Activity', 'Conclusion'],
    activities: ['Group work', 'Discussion'],
    assessment: 'Observation',
    curriculumCodes: ['CBC-001']
  };
}

function generateOBCMockLesson(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return {
    title: topic,
    grade,
    subject,
    topic: topic,
    subtopic: '',
    teacherName,
    school: schoolName,
    province,
    district,
    date: new Date().toISOString().split('T')[0],
    duration: "80 MINUTES",
    classSize: size,
    boys,
    girls,
    references: ["Reference 1", "Reference 2"],
    teachingAids: ["Chart", "Whiteboard"],
    rationale: `${topic} is important`,
    learningOutcomes: ["Outcome 1", "Outcome 2"],
    lessonDevelopment: ensureOBCDevelopment({ lessonDevelopment: [] }, topic),
    learnersEvaluation: ["Question 1", "Question 2"],
    teacherEvaluation: "Successful",
    curriculum: 'obc',
    objectives: [`Understand ${topic}`],
    development: ['Introduction', 'Main Activity'],
    activities: ['Group work'],
    assessment: 'Observation',
    curriculumCodes: ['OBC-001']
  };
}

// ============ AUTHENTICATION ============

const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ============ CHECK LESSON LIMIT ============

const checkLessonLimit = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  const now = new Date();
  const lastReset = new Date(user.lastResetAt);
  
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    await prisma.user.update({
      where: { id: userId },
      data: { lessonsUsed: 0, lastResetAt: now }
    });
    const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
    return { allowed: true, remaining: updatedUser.lessonsLimit };
  }

  if (user.role === 'PRO' || user.role === 'SCHOOL') {
    return { allowed: true, remaining: 'Unlimited' };
  }

  if (user.lessonsUsed >= user.lessonsLimit) {
    return { allowed: false, remaining: 0, message: 'Lesson limit reached. Upgrade to Pro!' };
  }

  return { allowed: true, remaining: user.lessonsLimit - user.lessonsUsed };
};

// ============ GENERATE LESSON ============

router.post('/generate', authenticate, async (req, res) => {
  try {
    const { grade, subject, topic, classSize, curriculum } = req.body;
    const size = parseInt(classSize) || 40;
    const boys = Math.floor(size * 0.45);
    const girls = size - boys;

    if (!grade || !subject || !topic) {
      return res.status(400).json({ error: 'Grade, subject, and topic are required' });
    }

    const limitCheck = await checkLessonLimit(req.userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({ error: limitCheck.message });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { fullName: true, school: true, province: true, district: true }
    });

    const teacherName = user?.fullName || 'MR/MRS';
    const schoolName = user?.school || 'KASHINAKAZHI SECONDARY SCHOOL';
    const province = user?.province || 'Southern';
    const district = user?.district || 'Itezhi-Tezhi';

    const curriculumType = curriculum || 'cbc';

    let lessonData;
    let useMock = true;

    if (deepseekClient && !ALLOW_MOCK_GENERATION) {
      try {
        const prompt = curriculumType === 'obc' 
          ? buildOBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district)
          : buildCBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district);

        console.log('📝 Calling DeepSeek API...');

        const completion = await deepseekClient.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "You are an expert Zambian teacher. Always return valid JSON only." },
            { role: "user", content: prompt }
          ],
          temperature: 0.4,
          max_tokens: 3000,
          response_format: { type: "json_object" }
        });

        console.log('📝 DeepSeek response received');

        try {
          const rawContent = completion.choices[0].message.content;
          lessonData = cleanAndParseJson(rawContent);
          if (curriculumType === 'obc') {
            lessonData.lessonDevelopment = ensureOBCDevelopment(lessonData, topic);
          }
          useMock = false;
          console.log('✅ DeepSeek response parsed successfully');
        } catch (parseError) {
          console.log('⚠️ Failed to parse DeepSeek response:', parseError.message);
          useMock = true;
        }
      } catch (error) {
        console.error('❌ DeepSeek API error:', error.message);
        useMock = true;
      }
    } else {
      console.log('📝 Using mock mode');
      useMock = true;
    }

    if (useMock) {
      console.log('📝 Generating mock lesson');
      lessonData = curriculumType === 'obc'
        ? generateOBCMockLesson(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district)
        : generateCBCMockLesson(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district);
    }

    if (curriculumType === 'obc') {
      lessonData.lessonDevelopment = ensureOBCDevelopment(lessonData, topic);
    }

    // Save to database
    const lesson = await prisma.lesson.create({
      data: {
        id: `lesson-${Date.now()}`,
        userId: req.userId,
        grade: lessonData.grade || grade,
        subject: lessonData.subject || subject,
        topic: lessonData.topic || topic,
        subtopic: lessonData.subtopic || '',
        title: lessonData.title || lessonData.topic || topic,
        classSize: lessonData.classSize || size,
        duration: lessonData.duration || '40 min',
        curriculum: lessonData.curriculum || curriculumType,
        objectives: lessonData.objectives || [],
        development: lessonData.development || [],
        activities: lessonData.activities || [],
        assessment: lessonData.assessment || '',
        curriculumCodes: lessonData.curriculumCodes || [],
        provinceContext: province || '',
        teacherName: teacherName || '',
        school: schoolName || '',
        province: province || '',
        district: district || '',
        date: lessonData.date || '',
        time: lessonData.time || '',
        boys: lessonData.boys || 0,
        girls: lessonData.girls || 0,
        generalCompetences: lessonData.generalCompetences || [],
        specificCompetence: lessonData.specificCompetence || '',
        lessonGoal: lessonData.lessonGoal || '',
        rationale: lessonData.rationale || '',
        priorKnowledge: lessonData.priorKnowledge || '',
        references: lessonData.references || [],
        learningEnvironment: lessonData.learningEnvironment || '',
        materials: lessonData.materials || [],
        expectedStandard: lessonData.expectedStandard || '',
        lessonProgression: lessonData.lessonProgression || [],
        homework: lessonData.homework || '',
        lessonEvaluation: lessonData.lessonEvaluation || '',
        learningOutcomes: lessonData.learningOutcomes || [],
        lessonDevelopment: lessonData.lessonDevelopment || [],
        learnersEvaluation: lessonData.learnersEvaluation || [],
        teachingAids: lessonData.teachingAids || [],
        teacherEvaluation: lessonData.teacherEvaluation || '',
      }
    });

    await prisma.user.update({
      where: { id: req.userId },
      data: { lessonsUsed: { increment: 1 } }
    });

    console.log(`✅ Lesson generated for user: ${req.userId} (${curriculumType})`);
    res.status(201).json(lesson);

  } catch (error) {
    console.error('❌ Generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate lesson', 
      details: error.message
    });
  }
});

// ============ GET LESSONS ============

router.get('/mine', authenticate, async (req, res) => {
  try {
    const userLessons = await prisma.lesson.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(userLessons);
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

module.exports = router;
