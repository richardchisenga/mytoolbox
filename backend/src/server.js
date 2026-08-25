// src/server.js - Complete application with DeepSeek AI integration
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

// ============ DEEPSEEK AI CLIENT ============
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com"
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
    let cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
    let jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    cleaned = cleaned.replace(/'/g, '"');
    
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

// ============ FALLBACK SCHEME GENERATOR ============

function generateFallbackScheme(grade, subject, term, user, customTopics = {}) {
  const weeks = [];
  const totalWeeks = 13;
  
  const defaultTopics = [
    `Introduction to ${subject}`,
    `Basic concepts of ${subject}`,
    `Advanced ${subject} topics`,
    `Practical applications of ${subject}`,
    `Review and assessment of ${subject}`
  ];

  for (let i = 1; i <= totalWeeks; i++) {
    const weekTopics = [];
    const weekNumber = i;
    const customTopic = customTopics[weekNumber];
    
    if (customTopic) {
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
      const numTopics = 3 + Math.floor(Math.random() * 2);
      for (let j = 0; j < numTopics; j++) {
        const topicIndex = (i + j) % defaultTopics.length;
        weekTopics.push({
          topic: defaultTopics[topicIndex],
          specificOutcome: `By the end of this lesson, learners will be able to understand ${defaultTopics[topicIndex]}`,
          methods: "Lecture, discussion, group work, question and answer",
          aids: "Whiteboard, charts, textbooks, diagrams",
          references: "Textbook, Teacher's Guide",
          knowledge: `Knowledge of ${defaultTopics[topicIndex]}`,
          skills: "Critical thinking, analysis, collaboration",
          values: "Responsibility, teamwork, curiosity"
        });
      }
    }
    
    weeks.push({
      week: i,
      topics: weekTopics,
      assessment: i % 3 === 0 ? `End of Week ${i} Assessment` : null
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

// ============ LESSON GENERATION ROUTE (CBC & OBC FORMATS) ============

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
    let prompt;

    if (curriculumType === 'obc') {
      // OBC FORMAT PROMPT
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
  "classSize": ${parseInt(classSize) || 40},
  "boys": ${Math.floor(parseInt(classSize) / 2) || 18},
  "girls": ${Math.ceil(parseInt(classSize) / 2) || 22},
  "subtopic": "",
  "references": ["Reference 1", "Reference 2", "Reference 3"],
  "teachingAids": ["Chart", "Images", "Video", "PowerPoint slides", "Worksheet"],
  "rationale": "Why this topic is important for learners",
  "learningOutcomes": [
    "Outcome 1",
    "Outcome 2",
    "Outcome 3",
    "Outcome 4"
  ],
  "lessonDevelopment": [
    {
      "time": "10 min",
      "learningPoints": "Introduction: What is the topic?",
      "teacherActivities": "Ask questions, write definitions on board",
      "pupilActivities": "Define in their own words, participate"
    },
    {
      "time": "20 min",
      "learningPoints": "Key concepts and their sources",
      "teacherActivities": "List key points with sources, use diagrams",
      "pupilActivities": "Complete tables, take notes"
    },
    {
      "time": "20 min",
      "learningPoints": "Main content and examples",
      "teacherActivities": "Use charts and diagrams to explain",
      "pupilActivities": "Label diagrams, write examples"
    },
    {
      "time": "15 min",
      "learningPoints": "Distinctions and applications",
      "teacherActivities": "Give contrasting examples",
      "pupilActivities": "Classify given processes"
    },
    {
      "time": "15 min",
      "learningPoints": "Conclusion and summary",
      "teacherActivities": "Lead oral quiz and recap",
      "pupilActivities": "Answer worksheet questions"
    }
  ],
  "learnersEvaluation": [
    "Question 1",
    "Question 2",
    "Question 3",
    "Question 4",
    "Question 5"
  ],
  "teacherEvaluation": "Space for teacher's reflections",
  "lessonConclusion": "Teacher to conclude lesson by revising through the lesson with learners to help remedial learners"
}

🔴 RULES:
- Keep content concise, clear, and aligned with the OBC curriculum.
- Return ONLY the JSON object, no other text.
`;
    } else {
      // CBC FORMAT PROMPT
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
  "classSize": ${parseInt(classSize) || 40},
  "boys": ${Math.floor(parseInt(classSize) / 2) || 18},
  "girls": ${Math.ceil(parseInt(classSize) / 2) || 22},
  "subtopic": "",
  "generalCompetences": ["Critical thinking", "Creativity", "Communication", "Collaboration"],
  "specificCompetence": "Specific competence statement",
  "lessonGoal": "By the end of this lesson, learners will be able to...",
  "rationale": "Why this topic is important for learners",
  "priorKnowledge": "What learners already know",
  "references": ["Reference 1", "Reference 2"],
  "learningEnvironment": "classroom, laboratory, school garden",
  "materials": ["Material 1", "Material 2", "Material 3"],
  "expectedStandard": "What learners should achieve",
  "lessonProgression": [
    {
      "stage": "INTRODUCTION",
      "time": "5 min",
      "teacherRole": "Ask engaging questions to introduce the topic",
      "learnerRole": "Listen, participate, and give examples",
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
      "stage": "EXERCISE/ASSESSMENT",
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
  "homework": "Research and write about the topic",
  "lessonEvaluation": "Lesson was successful, key competences were acquired"
}

🔴 RULES:
- Keep content concise, clear, and aligned with the CBC curriculum.
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
      max_tokens: 4096
    });

    let aiContent = safeParseJSON(response.choices[0].message.content);
    
    if (!aiContent) {
      console.log('⚠️ DeepSeek parsing failed, using fallback lesson');
      aiContent = {
        title: topic,
        learningOutcomes: [`Understand ${topic}`, `Apply ${topic}`, `Analyze ${topic}`],
        lessonDevelopment: [
          { time: "10 min", learningPoints: `Introduction to ${topic}`, teacherActivities: "Explain the concept", pupilActivities: "Listen and take notes" },
          { time: "20 min", learningPoints: `Practical application of ${topic}`, teacherActivities: "Guide students", pupilActivities: "Work in groups" },
          { time: "10 min", learningPoints: `Review of ${topic}`, teacherActivities: "Summarize key points", pupilActivities: "Ask questions" }
        ],
        learnersEvaluation: [`Define ${topic}`, `Give examples of ${topic}`, `Solve a ${topic} problem`],
        teacherEvaluation: "To be filled after lesson",
        generalCompetences: ["Critical thinking", "Communication", "Collaboration"],
        specificCompetence: `Demonstrate understanding of ${topic}`,
        lessonGoal: `By the end of this lesson, learners will be able to apply ${topic} in real-world contexts`,
        rationale: `${topic} is essential for understanding advanced concepts`,
        priorKnowledge: `Basic knowledge of ${subject}`,
        references: [`${subject} Grade ${grade} Textbook`, "Teacher's Guide"],
        learningEnvironment: "Classroom with adequate resources",
        materials: ["Whiteboard", "Markers", "Worksheets"],
        expectedStandard: `Learners will be able to solve ${topic} problems independently`,
        lessonProgression: [
          { stage: "INTRODUCTION", time: "10 min", teacherRole: "Introduce topic", learnerRole: "Listen and participate", assessmentCriteria: "Participation" },
          { stage: "DEVELOPMENT", time: "20 min", teacherRole: "Guide activities", learnerRole: "Practice in groups", assessmentCriteria: "Task completion" },
          { stage: "CONCLUSION", time: "10 min", teacherRole: "Review key points", learnerRole: "Share findings", assessmentCriteria: "Verbal explanation" }
        ],
        homework: `Solve ${topic} problems`,
        lessonEvaluation: "Learners demonstrated good understanding",
        curriculum: curriculumType
      };
    }

    console.log(`✅ ${curriculumType.toUpperCase()} lesson generated successfully`);

    // Save lesson to database
    const lesson = await prisma.lesson.create({
      data: {
        userId: req.userId,
        grade: grade,
        subject: subject,
        topic: topic,
        subtopic: aiContent.subtopic || '',
        title: aiContent.title || topic,
        classSize: parseInt(classSize) || 40,
        duration: aiContent.duration || '40 min',
        curriculum: curriculumType,
        objectives: aiContent.learningOutcomes || [`Understand ${topic}`],
        development: aiContent.lessonDevelopment?.map(d => d.learningPoints) || [],
        activities: aiContent.lessonDevelopment?.map(d => d.pupilActivities) || [],
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
        teachingAids: aiContent.teachingAids || [],
        lessonConclusion: aiContent.lessonConclusion || ''
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
      classSize: parseInt(classSize) || 40,
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

    // Build custom topics string
    let customTopicsString = '';
    const customTopicsMap = weekTopics || {};
    Object.keys(customTopicsMap).forEach(week => {
      if (customTopicsMap[week]) {
        customTopicsString += `Week ${week}: ${customTopicsMap[week]}\n`;
      }
    });

    console.log('📝 Custom topics:', customTopicsString || 'None provided');
    console.log('📝 Subtopic:', subtopic || 'None provided');

    const assessmentWeeksString = assessmentWeeks ? assessmentWeeks.join(', ') : '3, 6, 9, 12';

    const prompt = `
You are an expert curriculum planner for Zambian schools. Create a Scheme of Work for Grade ${grade} ${subject} for ${term || 'Term 1'}.

The user has specified these topics:
${customTopicsString || 'Generate appropriate topics for all weeks.'}

Assessment weeks are: ${assessmentWeeksString}

⚠️ CRITICAL: You MUST return ONLY valid JSON that EXACTLY matches this structure:

{
  "weeks": [
    {
      "week": 1,
      "topics": [
        {
          "topic": "The specific topic name",
          "specificOutcome": "What learners should achieve by the end of the lesson",
          "methods": "Teaching and learning methods (e.g., Lecture, discussion, group work, question and answer)",
          "aids": "Teaching and learning aids (e.g., Whiteboard, charts, textbooks, diagrams)",
          "references": "Reference books and materials (e.g., Textbook, Teacher's Guide)",
          "knowledge": "Knowledge learners will gain",
          "skills": "Skills learners will develop",
          "values": "Values learners will adopt"
        }
      ],
      "assessment": "Assessment for this week (can be null for non-assessment weeks)"
    }
  ],
  "assessmentWeeks": [3, 6, 9, 12],
  "testTopics": ["Mid-term test", "End of term test"]
}

🔴 RULES:
- For weeks where the user specified a topic, use that EXACT topic.
- For assessment weeks, the topic should be "Assessment" or the user's specified test topic.
- Each week can have 1-3 topics.
- Keep content concise and curriculum-aligned.
- Return ONLY the JSON object, no other text.
`;

    console.log('📝 Generating scheme with DeepSeek...');

    const response = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are an expert curriculum planner for Zambian schools. Always return valid JSON in the exact format specified. Never add extra text." },
        { role: "user", content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 3000
    });

    let aiContent = safeParseJSON(response.choices[0].message.content);
    
    if (!aiContent) {
      console.log('📝 Using fallback scheme generator');
      aiContent = generateFallbackScheme(grade, subject, term, user, customTopicsMap);
    }

    console.log('✅ Scheme generated successfully');

    // Structure the scheme data
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

    const generatedScheme = {
      grade: grade,
      subject: subject,
      term: term || 'Term 1',
      year: year || new Date().getFullYear().toString(),
      totalWeeks: totalWeeks || 13,
      school: school || user.school || '',
      teacherName: user.fullName || '',
      subtopic: subtopic || '',
      weeks: weeks,
      assessmentWeeks: aiContent.assessmentWeeks || assessmentWeeks || [3, 6, 9, 12],
      testTopics: aiContent.testTopics || testTopics || [`Mid-term test on ${subject}`, `End of term test on ${subject}`],
      createdAt: new Date().toISOString()
    };

    // Save scheme to database
    const scheme = await prisma.scheme.create({
      data: {
        userId: req.userId,
        grade: grade,
        subject: subject,
        term: term || 'Term 1',
        year: year || new Date().getFullYear().toString(),
        totalWeeks: totalWeeks || 13,
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
  console.log(`✅ Get lessons at /api/lessons`);
  console.log(`✅ Get schemes at /api/schemes`);
  console.log(`✅ Get lessons (alias) at /api/lessons/mine`);
  console.log(`✅ Get schemes (alias) at /api/schemes/mine`);
  console.log(`✅ DeepSeek AI integration enabled`);
  console.log(`✅ CORS enabled for Vercel and Render frontend`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  prisma.$disconnect();
  process.exit(0);
});
