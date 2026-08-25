// src/server.js - Complete application with DeepSeek AI integration and Lipila payments
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

// ============ DEEPSEEK AI CLIENT ============
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com"
});

// ============ LIPILA PAYMENT SERVICE ============
class LipilaService {
  constructor() {
    this.apiKey = process.env.LIPILA_API_KEY || process.env.LIPIJA_API_KEY;
    const isSandbox = this.apiKey?.startsWith('lsk_');
    this.baseURL = isSandbox 
      ? 'https://sandbox-api.lipila.com' 
      : 'https://api.lipila.com';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async createCollection({ referenceId, amount, accountNumber, currency = 'ZMW', callbackUrl }) {
    try {
      const response = await this.client.post('/api/v1/collections', {
        referenceId,
        amount,
        accountNumber,
        currency,
        callbackUrl,
      });
      return response.data;
    } catch (error) {
      console.error('Lipila collection error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Payment initiation failed');
    }
  }

  async getTransactionStatus(referenceId) {
    try {
      const response = await this.client.get(`/api/v1/transactions/${referenceId}/status`);
      return response.data;
    } catch (error) {
      console.error('Status check error:', error.response?.data || error.message);
      throw new Error('Failed to check transaction status');
    }
  }

  async getBalance() {
    try {
      const response = await this.client.get('/api/v1/balance');
      return response.data;
    } catch (error) {
      console.error('Balance check error:', error.response?.data || error.message);
      throw new Error('Failed to get balance');
    }
  }
}

const lipilaService = new LipilaService();

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
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

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

// ============ JSON PARSING HELPER ============

function safeParseJSON(content) {
  try {
    if (!content) return null;
    
    let cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    cleaned = cleaned.replace(/'/g, '"');
    cleaned = cleaned.replace(/\\n/g, ' ');
    cleaned = cleaned.replace(/\\r/g, ' ');
    cleaned = cleaned.replace(/\\t/g, ' ');
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
    cleaned = cleaned.replace(/(\{|\,)\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
    
    let openBraces = (cleaned.match(/\{/g) || []).length;
    let closeBraces = (cleaned.match(/\}/g) || []).length;
    let openBrackets = (cleaned.match(/\[/g) || []).length;
    let closeBrackets = (cleaned.match(/\]/g) || []).length;
    
    while (closeBraces < openBraces) {
      cleaned += '}';
      closeBraces++;
    }
    while (closeBrackets < openBrackets) {
      cleaned += ']';
      closeBrackets++;
    }
    
    return JSON.parse(cleaned);
  } catch (error) {
    console.log('⚠️ JSON parse failed, using fallback');
    return null;
  }
}

// ============ AUTH ROUTES ============

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, school, province, district, grades, subjects } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash: hashedPassword,
        school,
        province,
        district,
        grades: grades || [],
        subjects: subjects || [],
        role: 'FREE',
        lastActive: new Date(),
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
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

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
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ============ ENHANCED FALLBACK LESSON GENERATOR (CBC & OBC) ============

function generateFallbackLesson(topic, grade, subject, classSize, curriculumType, user) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;
  
  if (curriculumType === 'obc') {
    // ============ OBC FALLBACK ============
    return {
      title: topic,
      grade: grade,
      subject: subject,
      teacherName: user?.fullName || 'MR/MRS',
      school: user?.school || 'KASHINAKAZHI SECONDARY SCHOOL',
      date: new Date().toISOString().split('T')[0],
      duration: '80 MINUTES',
      classSize: size,
      boys: boys,
      girls: girls,
      subtopic: '',
      references: [
        `Progress in ${subject} Grade ${grade} pg 78`,
        `${subject} Grade ${grade} Textbook`,
        "Teacher's Guide"
      ],
      teachingAids: ["Learners book", "Chalk board", "Chart", "Diagrams"],
      rationale: `This lesson is on ${topic}. Teacher Exposition, Demonstration, Question and answer and group or class discussion methods will be used. This lesson will develop learners knowledge of ${topic}. The skill of identification and application of ${topic} methods. The value of logical thinking and accuracy in computing ${topic}.`,
      learningOutcomes: [
        "By the end of this lesson, learners should be able to:",
        `1. Define ${topic}`,
        `2. Explain the concept of ${topic}`,
        `3. Apply ${topic} to solve problems`,
        `4. Analyze real-world applications of ${topic}`
      ],
      prerequisiteKnowledge: "Learners have ideas about the topic being taught.",
      lessonIntroduction: "Teacher revises through the previous lesson",
      lessonDevelopment: [
        {
          content: `Introduction to ${topic} and key concepts`,
          teacherActivity: "Teacher writes the example on the board and explains the concept",
          pupilActivity: "Learners to write the example in their exercise books and listen attentively",
          methods: "Teacher Exposition, Demonstration"
        },
        {
          content: `Main content and examples of ${topic}`,
          teacherActivity: "Teacher solves on the board and allows learners to ask questions",
          pupilActivity: "Learners to listen attentively and volunteer learners to go and solve on the board",
          methods: "Question and answer, group discussion"
        },
        {
          content: `Practice problems on ${topic}`,
          teacherActivity: "Teacher writes the exercise on the board and asks volunteer learners to go and solve",
          pupilActivity: "Learners to write the exercise in their exercise books and volunteer to solve on the board",
          methods: "Group work, individual practice"
        },
        {
          content: `Summary and conclusion of ${topic}`,
          teacherActivity: "Teacher consolidates learners responses and writes the summary on the board",
          pupilActivity: "Learners to listen attentively and write the summary",
          methods: "Review and consolidation"
        }
      ],
      learnersEvaluation: [
        `1. Define ${topic} in your own words`,
        `2. Give two examples of ${topic}`,
        `3. Solve a ${topic} problem`,
        `4. Explain the importance of ${topic}`
      ],
      expectedAnswers: [
        `Question 1: Correct definition of ${topic}`,
        `Question 2: Two valid examples of ${topic}`,
        `Question 3: Correct solution to the ${topic} problem`,
        `Question 4: Clear explanation of the importance of ${topic}`
      ],
      lessonConclusion: "Teacher concludes lesson by revising through the lesson with learners to help remedial learners",
      learnersEvaluationText: "Space for teacher's assessment of learner performance",
      teacherEvaluation: `The lesson was well delivered. The majority of the learners were able to grasp the concept and could work out problems involving ${topic}. Remedial work was given to those who had challenges.`,
      curriculum: 'obc'
    };
  } else {
    // ============ CBC FALLBACK ============
    return {
      title: topic,
      grade: grade,
      subject: subject,
      teacherName: user?.fullName || 'MR/MRS',
      school: user?.school || 'KASHINAKAZHI SECONDARY SCHOOL',
      province: user?.province || 'Southern',
      district: user?.district || 'Itezhi-Tezhi',
      date: new Date().toISOString().split('T')[0],
      time: "08:00-08:40",
      duration: "40 min",
      classSize: size,
      boys: boys,
      girls: girls,
      subtopic: '',
      generalCompetences: ["Analytical thinking", "Collaboration", "Communication", "Critical thinking"],
      specificCompetence: `By the end of this lesson, learners will be able to understand and explain ${topic}`,
      lessonGoal: `By the end of this lesson, learners will be able to identify, classify, and explain the importance of ${topic}`,
      rationale: `Understanding ${topic} is essential for learners to develop critical thinking skills and make informed decisions.`,
      priorKnowledge: "Learners have basic knowledge of the topic from previous lessons",
      references: ["2026 Teaching Module", "Curriculum Guide", `${subject} Grade ${grade} Textbook`],
      learningEnvironment: "Classroom with adequate resources",
      materials: ["Manila paper", "Markers", "Charts", "Worksheet", "Real objects"],
      expectedStandard: "Topic concepts explained correctly",
      lessonProgression: [
        { stage: "INTRODUCTION", time: "5 min", teacherRole: "Ask engaging questions to introduce the topic", learnerRole: "Listen, participate, give examples", assessmentCriteria: "Observation of participation" },
        { stage: "LESSON DEVELOPMENT", time: "10 min", teacherRole: "Explain key concepts and demonstrate", learnerRole: "Take notes, ask questions, discuss", assessmentCriteria: "Correct understanding of concepts" },
        { stage: "ACTIVITY 1", time: "11 min", teacherRole: "Guide group work and provide materials", learnerRole: "Work in groups, complete tasks", assessmentCriteria: "Group collaboration and task completion" },
        { stage: "ACTIVITY 2", time: "16 min", teacherRole: "Facilitate presentations and consolidate", learnerRole: "Present findings and correct own work", assessmentCriteria: "Accurate presentation" },
        { stage: "EXERCISE", time: "20 min", teacherRole: "Give assessment and monitor", learnerRole: "Complete assessment individually", assessmentCriteria: "Correct responses" },
        { stage: "CONCLUSION", time: "10 min", teacherRole: "Summarize key points", learnerRole: "Share what they learned", assessmentCriteria: "Verbal explanation" }
      ],
      homework: `Research and list examples of ${topic}`,
      lessonEvaluation: "Lesson was successful, key competences were acquired",
      teacherEvaluation: "Space for teacher's reflections",
      learningOutcomes: [`Understand ${topic}`, `Apply ${topic}`, `Analyze ${topic}`],
      learnersEvaluation: [`Define ${topic}`, `Give examples of ${topic}`, `Explain the importance of ${topic}`],
      lessonDevelopment: [
        { content: `Introduction to ${topic}`, teacherActivity: "Explain the concept", pupilActivity: "Listen and take notes", methods: "Lecture" },
        { content: `Practice ${topic}`, teacherActivity: "Guide students", pupilActivity: "Work in groups", methods: "Group work" }
      ],
      teachingAids: ["Whiteboard", "Charts", "Diagrams"],
      curriculum: 'cbc'
    };
  }
}

// ============ LESSON GENERATION ROUTE (CBC & OBC) ============

app.post('/api/lessons/generate', authenticate, async (req, res) => {
  try {
    const { topic, grade, subject, classSize, curriculum } = req.body;

    if (!topic || !grade || !subject) {
      return res.status(400).json({ error: 'Missing required fields: topic, grade, subject' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.lessonsUsed >= user.lessonsLimit) {
      return res.status(403).json({
        error: 'Lesson limit reached. Please upgrade your plan to generate more lessons.'
      });
    }

    const curriculumType = curriculum || 'cbc';
    const size = parseInt(classSize) || 40;
    const boys = Math.floor(size / 2) || 18;
    const girls = Math.ceil(size / 2) || 22;
    
    let aiContent = null;
    let useFallback = false;

    try {
      let prompt;
      
      if (curriculumType === 'obc') {
        // ============ OBC PROMPT ============
        prompt = `
You are an expert Zambian teacher creating an OBC (Objective-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

⚠️ CRITICAL: You MUST return ONLY valid JSON that EXACTLY matches this OBC structure:

{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "teacherName": "${user.fullName || 'MR/MRS'}",
  "school": "${user.school || 'KASHINAKAZHI SECONDARY SCHOOL'}",
  "date": "${new Date().toISOString().split('T')[0]}",
  "duration": "80 MINUTES",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
  "subtopic": "",
  "references": [
    "Progress in ${subject} Grade ${grade} pg 78",
    "${subject} Grade ${grade} Textbook",
    "Teacher's Guide"
  ],
  "teachingAids": ["Learners book", "Chalk board", "Chart", "Diagrams"],
  "rationale": "This lesson is on ${topic}. Teacher Exposition, Demonstration, Question and answer and group or class discussion methods will be used. This lesson will develop learners knowledge of ${topic}. The skill of identification and application of ${topic} methods. The value of logical thinking and accuracy in computing ${topic}.",
  "learningOutcomes": [
    "By the end of this lesson, learners should be able to:",
    "1. Define ${topic}",
    "2. Explain the concept of ${topic}",
    "3. Apply ${topic} to solve problems",
    "4. Analyze real-world applications of ${topic}"
  ],
  "prerequisiteKnowledge": "Learners have ideas about the topic being taught.",
  "lessonIntroduction": "Teacher revises through the previous lesson",
  "lessonDevelopment": [
    {
      "content": "Introduction to ${topic} and key concepts",
      "teacherActivity": "Teacher writes the example on the board and explains the concept",
      "pupilActivity": "Learners to write the example in their exercise books and listen attentively",
      "methods": "Teacher Exposition, Demonstration"
    },
    {
      "content": "Main content and examples of ${topic}",
      "teacherActivity": "Teacher solves on the board and allows learners to ask questions",
      "pupilActivity": "Learners to listen attentively and volunteer learners to go and solve on the board",
      "methods": "Question and answer, group discussion"
    },
    {
      "content": "Practice problems on ${topic}",
      "teacherActivity": "Teacher writes the exercise on the board and asks volunteer learners to go and solve",
      "pupilActivity": "Learners to write the exercise in their exercise books and volunteer to solve on the board",
      "methods": "Group work, individual practice"
    }
  ],
  "learnersEvaluation": [
    "1. Define ${topic} in your own words",
    "2. Give two examples of ${topic}",
    "3. Solve a ${topic} problem",
    "4. Explain the importance of ${topic}"
  ],
  "expectedAnswers": [
    "Question 1: Correct definition of ${topic}",
    "Question 2: Two valid examples of ${topic}",
    "Question 3: Correct solution to the ${topic} problem",
    "Question 4: Clear explanation of the importance of ${topic}"
  ],
  "lessonConclusion": "Teacher concludes lesson by revising through the lesson with learners to help remedial learners",
  "learnersEvaluationText": "Space for teacher's assessment of learner performance",
  "teacherEvaluation": "The lesson was well delivered. The majority of the learners were able to grasp the concept and could work out problems involving ${topic}. Remedial work was given to those who had challenges."
}

🔴 RULES:
- Make content specific to ${grade} ${subject} on "${topic}".
- Include realistic examples and practice problems.
- Return ONLY the JSON object, no other text.
`;
      } else {
        // ============ CBC PROMPT ============
        prompt = `
You are an expert Zambian teacher creating a CBC (Competency-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

⚠️ CRITICAL: You MUST return ONLY valid JSON that EXACTLY matches this CBC structure:

{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "teacherName": "${user.fullName || 'MR/MRS'}",
  "school": "${user.school || 'KASHINAKAZHI SECONDARY SCHOOL'}",
  "province": "${user.province || 'Southern'}",
  "district": "${user.district || 'Itezhi-Tezhi'}",
  "date": "${new Date().toISOString().split('T')[0]}",
  "time": "08:00-08:40",
  "duration": "40 min",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
  "subtopic": "",
  "generalCompetences": ["Analytical thinking", "Collaboration", "Communication", "Critical thinking"],
  "specificCompetence": "Classify and explain the types of ${topic}",
  "lessonGoal": "By the end of this lesson, learners will be able to identify, classify, and explain the importance of ${topic}",
  "rationale": "Understanding ${topic} is essential for learners to make informed decisions and develop critical thinking skills.",
  "priorKnowledge": "Learners have basic knowledge of the topic from previous lessons",
  "references": ["2026 Teaching Module", "Curriculum Guide", "${subject} Grade ${grade} Textbook"],
  "learningEnvironment": "Classroom, laboratory, school garden",
  "materials": ["Manila paper", "Markers", "Charts", "Worksheet", "Real objects"],
  "expectedStandard": "Topic concepts classified correctly",
  "lessonProgression": [
    {
      "stage": "INTRODUCTION",
      "time": "5 min",
      "teacherRole": "Ask: 'What do you know about this topic?'",
      "learnerRole": "Listen, participate, give examples",
      "assessmentCriteria": "Observation of participation"
    },
    {
      "stage": "LESSON DEVELOPMENT",
      "time": "10 min",
      "teacherRole": "Explain key concepts and demonstrate",
      "learnerRole": "Take notes, ask questions, discuss",
      "assessmentCriteria": "Correct understanding of concepts"
    },
    {
      "stage": "ACTIVITY 1",
      "time": "11 min",
      "teacherRole": "Guide group work and provide materials",
      "learnerRole": "Work in groups, complete tasks",
      "assessmentCriteria": "Group collaboration and task completion"
    },
    {
      "stage": "ACTIVITY 2",
      "time": "16 min",
      "teacherRole": "Facilitate presentations and consolidate",
      "learnerRole": "Present findings and correct own work",
      "assessmentCriteria": "Accurate presentation"
    },
    {
      "stage": "EXERCISE",
      "time": "20 min",
      "teacherRole": "Give assessment and monitor",
      "learnerRole": "Complete assessment individually",
      "assessmentCriteria": "Correct responses"
    },
    {
      "stage": "CONCLUSION",
      "time": "10 min",
      "teacherRole": "Summarize key points",
      "learnerRole": "Share what they learned",
      "assessmentCriteria": "Verbal explanation"
    }
  ],
  "homework": "Research and list local examples of ${topic}",
  "lessonEvaluation": "Lesson was successful, key competences were acquired",
  "teacherEvaluation": "Space for teacher's reflections"
}

🔴 RULES:
- Make content specific to ${grade} ${subject} on "${topic}".
- Include realistic examples relevant to Zambian schools.
- Return ONLY the JSON object, no other text.
`;
      }

      console.log(`📝 Generating ${curriculumType.toUpperCase()} lesson with DeepSeek...`);

      const response = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: `You are an expert Zambian teacher creating detailed ${curriculumType.toUpperCase()} lesson plans. Always return valid JSON in the exact format specified. Never add extra text.` },
          { role: "user", content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 4096,
        response_format: { type: "json_object" }
      });

      let content = response.choices[0].message.content;
      content = content.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
      
      aiContent = JSON.parse(content);
      
      // Merge with fallback to ensure all fields exist
      const fallback = generateFallbackLesson(topic, grade, subject, classSize, curriculumType, user);
      aiContent = { ...fallback, ...aiContent };
      
      // Ensure arrays are not empty
      if (curriculumType === 'obc') {
        aiContent.references = aiContent.references || fallback.references;
        aiContent.teachingAids = aiContent.teachingAids || fallback.teachingAids;
        aiContent.learningOutcomes = aiContent.learningOutcomes || fallback.learningOutcomes;
        aiContent.lessonDevelopment = aiContent.lessonDevelopment || fallback.lessonDevelopment;
        aiContent.learnersEvaluation = aiContent.learnersEvaluation || fallback.learnersEvaluation;
        aiContent.expectedAnswers = aiContent.expectedAnswers || fallback.expectedAnswers;
      } else {
        aiContent.generalCompetences = aiContent.generalCompetences || fallback.generalCompetences;
        aiContent.lessonProgression = aiContent.lessonProgression || fallback.lessonProgression;
        aiContent.learningOutcomes = aiContent.learningOutcomes || fallback.learningOutcomes;
        aiContent.learnersEvaluation = aiContent.learnersEvaluation || fallback.learnersEvaluation;
        aiContent.materials = aiContent.materials || fallback.materials;
        aiContent.references = aiContent.references || fallback.references;
        aiContent.lessonDevelopment = aiContent.lessonDevelopment || fallback.lessonDevelopment;
        aiContent.teachingAids = aiContent.teachingAids || fallback.teachingAids;
      }

      console.log(`✅ ${curriculumType.toUpperCase()} lesson generated successfully`);

    } catch (error) {
      console.log('⚠️ DeepSeek error, using fallback:', error.message);
      useFallback = true;
    }

    if (useFallback || !aiContent) {
      console.log(`📝 Using ${curriculumType.toUpperCase()} fallback lesson`);
      aiContent = generateFallbackLesson(topic, grade, subject, classSize, curriculumType, user);
    }

    // ============ SAVE TO DATABASE ============
    const lesson = await prisma.lesson.create({
      data: {
        userId: req.userId,
        grade: grade,
        subject: subject,
        topic: topic,
        subtopic: aiContent.subtopic || '',
        title: aiContent.title || topic,
        classSize: size,
        duration: aiContent.duration || '40 min',
        curriculum: curriculumType,
        objectives: aiContent.learningOutcomes || [`Understand ${topic}`],
        development: aiContent.lessonDevelopment?.map(d => d.learningPoints || d.content) || [],
        activities: aiContent.lessonDevelopment?.map(d => d.pupilActivity || d.pupilActivities) || [],
        assessment: aiContent.learnersEvaluation?.join(', ') || '',
        curriculumCodes: [`${subject}-${grade}-${topic.substring(0, 3)}`],
        provinceContext: user.province || '',
        lessonDevelopment: aiContent.lessonDevelopment || [],
        lessonProgression: aiContent.lessonProgression || [],
        learningOutcomes: aiContent.learningOutcomes || [],
        learnersEvaluation: aiContent.learnersEvaluation || [],
        teacherEvaluation: aiContent.teacherEvaluation || '',
        generalCompetences: aiContent.generalCompetences || [],
        specificCompetence: aiContent.specificCompetence || '',
        lessonGoal: aiContent.lessonGoal || '',
        rationale: aiContent.rationale || '',
        priorKnowledge: aiContent.priorKnowledge || '',
        references: aiContent.references || [],
        learningEnvironment: aiContent.learningEnvironment || '',
        materials: aiContent.materials || [],
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
        teachingAids: aiContent.teachingAids || []
      }
    });

    await prisma.user.update({
      where: { id: req.userId },
      data: { lessonsUsed: user.lessonsUsed + 1 }
    });

    res.status(201).json({
      ...aiContent,
      id: lesson.id,
      createdAt: lesson.createdAt,
      grade: grade,
      subject: subject,
      topic: topic,
      classSize: size,
      curriculum: curriculumType,
      school: user.school || '',
      province: user.province || '',
      district: user.district || '',
      teacherName: user.fullName || ''
    });

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
      weekTopics, subtopic 
    } = req.body;

    if (!grade || !subject) {
      return res.status(400).json({ error: 'Missing required fields: grade, subject' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.schemesUsed >= user.schemesLimit) {
      return res.status(403).json({
        error: 'Scheme limit reached. Please upgrade your plan to generate more schemes.'
      });
    }

    // ============ GENERATE SCHEME DIRECTLY ============
    const assessmentWeeksList = assessmentWeeks || [3, 6, 9, 12];
    const customTopics = weekTopics || {};
    const totalWeeksCount = totalWeeks || 13;

    const weeks = [];
    const subtopicsList = subtopic ? subtopic.split(',').map(s => s.trim()) : [];
    
    const defaultTopics = [
      `Introduction to ${subject}`,
      `Basic concepts of ${subject}`,
      `Advanced ${subject} topics`,
      `Practical applications of ${subject}`,
      `Review and assessment of ${subject}`
    ];

    for (let i = 1; i <= totalWeeksCount; i++) {
      const isAssessment = assessmentWeeksList.includes(i);
      const isRevision = [1, 5, 9].includes(i);
      
      let weekTopics = [];
      
      if (isRevision) {
        weekTopics = [{
          topic: 'REVISION WEEK',
          specificOutcome: 'Correct their past misconceptions',
          methods: 'Class discussion, Question and answer, Group work',
          aids: 'Test papers, Revision notes',
          references: 'Test papers, Marking keys',
          knowledge: '',
          skills: '',
          values: ''
        }];
      } else if (isAssessment) {
        weekTopics = [{
          topic: 'ASSESSMENT',
          specificOutcome: 'Demonstrate understanding of the topics covered',
          methods: 'Test, Examination, Practical assessment',
          aids: 'Examination papers, Answer sheets',
          references: 'Teacher\'s guide, Marking scheme',
          knowledge: '',
          skills: '',
          values: ''
        }];
      } else {
        let topicName = customTopics[i] || '';
        
        if (!topicName && subtopicsList.length > 0) {
          const subtopicIndex = (i - 2) % subtopicsList.length;
          topicName = subtopicsList[subtopicIndex];
        }
        
        if (!topicName) {
          const defaultIndex = (i - 2) % defaultTopics.length;
          topicName = defaultTopics[defaultIndex];
        }
        
        let weekType = 'Lesson';
        if (i % 4 === 0) weekType = 'Practical';
        if (i % 5 === 0) weekType = 'Group Work';
        
        weekTopics = [{
          topic: topicName,
          specificOutcome: `By the end of this lesson, learners will be able to understand and explain ${topicName}`,
          methods: `Lecture, discussion, group work, ${weekType === 'Practical' ? 'practical demonstration' : 'question and answer'}`,
          aids: `Whiteboard, charts, textbooks, ${weekType === 'Practical' ? 'laboratory equipment' : 'diagrams'}`,
          references: `${subject} Grade ${grade} Textbook, Teacher's Guide`,
          knowledge: `Comprehensive knowledge of ${topicName}`,
          skills: `Critical thinking, analysis, ${weekType === 'Group Work' ? 'collaboration' : 'problem-solving'}`,
          values: `Responsibility, teamwork, ${weekType === 'Practical' ? 'scientific inquiry' : 'curiosity'}`
        }];
      }
      
      weeks.push({
        week: i,
        topics: weekTopics,
        assessment: isAssessment ? `End of Week ${i} Assessment` : null
      });
    }

    const generatedScheme = {
      grade: grade,
      subject: subject,
      term: term || 'Term 1',
      year: year || new Date().getFullYear().toString(),
      totalWeeks: totalWeeksCount,
      school: school || user.school || '',
      teacherName: user.fullName || '',
      subtopic: subtopic || '',
      weeks: weeks,
      assessmentWeeks: assessmentWeeksList,
      testTopics: testTopics || [`Mid-term test on ${subject}`, `End of term test on ${subject}`],
      createdAt: new Date().toISOString()
    };

    const scheme = await prisma.scheme.create({
      data: {
        userId: req.userId,
        grade: grade,
        subject: subject,
        term: term || 'Term 1',
        year: year || new Date().getFullYear().toString(),
        totalWeeks: totalWeeksCount,
        weeks: weeks,
        assessmentWeeks: generatedScheme.assessmentWeeks,
        school: school || user.school || '',
        teacherName: user.fullName || '',
        subtopic: subtopic || '',
        testTopics: generatedScheme.testTopics
      }
    });

    await prisma.user.update({
      where: { id: req.userId },
      data: { schemesUsed: user.schemesUsed + 1 }
    });

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

app.get('/api/schemes/export/:id/pdf', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const scheme = await prisma.scheme.findUnique({
      where: { id: id },
    });

    if (!scheme) {
      return res.status(404).json({ error: 'Scheme not found' });
    }

    if (scheme.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    let html = `
      <html>
      <head>
        <meta charset="utf-8">
        <title>Scheme of Work</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12pt; margin: 40px; }
          h1 { text-align: center; font-size: 18pt; }
          h2 { text-align: center; font-size: 16pt; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10pt; }
          th { background-color: #e0e0e0; font-weight: bold; border: 1px solid #000; padding: 6px; }
          td { border: 1px solid #000; padding: 6px; vertical-align: top; }
          .footer { text-align: center; margin-top: 30px; font-size: 10pt; }
        </style>
      </head>
      <body>
        <h1>MINISTRY OF EDUCATION</h1>
        <h2>SCHEME OF WORK</h2>
        <p style="text-align: center;"><strong>School:</strong> ${scheme.school || 'School Name'}</p>
        <p style="text-align: center;"><strong>Subject:</strong> ${scheme.subject}</p>
        <p style="text-align: center;"><strong>Grade:</strong> ${scheme.grade}</p>
        <p style="text-align: center;"><strong>Term:</strong> ${scheme.term}</p>
        <p style="text-align: center;"><strong>Year:</strong> ${scheme.year}</p>
        <p style="text-align: center;"><strong>Assessment Weeks:</strong> ${scheme.assessmentWeeks?.join(', ') || 'None'}</p>
        <hr>
        <table>
          <thead>
            <tr>
              <th>WEEK</th>
              <th>TOPIC</th>
              <th>SPECIFIC OUTCOME</th>
              <th>METHODS</th>
              <th>AIDS</th>
              <th>REFERENCES</th>
              <th>KNOWLEDGE</th>
              <th>SKILLS</th>
              <th>VALUES</th>
            </tr>
          </thead>
          <tbody>
    `;

    scheme.weeks.forEach(week => {
      const topics = week.topics || [];
      const topicText = topics.map(t => t.topic || '').join('; ');
      const outcomeText = topics.map(t => t.specificOutcome || '').join('; ');
      const methodsText = topics.map(t => t.methods || '').join('; ');
      const aidsText = topics.map(t => t.aids || '').join('; ');
      const refsText = topics.map(t => t.references || '').join('; ');
      const knowledgeText = topics.map(t => t.knowledge || '').join('; ');
      const skillsText = topics.map(t => t.skills || '').join('; ');
      const valuesText = topics.map(t => t.values || '').join('; ');

      html += `
        <tr>
          <td style="text-align: center;">${week.week}</td>
          <td>${topicText || '-'}</td>
          <td>${outcomeText || '-'}</td>
          <td>${methodsText || '-'}</td>
          <td>${aidsText || '-'}</td>
          <td>${refsText || '-'}</td>
          <td>${knowledgeText || '-'}</td>
          <td>${skillsText || '-'}</td>
          <td>${valuesText || '-'}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <div class="footer">
          <p>© 2026 mytoolbox - Made for teachers in Zambia</p>
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="scheme_${scheme.id}.html"`);
    res.send(html);

  } catch (error) {
    console.error('❌ PDF export error:', error);
    res.status(500).json({ error: 'Failed to export scheme as PDF' });
  }
});

app.get('/api/schemes/export/:id/word', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const scheme = await prisma.scheme.findUnique({
      where: { id: id },
    });

    if (!scheme) {
      return res.status(404).json({ error: 'Scheme not found' });
    }

    if (scheme.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    let html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>Scheme of Work</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; margin: 40px; }
          h1 { text-align: center; font-size: 18pt; }
          h2 { text-align: center; font-size: 16pt; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #e0e0e0; font-weight: bold; border: 1px solid #000; padding: 6px; }
          td { border: 1px solid #000; padding: 6px; vertical-align: top; }
          .footer { text-align: center; margin-top: 30px; font-size: 10pt; }
        </style>
      </head>
      <body>
        <h1>MINISTRY OF EDUCATION</h1>
        <h2>SCHEME OF WORK</h2>
        <p style="text-align: center;"><strong>School:</strong> ${scheme.school || 'School Name'}</p>
        <p style="text-align: center;"><strong>Subject:</strong> ${scheme.subject}</p>
        <p style="text-align: center;"><strong>Grade:</strong> ${scheme.grade}</p>
        <p style="text-align: center;"><strong>Term:</strong> ${scheme.term}</p>
        <p style="text-align: center;"><strong>Year:</strong> ${scheme.year}</p>
        <p style="text-align: center;"><strong>Assessment Weeks:</strong> ${scheme.assessmentWeeks?.join(', ') || 'None'}</p>
        <hr>
        <table>
          <thead>
            <tr>
              <th>WEEK</th>
              <th>TOPIC</th>
              <th>SPECIFIC OUTCOME</th>
              <th>METHODS</th>
              <th>AIDS</th>
              <th>REFERENCES</th>
              <th>KNOWLEDGE</th>
              <th>SKILLS</th>
              <th>VALUES</th>
            </tr>
          </thead>
          <tbody>
    `;

    scheme.weeks.forEach(week => {
      const topics = week.topics || [];
      const topicText = topics.map(t => t.topic || '').join('; ');
      const outcomeText = topics.map(t => t.specificOutcome || '').join('; ');
      const methodsText = topics.map(t => t.methods || '').join('; ');
      const aidsText = topics.map(t => t.aids || '').join('; ');
      const refsText = topics.map(t => t.references || '').join('; ');
      const knowledgeText = topics.map(t => t.knowledge || '').join('; ');
      const skillsText = topics.map(t => t.skills || '').join('; ');
      const valuesText = topics.map(t => t.values || '').join('; ');

      html += `
        <tr>
          <td style="text-align: center;">${week.week}</td>
          <td>${topicText || '-'}</td>
          <td>${outcomeText || '-'}</td>
          <td>${methodsText || '-'}</td>
          <td>${aidsText || '-'}</td>
          <td>${refsText || '-'}</td>
          <td>${knowledgeText || '-'}</td>
          <td>${skillsText || '-'}</td>
          <td>${valuesText || '-'}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <div class="footer">
          <p>© 2026 mytoolbox - Made for teachers in Zambia</p>
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="scheme_${scheme.id}.doc"`);
    res.send(html);

  } catch (error) {
    console.error('❌ Word export error:', error);
    res.status(500).json({ error: 'Failed to export scheme as Word' });
  }
});

// ============ GET ROUTES ============

app.get('/api/lessons', authenticate, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
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
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
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
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10
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
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    res.json(schemes);
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ error: 'Failed to fetch schemes' });
  }
});

// ============ PAYMENT ROUTES ============

app.post('/api/payments/initiate', authenticate, async (req, res) => {
  try {
    const { amount, phoneNumber, plan } = req.body;

    if (!amount || !phoneNumber) {
      return res.status(400).json({ error: 'Amount and phone number are required' });
    }

    const cleanNumber = phoneNumber.replace(/\s/g, '');
    if (!cleanNumber.match(/^260[0-9]{9}$/)) {
      return res.status(400).json({ error: 'Invalid phone number format. Use 260XXXXXXXXX' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const referenceId = `TX-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const callbackUrl = `${process.env.BACKEND_URL || 'https://mytoolbox-production.up.railway.app'}/api/payments/webhook`;

    const payment = await lipilaService.createCollection({
      referenceId,
      amount: parseFloat(amount),
      accountNumber: cleanNumber,
      currency: 'ZMW',
      callbackUrl,
    });

    const paymentRecord = await prisma.payment.create({
      data: {
        userId: req.userId,
        referenceId: referenceId,
        transactionId: payment.transactionId || referenceId,
        amount: parseFloat(amount),
        currency: 'ZMW',
        provider: 'lipila',
        phoneNumber: cleanNumber,
        status: 'pending',
        externalId: payment.id || null,
        plan: plan || 'PRO',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      }
    });

    res.status(201).json({
      success: true,
      payment: paymentRecord,
      provider: payment,
      message: 'Payment initiated. Please check your phone for the prompt.',
    });

  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    res.status(500).json({
      error: 'Failed to initiate payment',
      details: error.message
    });
  }
});

app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const payload = req.body;
    console.log('📥 Webhook received:', payload);

    const { referenceId, status, amount, accountNumber, transactionId } = payload;

    const payment = await prisma.payment.findUnique({
      where: { referenceId: referenceId },
      include: { user: true },
    });

    if (!payment) {
      console.log('⚠️ Payment not found for reference:', referenceId);
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status === 'completed') {
      console.log('⏭️ Payment already completed:', referenceId);
      return res.status(200).json({ message: 'Already processed' });
    }

    const isSuccessful = status === 'completed' || status === 'successful';
    const isFailed = status === 'failed' || status === 'cancelled';

    let updatedStatus = 'pending';
    if (isSuccessful) {
      updatedStatus = 'completed';
    } else if (isFailed) {
      updatedStatus = 'failed';
    }

    await prisma.payment.update({
      where: { referenceId: referenceId },
      data: {
        status: updatedStatus,
        completedAt: isSuccessful ? new Date() : null,
        externalId: transactionId || payload.id || payment.externalId,
      }
    });

    if (isSuccessful && payment.user) {
      const plan = payment.plan || 'PRO';
      await prisma.user.update({
        where: { id: payment.userId },
        data: {
          role: plan,
          schemesLimit: plan === 'PRO' ? 100 : 3,
          lessonsLimit: plan === 'PRO' ? 1000 : 5,
          subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }
      });
      console.log(`✅ User ${payment.user.email} upgraded to ${plan}`);
    }

    res.status(200).json({ message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.get('/api/payments/:referenceId/status', authenticate, async (req, res) => {
  try {
    const { referenceId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { referenceId: referenceId },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const status = await lipilaService.getTransactionStatus(referenceId);

    res.json({
      payment,
      providerStatus: status,
    });

  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({
      error: 'Failed to check payment status',
      details: error.message
    });
  }
});

app.get('/api/payments/history', authenticate, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// ============ START SERVER ============
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Auth routes available at /api/auth/*`);
  console.log(`✅ Lesson generation available at /api/lessons/generate`);
  console.log(`✅ Scheme generation available at /api/schemes/generate`);
  console.log(`✅ Scheme export available at /api/schemes/export/:id/:format`);
  console.log(`✅ Get lessons at /api/lessons`);
  console.log(`✅ Get schemes at /api/schemes`);
  console.log(`✅ Get lessons (alias) at /api/lessons/mine`);
  console.log(`✅ Get schemes (alias) at /api/schemes/mine`);
  console.log(`✅ Payment routes available at /api/payments/*`);
  console.log(`✅ DeepSeek AI integration enabled`);
  console.log(`✅ Lipila payment integration enabled`);
  console.log(`✅ CORS enabled for Vercel and Render frontend`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  prisma.$disconnect();
  process.exit(0);
});
