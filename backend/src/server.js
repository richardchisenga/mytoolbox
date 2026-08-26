// src/server.js - Complete application with DeepSeek AI integration, Lipila payments, Notes, Assessments, Admin routes, and Export routes
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');
const axios = require('axios');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType } = require('docx');
const PDFDocument = require('pdfkit');

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
      ? 'https://sandbox.lipila.com' 
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

// ============ ROBUST DEEPSEEK JSON PARSER ============

function safeParseJSON(content) {
  if (!content || typeof content !== 'string') {
    console.error('❌ DeepSeek returned empty or invalid content');
    return null;
  }

  try {
    return JSON.parse(content.trim());
  } catch (firstError) {
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
      console.error('Response:', content.substring(0, 1000));
      return null;
    }

    cleaned = cleaned.substring(firstBrace, lastBrace + 1);

    try {
      return JSON.parse(cleaned);
    } catch (secondError) {
      console.warn('⚠️ Cleaned JSON.parse failed:', secondError.message);
      console.error('Cleaned response:', cleaned.substring(0, 1500));
      return null;
    }

  } catch (error) {
    console.error('❌ JSON cleanup failed:', error.message);
    return null;
  }
}

// ============ IMPROVED DEEPSEEK GENERATE FUNCTION ============

async function generateDeepSeekJSON(messages, options = {}) {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🤖 DeepSeek attempt ${attempt}/${maxAttempts}`);

      const response = await deepseek.chat.completions.create({
        model: options.model || 'deepseek-chat',
        messages,
        temperature: options.temperature || 0.1,
        max_tokens: options.max_tokens || 4096,
        response_format: {
          type: 'json_object'
        }
      });

      const choice = response?.choices?.[0];

      if (!choice) {
        throw new Error('DeepSeek returned no choices');
      }

      console.log(`🤖 Finish reason: ${choice.finish_reason || 'unknown'}`);

      if (choice.finish_reason === 'length') {
        throw new Error('DeepSeek response was truncated');
      }

      const content = choice?.message?.content;

      if (!content) {
        throw new Error('DeepSeek returned empty content');
      }

      let parsed = null;
      try {
        parsed = JSON.parse(content.trim());
      } catch (parseError) {
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
          try {
            parsed = JSON.parse(cleaned);
          } catch (e) {
            console.error('❌ Cleaned JSON.parse also failed:', e.message);
          }
        }
      }

      if (!parsed) {
        throw new Error('DeepSeek returned invalid JSON');
      }

      return parsed;

    } catch (error) {
      console.error(`⚠️ DeepSeek attempt ${attempt} failed:`, error.message);

      if (attempt === maxAttempts) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// ============ ENHANCED FALLBACK LESSON GENERATOR ============

function generateFallbackLesson(topic, grade, subject, classSize, curriculumType, user) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;
  
  if (curriculumType === 'obc') {
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
        `Define ${topic}`,
        `Explain the concept of ${topic}`,
        `Apply ${topic} to solve problems`,
        `Analyze real-world applications of ${topic}`
      ],
      prerequisiteKnowledge: "Learners have ideas about the topic being taught.",
      lessonIntroduction: "Teacher revises through the previous lesson",
      lessonDevelopment: [
        {
          content: `Introduction to ${topic} and key concepts`,
          teacherActivity: `Teacher writes the example on the board and explains the concept of ${topic} using real-world examples`,
          pupilActivity: "Learners to write the example in their exercise books and listen attentively",
          methods: "Teacher Exposition, Demonstration"
        },
        {
          content: `Main content and examples of ${topic}`,
          teacherActivity: `Teacher solves ${topic} problems on the board step-by-step and allows learners to ask questions`,
          pupilActivity: "Learners to listen attentively and volunteer learners to go and solve on the board",
          methods: "Question and answer, group discussion"
        },
        {
          content: `Practice problems on ${topic}`,
          teacherActivity: `Teacher writes ${topic} exercise on the board and asks volunteer learners to go and solve`,
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
        `Define ${topic} in your own words`,
        `Give two examples of ${topic}`,
        `Solve a ${topic} problem: Determine the key features of ${topic}`,
        `Explain the importance of ${topic}`
      ],
      expectedAnswers: [
        `Correct definition of ${topic}`,
        `Two valid examples of ${topic}`,
        `Correct solution to the ${topic} problem`,
        `Clear explanation of the importance of ${topic}`
      ],
      lessonConclusion: "Teacher concludes lesson by revising through the lesson with learners to help remedial learners",
      learnersEvaluationText: "Space for teacher's assessment of learner performance",
      teacherEvaluation: `The lesson was well delivered. The majority of the learners were able to grasp the concept and could work out problems involving ${topic}. Remedial work was given to those who had challenges.`,
      curriculum: 'obc'
    };
  } else {
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
      generalCompetences: [
        "Analytical thinking: Breaking down complex information into parts",
        "Collaboration: Working effectively in groups",
        "Communication: Expressing ideas clearly",
        "Critical thinking: Evaluating information and making decisions"
      ],
      specificCompetence: `By the end of this lesson, learners will be able to demonstrate understanding of ${topic} through explanation and application.`,
      lessonGoal: `By the end of this lesson, learners will be able to identify, classify, and explain the importance of ${topic}.`,
      rationale: `Understanding ${topic} is essential for learners to develop critical thinking skills and make informed decisions.`,
      priorKnowledge: "Learners have basic knowledge of the topic from previous lessons.",
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

// ============ ENHANCED FALLBACK SCHEME GENERATOR ============

function generateFallbackScheme(grade, subject, term, user, customTopics = {}) {
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
        knowledge: '',
        skills: '',
        values: ''
      });
    } else if (isAssessment) {
      weekTopics.push({
        topic: 'ASSESSMENT',
        specificOutcome: 'Demonstrate understanding of the topics covered',
        methods: 'Test, Examination, Practical assessment',
        aids: 'Examination papers, Answer sheets',
        references: 'Teacher\'s guide, Marking scheme',
        knowledge: '',
        skills: '',
        values: ''
      });
    } else if (customTopic) {
      weekTopics.push({
        topic: customTopic,
        specificOutcome: `By the end of this lesson, learners will be able to understand and apply knowledge of ${customTopic}`,
        methods: "Lecture, discussion, group work, question and answer",
        aids: "Whiteboard, charts, textbooks, diagrams",
        references: "Textbook, Teacher's Guide",
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
        references: `${subject} Grade ${grade} Textbook, Teacher's Guide`,
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
    testTopics: [`Mid-term test on ${subject}`, `End of term test on ${subject}`]
  };
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

// ============ LESSON GENERATION ROUTE (UPDATED WITH DETAILED PROMPTS) ============

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
        // ============ DETAILED OBC PROMPT ============
        prompt = `
You are an expert Zambian teacher creating an OBC (Objective-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

⚠️ CRITICAL: You MUST return ONLY valid JSON that EXACTLY matches this detailed OBC structure:

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
    "Define ${topic}",
    "Explain the concept of ${topic}",
    "Apply ${topic} to solve problems",
    "Analyze real-world applications of ${topic}"
  ],
  "prerequisiteKnowledge": "Learners have ideas about the topic being taught.",
  "lessonIntroduction": "Teacher revises through the previous lesson",
  "lessonDevelopment": [
    {
      "content": "Introduction to ${topic} and key concepts",
      "teacherActivity": "Teacher writes the example on the board and explains the concept of ${topic} using real-world examples",
      "pupilActivity": "Learners to write the example in their exercise books and listen attentively",
      "methods": "Teacher Exposition, Demonstration"
    },
    {
      "content": "Main content and examples of ${topic}",
      "teacherActivity": "Teacher solves ${topic} problems on the board step-by-step and allows learners to ask questions",
      "pupilActivity": "Learners to listen attentively and volunteer learners to go and solve on the board",
      "methods": "Question and answer, group discussion"
    },
    {
      "content": "Practice problems on ${topic}",
      "teacherActivity": "Teacher writes ${topic} exercise on the board and asks volunteer learners to go and solve",
      "pupilActivity": "Learners to write the exercise in their exercise books and volunteer to solve on the board",
      "methods": "Group work, individual practice"
    },
    {
      "content": "Summary and conclusion of ${topic}",
      "teacherActivity": "Teacher consolidates learners responses and writes the summary on the board",
      "pupilActivity": "Learners to listen attentively and write the summary",
      "methods": "Review and consolidation"
    }
  ],
  "learnersEvaluation": [
    "Define ${topic} in your own words",
    "Give two examples of ${topic}",
    "Solve a ${topic} problem: Determine the key features of ${topic}",
    "Explain the importance of ${topic}"
  ],
  "expectedAnswers": [
    "Correct definition of ${topic}",
    "Two valid examples of ${topic}",
    "Correct solution to the ${topic} problem",
    "Clear explanation of the importance of ${topic}"
  ],
  "lessonConclusion": "Teacher concludes lesson by revising through the lesson with learners to help remedial learners",
  "learnersEvaluationText": "Space for teacher's assessment of learner performance",
  "teacherEvaluation": "The lesson was well delivered. The majority of the learners were able to grasp the concept and could work out problems involving ${topic}. Remedial work was given to those who had challenges."
}
`;
      } else {
        // ============ DETAILED CBC PROMPT ============
        prompt = `
You are an expert Zambian teacher creating a CBC (Competency-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

⚠️ CRITICAL: Return ONLY valid JSON that EXACTLY matches this detailed CBC structure. Each section must contain specific, detailed content:

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
  "generalCompetences": [
    "Analytical thinking: Breaking down complex information into parts",
    "Collaboration: Working effectively in groups",
    "Communication: Expressing ideas clearly",
    "Critical thinking: Evaluating information and making decisions"
  ],
  "specificCompetence": "By the end of this lesson, learners will be able to demonstrate understanding of ${topic} through explanation and application.",
  "lessonGoal": "By the end of this lesson, learners will be able to identify, classify, and explain the importance of ${topic}.",
  "rationale": "Understanding ${topic} is essential for learners to develop critical thinking skills and make informed decisions.",
  "priorKnowledge": "Learners have basic knowledge of the topic from previous lessons.",
  "references": ["2026 Teaching Module", "Curriculum Guide", "${subject} Grade ${grade} Textbook"],
  "learningEnvironment": "Classroom with adequate resources",
  "materials": ["Manila paper", "Markers", "Charts", "Worksheet", "Real objects"],
  "expectedStandard": "Topic concepts explained correctly",
  "lessonProgression": [
    {
      "stage": "INTRODUCTION",
      "time": "5 min",
      "teacherRole": "Ask engaging questions to introduce the topic",
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
  "homework": "Research and list examples of ${topic}",
  "lessonEvaluation": "Lesson was successful, key competences were acquired",
  "teacherEvaluation": "Space for teacher's reflections"
}
`;
      }

      console.log(`📝 Generating ${curriculumType.toUpperCase()} lesson with DeepSeek...`);

      const messages = [
        {
          role: "system",
          content: `
You are an expert Zambian teacher.

The user will provide a topic and requirements for a lesson plan.
Parse the information and output it in valid JSON format.

Return ONLY the JSON object, no other text.
`
        },
        {
          role: "user",
          content: prompt
        }
      ];

      aiContent = await generateDeepSeekJSON(messages, { 
        max_tokens: 4096,
        temperature: 0.1
      });
      
      const fallback = generateFallbackLesson(topic, grade, subject, classSize, curriculumType, user);
      aiContent = { ...fallback, ...aiContent };

      console.log(`✅ ${curriculumType.toUpperCase()} lesson generated with DeepSeek`);

    } catch (error) {
      console.log('⚠️ DeepSeek error, using fallback:', error.message);
      useFallback = true;
    }

    if (useFallback || !aiContent) {
      console.log(`📝 Using ${curriculumType.toUpperCase()} fallback`);
      aiContent = generateFallbackLesson(topic, grade, subject, classSize, curriculumType, user);
    }

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

    console.log('📝 Generating scheme with DeepSeek...');
    
    const assessmentWeeksList = assessmentWeeks || [3, 6, 9, 12];
    const customTopics = weekTopics || {};
    const totalWeeksCount = totalWeeks || 13;
    const subtopicsList = subtopic ? subtopic.split(',').map(s => s.trim()) : [];
    
    let aiContent = null;
    let useFallback = false;
    
    try {
      let customTopicsString = '';
      Object.keys(customTopics).forEach(week => {
        if (customTopics[week]) {
          customTopicsString += `Week ${week}: ${customTopics[week]}\n`;
        }
      });

      const prompt = `
Grade: "${grade}"
Subject: "${subject}"
Term: "${term || 'Term 1'}"
${customTopicsString ? `User topics:\n${customTopicsString}` : 'Generate appropriate topics for all weeks.'}
Assessment weeks: ${assessmentWeeksList.join(', ')}

Return ONLY valid JSON with this structure:
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

      const messages = [
        {
          role: "system",
          content: `
You are an expert curriculum planner for Zambian schools.

The user will provide grade, subject, and term information.
Parse the information and output it in valid JSON format.

Return ONLY the JSON object, no other text.
`
        },
        {
          role: "user",
          content: prompt
        }
      ];

      aiContent = await generateDeepSeekJSON(messages, { 
        max_tokens: 3000,
        temperature: 0.1
      });
      
      console.log('✅ DeepSeek generated scheme successfully');

    } catch (error) {
      console.log('⚠️ DeepSeek error, using fallback:', error.message);
      useFallback = true;
    }
    
    if (!aiContent || useFallback) {
      console.log('📝 Using fallback scheme generator');
      aiContent = generateFallbackScheme(grade, subject, term, user, customTopics);
    }
    
    const weeks = aiContent.weeks.map(week => ({
      week: week.week,
      topics: week.topics.map(topic => ({
        topic: topic.topic || '',
        specificOutcome: topic.specificOutcome || '',
        methods: topic.methods || '',
        aids: topic.aids || '',
        references: topic.references || '',
        knowledge: topic.knowledge || '',
        skills: topic.skills || '',
        values: topic.values || ''
      })),
      assessment: week.assessment || null
    }));

    if (subtopicsList.length > 0) {
      let weekIndex = 0;
      for (let i = 0; i < weeks.length; i++) {
        if (!assessmentWeeksList.includes(weeks[i].week) && ![1, 5, 9].includes(weeks[i].week)) {
          if (weekIndex < subtopicsList.length) {
            weeks[i].topics[0].topic = subtopicsList[weekIndex];
            weeks[i].topics[0].specificOutcome = `By the end of this lesson, learners will be able to understand and explain ${subtopicsList[weekIndex]}`;
            weekIndex++;
          }
        }
      }
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

    console.log('✅ Scheme generated successfully');
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

// ============ SCHEME EXPORT ROUTES (FIXED - PROPER WORD AND PDF) ============

// Export Scheme as Word (DOCX) - FIXED
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

    // Build table rows
    const tableRows = [];

    // Add header row
    const headerRow = new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: 'WEEK', bold: true })], width: { size: 5, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'TOPIC', bold: true })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'SPECIFIC OUTCOME', bold: true })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'METHODS', bold: true })], width: { size: 15, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'AIDS', bold: true })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'REFERENCES', bold: true })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'KNOWLEDGE', bold: true })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'SKILLS', bold: true })], width: { size: 5, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'VALUES', bold: true })], width: { size: 5, type: WidthType.PERCENTAGE } }),
      ],
    });
    tableRows.push(headerRow);

    // Add data rows
    scheme.weeks.forEach(week => {
      const topics = week.topics || [];
      
      const topicText = topics.map(t => t.topic || '').join('\n');
      const outcomeText = topics.map(t => t.specificOutcome || '').join('\n');
      const methodsText = topics.map(t => t.methods || '').join('\n');
      const aidsText = topics.map(t => t.aids || '').join('\n');
      const refsText = topics.map(t => t.references || '').join('\n');
      const knowledgeText = topics.map(t => t.knowledge || '').join('\n');
      const skillsText = topics.map(t => t.skills || '').join('\n');
      const valuesText = topics.map(t => t.values || '').join('\n');

      const dataRow = new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: String(week.week) })] }),
          new TableCell({ children: [new Paragraph({ text: topicText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: outcomeText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: methodsText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: aidsText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: refsText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: knowledgeText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: skillsText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: valuesText || '-' })] }),
        ],
      });
      tableRows.push(dataRow);
    });

    // Create the document
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: 'MINISTRY OF EDUCATION',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: 'SCHEME OF WORK',
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: `School: ${scheme.school || 'School Name'}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Subject: ${scheme.subject}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Grade: ${scheme.grade}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Term: ${scheme.term}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Year: ${scheme.year}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Assessment Weeks: ${scheme.assessmentWeeks?.join(', ') || 'None'}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: '' }),
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: '© 2026 mytoolbox - Made for teachers in Zambia',
            alignment: AlignmentType.CENTER,
          }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="scheme_${scheme.id}.docx"`);
    res.send(buffer);

  } catch (error) {
    console.error('❌ Word export error:', error);
    res.status(500).json({ error: 'Failed to export scheme as Word' });
  }
});

// Export Scheme as PDF - FIXED
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

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="scheme_${scheme.id}.pdf"`);
    doc.pipe(res);

    // Title
    doc.fontSize(18).text('MINISTRY OF EDUCATION', { align: 'center' });
    doc.fontSize(14).text('SCHEME OF WORK', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`School: ${scheme.school || 'School Name'}`, { align: 'center' });
    doc.text(`Subject: ${scheme.subject}`, { align: 'center' });
    doc.text(`Grade: ${scheme.grade}`, { align: 'center' });
    doc.text(`Term: ${scheme.term}`, { align: 'center' });
    doc.text(`Year: ${scheme.year}`, { align: 'center' });
    doc.text(`Assessment Weeks: ${scheme.assessmentWeeks?.join(', ') || 'None'}`, { align: 'center' });
    doc.moveDown();

    // Table
    const tableTop = doc.y;
    const columnWidths = [40, 70, 80, 70, 60, 60, 60, 50, 50];
    const headers = ['WEEK', 'TOPIC', 'SPECIFIC OUTCOME', 'METHODS', 'AIDS', 'REFERENCES', 'KNOWLEDGE', 'SKILLS', 'VALUES'];
    
    // Draw headers
    let x = 50;
    let y = tableTop;
    
    // Header background
    doc.rect(50, y - 5, 495, 25).fill('#e0e0e0');
    doc.fillColor('black');
    
    headers.forEach((header, i) => {
      doc.fontSize(9).text(header, x, y, { width: columnWidths[i], align: 'center' });
      x += columnWidths[i];
    });
    
    y += 25;
    
    // Draw rows
    scheme.weeks.forEach(week => {
      const topics = week.topics || [];
      const topicText = topics.map(t => t.topic || '').join('\n');
      const outcomeText = topics.map(t => t.specificOutcome || '').join('\n');
      const methodsText = topics.map(t => t.methods || '').join('\n');
      const aidsText = topics.map(t => t.aids || '').join('\n');
      const refsText = topics.map(t => t.references || '').join('\n');
      const knowledgeText = topics.map(t => t.knowledge || '').join('\n');
      const skillsText = topics.map(t => t.skills || '').join('\n');
      const valuesText = topics.map(t => t.values || '').join('\n');
      
      const rowData = [
        String(week.week),
        topicText || '-',
        outcomeText || '-',
        methodsText || '-',
        aidsText || '-',
        refsText || '-',
        knowledgeText || '-',
        skillsText || '-',
        valuesText || '-'
      ];
      
      let maxHeight = 20;
      rowData.forEach((text, i) => {
        const lines = doc.fontSize(8).text(text, 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y, {
          width: columnWidths[i],
          align: 'left',
          ellipsis: true,
        });
        const height = doc.heightOfString(text, { width: columnWidths[i] });
        if (height > maxHeight) maxHeight = height;
      });
      
      // Draw row borders
      let currentX = 50;
      rowData.forEach((text, i) => {
        doc.rect(currentX, y, columnWidths[i], maxHeight + 5).stroke();
        currentX += columnWidths[i];
      });
      
      y += maxHeight + 10;
      
      // Check for page break
      if (y > 750) {
        doc.addPage();
        y = 50;
      }
    });
    
    // Footer
    doc.moveDown();
    doc.fontSize(10).text('© 2026 mytoolbox - Made for teachers in Zambia', { align: 'center' });
    
    doc.end();

  } catch (error) {
    console.error('❌ PDF export error:', error);
    res.status(500).json({ error: 'Failed to export scheme as PDF' });
  }
});

// ============ NOTES ROUTES ============

app.get('/api/notes', authenticate, async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
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
    const note = await prisma.note.findUnique({
      where: { id: id },
    });
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    if (note.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    res.json(note);
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

app.post('/api/notes', authenticate, async (req, res) => {
  try {
    const { title, content, subject, grade } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    const note = await prisma.note.create({
      data: {
        userId: req.userId,
        title,
        content,
        subject,
        grade,
      }
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
    const existingNote = await prisma.note.findUnique({
      where: { id: id },
    });
    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found' });
    }
    if (existingNote.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
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
    const existingNote = await prisma.note.findUnique({
      where: { id: id },
    });
    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found' });
    }
    if (existingNote.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    await prisma.note.delete({
      where: { id: id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ============ ASSESSMENTS ROUTES ============

app.get('/api/assessments', authenticate, async (req, res) => {
  try {
    const assessments = await prisma.assessment.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
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
    const assessment = await prisma.assessment.findUnique({
      where: { id: id },
    });
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (assessment.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    res.json(assessment);
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
});

app.post('/api/assessments', authenticate, async (req, res) => {
  try {
    const { title, type, subject, grade, description, questions, maxScore } = req.body;
    if (!title || !type) {
      return res.status(400).json({ error: 'Title and type are required' });
    }
    const assessment = await prisma.assessment.create({
      data: {
        userId: req.userId,
        title,
        type,
        subject,
        grade,
        description,
        questions: questions || [],
        maxScore: maxScore || 0,
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
    const existingAssessment = await prisma.assessment.findUnique({
      where: { id: id },
    });
    if (!existingAssessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (existingAssessment.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
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
    const existingAssessment = await prisma.assessment.findUnique({
      where: { id: id },
    });
    if (!existingAssessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (existingAssessment.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    await prisma.assessment.delete({
      where: { id: id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting assessment:', error);
    res.status(500).json({ error: 'Failed to delete assessment' });
  }
});

// ============ PAYMENT ROUTES ============

app.post('/api/payments/initiate', authenticate, async (req, res) => {
  try {
    console.log('📥 Payment request body:', req.body);
    
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

// ============ ADMIN ROUTES ============

// Check if user is admin middleware
const isAdmin = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true }
    });
    
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get admin dashboard stats
app.get('/api/admin/stats', authenticate, isAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      totalLessons,
      totalSchemes,
      totalPayments,
      recentUsers
    ] = await Promise.all([
      prisma.user.count(),
      prisma.lesson.count(),
      prisma.scheme.count(),
      prisma.payment.count(),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          school: true,
          role: true,
          createdAt: true
        }
      })
    ]);

    res.json({
      stats: {
        totalUsers,
        totalLessons,
        totalSchemes,
        totalPayments
      },
      recentUsers
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// Get all users (admin only)
app.get('/api/admin/users', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        school: true,
        province: true,
        district: true,
        role: true,
        lessonsUsed: true,
        lessonsLimit: true,
        schemesUsed: true,
        schemesLimit: true,
        createdAt: true,
        subscriptionEndsAt: true
      }
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user role (admin only)
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

// Get all lessons (admin only)
app.get('/api/admin/lessons', authenticate, isAdmin, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            school: true
          }
        }
      }
    });
    res.json(lessons);
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Get all schemes (admin only)
app.get('/api/admin/schemes', authenticate, isAdmin, async (req, res) => {
  try {
    const schemes = await prisma.scheme.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            school: true
          }
        }
      }
    });
    res.json(schemes);
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ error: 'Failed to fetch schemes' });
  }
});

// Get all payments (admin only)
app.get('/api/admin/payments', authenticate, isAdmin, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            fullName: true,
            email: true
          }
        }
      }
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
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

// ============ START SERVER ============
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
  console.log(`✅ Get lessons at /api/lessons`);
  console.log(`✅ Get schemes at /api/schemes`);
  console.log(`✅ Get lessons (alias) at /api/lessons/mine`);
  console.log(`✅ Get schemes (alias) at /api/schemes/mine`);
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
