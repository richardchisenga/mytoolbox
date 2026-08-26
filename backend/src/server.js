// src/server.js - Complete application with DeepSeek AI integration, Lipila payments, Notes, and Assessments
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

// ============ IMPROVED JSON PARSING HELPER ============

function safeParseJSON(content) {
  try {
    if (!content) return null;
    
    // Remove markdown code blocks
    let cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Try to find JSON object
    let jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    // Fix common JSON issues
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    cleaned = cleaned.replace(/'/g, '"');
    cleaned = cleaned.replace(/\\n/g, ' ');
    cleaned = cleaned.replace(/\\r/g, ' ');
    cleaned = cleaned.replace(/\\t/g, ' ');
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
    cleaned = cleaned.replace(/(\{|\,)\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
    
    // Fix missing commas between array elements
    cleaned = cleaned.replace(/\}\s*\{/g, '},{');
    cleaned = cleaned.replace(/\]\s*\[/g, '],[');
    cleaned = cleaned.replace(/"\s*"/g, '","');
    cleaned = cleaned.replace(/\}\s*"/g, '},"');
    cleaned = cleaned.replace(/"\s*\{/g, '",{');
    
    // Handle incomplete JSON - count brackets and add missing ones
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
    console.log('⚠️ JSON parse failed:', error.message);
    console.log('📝 Content preview:', content.substring(0, 300));
    return null;
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
          teacherActivity: `Teacher writes the example on the board and explains the concept of ${topic}`,
          pupilActivity: "Learners to write the example in their exercise books and listen attentively",
          methods: "Teacher Exposition, Demonstration"
        },
        {
          content: `Main content and examples of ${topic}`,
          teacherActivity: `Teacher solves ${topic} problems on the board and allows learners to ask questions`,
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

// ============ ENHANCED FALLBACK SCHEME GENERATOR ============

function generateFallbackScheme(grade, subject, term, user, customTopics = {}) {
  const weeks = [];
  const totalWeeks = 13;
  
  const subjectTopics = {
    'Biology': [
      'Cell Structure and Function',
      'Genetics and Heredity',
      'Ecology and Environment',
      'Human Anatomy',
      'Plant Physiology',
      'Sense Organs and Locomotion',
      'Reproduction',
      'Nutrition',
      'Transport Systems',
      'Respiration',
      'Excretion',
      'Nervous System',
      'Endocrine System',
      'Immunity and Disease',
      'Evolution'
    ],
    'Mathematics': [
      'Algebra and Equations',
      'Geometry and Trigonometry',
      'Statistics and Probability',
      'Calculus',
      'Vectors and Matrices',
      'Sets and Logic',
      'Number Theory',
      'Graphs and Functions',
      'Sequences and Series',
      'Differentiation',
      'Integration',
      'Complex Numbers',
      'Linear Programming',
      'Financial Mathematics',
      'Mechanics'
    ],
    'Chemistry': [
      'Atomic Structure',
      'Chemical Bonding',
      'Organic Chemistry',
      'Acids and Bases',
      'Periodic Table',
      'Stoichiometry',
      'Thermodynamics',
      'Kinetics',
      'Electrochemistry',
      'Equilibrium',
      'Chemical Reactions',
      'States of Matter',
      'Solutions',
      'Environmental Chemistry',
      'Biochemistry'
    ],
    'Physics': [
      'Mechanics',
      'Thermodynamics',
      'Waves and Sound',
      'Electricity and Magnetism',
      'Optics',
      'Nuclear Physics',
      'Kinematics',
      'Dynamics',
      'Gravitation',
      'Quantum Physics',
      'Astrophysics',
      'Fluid Mechanics',
      'Relativity',
      'Electronics',
      'Energy and Power'
    ],
    'English': [
      'Grammar and Usage',
      'Literature',
      'Composition Writing',
      'Vocabulary Development',
      'Reading Comprehension',
      'Speech and Drama',
      'Poetry',
      'Novel Studies',
      'Essay Writing',
      'Creative Writing',
      'Journalism',
      'Public Speaking',
      'Debate',
      'Media Studies',
      'Communication Skills'
    ],
    'History': [
      'Pre-Colonial History',
      'Colonial Era',
      'Independence Movements',
      'Post-Colonial Development',
      'World Wars',
      'Ancient Civilizations',
      'African History',
      'Zambian History',
      'Economic Development',
      'Political Systems',
      'Social Movements',
      'Cultural Heritage',
      'International Relations',
      'Democracy',
      'Human Rights'
    ],
    'Geography': [
      'Physical Geography',
      'Human Geography',
      'Map Reading',
      'Climate and Weather',
      'Population Studies',
      'Environmental Geography',
      'Economic Geography',
      'Settlement Geography',
      'Transport and Trade',
      'Development Geography',
      'Geographical Information Systems',
      'Natural Disasters',
      'Conservation',
      'Urbanization',
      'Globalization'
    ]
  };

  const topicsList = subjectTopics[subject] || [
    `Introduction to ${subject}`,
    `Basic concepts of ${subject}`,
    `Advanced ${subject} topics`,
    `Practical applications of ${subject}`,
    `Review and assessment of ${subject}`,
    `Further studies in ${subject}`,
    `Special topics in ${subject}`,
    `Research in ${subject}`,
    `Applied ${subject}`,
    `Future directions in ${subject}`,
    `Case studies in ${subject}`,
    `Innovations in ${subject}`,
    `Challenges in ${subject}`,
    `Solutions in ${subject}`,
    `Global perspectives on ${subject}`
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

// ============ LESSON GENERATION ROUTE ============

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
        prompt = `
You are an expert Zambian teacher creating an OBC lesson plan for ${grade} ${subject} on: "${topic}".

Return ONLY valid JSON:
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
  "references": ["Textbook", "Teacher's Guide"],
  "teachingAids": ["Chalk board", "Chart"],
  "rationale": "This lesson develops knowledge of ${topic}.",
  "learningOutcomes": ["Define ${topic}", "Apply ${topic}", "Analyze ${topic}"],
  "prerequisiteKnowledge": "Basic knowledge",
  "lessonIntroduction": "Teacher revises previous lesson",
  "lessonDevelopment": [
    {"content": "Introduction", "teacherActivity": "Explain", "pupilActivity": "Listen", "methods": "Lecture"}
  ],
  "learnersEvaluation": ["Define ${topic}", "Give examples"],
  "expectedAnswers": ["Correct definition", "Valid examples"],
  "lessonConclusion": "Teacher concludes lesson",
  "teacherEvaluation": "Lesson was successful"
}
Keep it SHORT. Valid JSON only.
`;
      } else {
        prompt = `
You are an expert Zambian teacher creating a CBC lesson plan for ${grade} ${subject} on: "${topic}".

Return ONLY valid JSON:
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
  "generalCompetences": ["Critical thinking", "Communication", "Collaboration"],
  "specificCompetence": "Understand ${topic}",
  "lessonGoal": "By the end, learners will understand ${topic}",
  "rationale": "${topic} is important for learners",
  "priorKnowledge": "Basic knowledge",
  "references": ["Textbook", "Teacher's Guide"],
  "learningEnvironment": "Classroom",
  "materials": ["Whiteboard", "Markers"],
  "expectedStandard": "Demonstrate understanding",
  "lessonProgression": [
    {"stage": "INTRODUCTION", "time": "5 min", "teacherRole": "Introduce", "learnerRole": "Listen", "assessmentCriteria": "Participation"}
  ],
  "homework": "Research ${topic}",
  "lessonEvaluation": "Successful",
  "teacherEvaluation": "To be filled"
}
Keep it SHORT. Valid JSON only.
`;
      }

      console.log(`📝 Generating ${curriculumType.toUpperCase()} lesson...`);

      const response = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "Return valid JSON only. Keep it short." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });

      let content = response.choices[0].message.content;
      content = content.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
      
      aiContent = JSON.parse(content);
      
      const fallback = generateFallbackLesson(topic, grade, subject, classSize, curriculumType, user);
      aiContent = { ...fallback, ...aiContent };

      console.log(`✅ ${curriculumType.toUpperCase()} lesson generated`);

    } catch (error) {
      console.log('⚠️ Error, using fallback:', error.message);
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

    console.log('📝 Generating scheme...');
    
    const assessmentWeeksList = assessmentWeeks || [3, 6, 9, 12];
    const customTopics = weekTopics || {};
    const totalWeeksCount = totalWeeks || 13;
    const subtopicsList = subtopic ? subtopic.split(',').map(s => s.trim()) : [];
    
    let aiContent = null;
    let useFallback = false;
    
    try {
      const prompt = `
Create a Scheme of Work for ${grade} ${subject}. Return JSON:
{
  "weeks": [
    {"week": 1, "topics": [{"topic": "Topic", "specificOutcome": "Outcome", "methods": "Methods", "aids": "Aids", "references": "References", "knowledge": "Knowledge", "skills": "Skills", "values": "Values"}], "assessment": null}
  ],
  "assessmentWeeks": [3, 6, 9, 12],
  "testTopics": ["Mid-term", "End of term"]
}
Keep it SHORT. Valid JSON only.
`;
      
      const response = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "Return valid JSON only. Keep it short." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      });
      
      aiContent = safeParseJSON(response.choices[0].message.content);
      
      if (aiContent) {
        console.log('✅ DeepSeek generated scheme successfully');
      } else {
        useFallback = true;
      }
    } catch (error) {
      console.log('⚠️ DeepSeek error, using fallback');
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

// ============ SCHEME EXPORT ROUTES ============

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

// ============ NOTES ROUTES ============

// Get all notes for the current user
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

// Get a specific note by ID
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

// Create a new note
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

// Update a note
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

// Delete a note
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

// Get all assessments for the current user
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

// Get a specific assessment by ID
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

// Create a new assessment
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

// Submit/complete an assessment
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

// Delete an assessment
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
  console.log(`✅ Notes routes available at /api/notes`);
  console.log(`✅ Assessments routes available at /api/assessments`);
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
