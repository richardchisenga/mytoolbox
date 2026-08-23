const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// ✅ FORCE MOCK MODE
const ALLOW_MOCK_GENERATION = true;

const prisma = new PrismaClient();

// Try to load OpenAI (DeepSeek uses the same client)
let OpenAI;
try {
  OpenAI = require('openai');
} catch (error) {
  console.log('⚠️ OpenAI package not installed');
}

// Configure DeepSeek client
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

// Authentication middleware
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

// Check lesson limit for freemium
const checkLessonLimit = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  const now = new Date();
  const lastReset = new Date(user.lastResetAt);
  
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lessonsUsed: 0,
        lastResetAt: now
      }
    });
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId }
    });
    return {
      allowed: true,
      remaining: updatedUser.lessonsLimit,
      role: updatedUser.role,
      used: 0
    };
  }

  if (user.role === 'PRO' || user.role === 'SCHOOL') {
    return { allowed: true, remaining: 'Unlimited', role: user.role, used: user.lessonsUsed };
  }

  if (user.lessonsUsed >= user.lessonsLimit) {
    return {
      allowed: false,
      remaining: 0,
      role: user.role,
      used: user.lessonsUsed,
      message: 'You have used all 5 free lessons this month. Upgrade to Pro for unlimited lessons!'
    };
  }

  return {
    allowed: true,
    remaining: user.lessonsLimit - user.lessonsUsed,
    role: user.role,
    used: user.lessonsUsed
  };
};

// ============================================
// CBC PROMPT BUILDER
// ============================================

function buildCBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return `
You are an expert Zambian teacher creating a CBC (Competency-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

Teacher Name: ${teacherName}
School: ${schoolName}
Province: ${province}
District: ${district}

Follow the Ministry of Education CBC lesson plan template exactly.

Return ONLY valid JSON with this exact structure:

{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "teacherName": "${teacherName}",
  "school": "${schoolName}",
  "province": "${province}",
  "district": "${district}",
  "date": "${new Date().toISOString().split('T')[0]}",
  "time": "08:00-08:40",
  "duration": "40 min",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
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
`;
}

// ============================================
// OBC PROMPT BUILDER
// ============================================

function buildOBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return `
You are an expert Zambian teacher creating an OBC (Objective-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

Teacher Name: ${teacherName}
School: ${schoolName}
Province: ${province}
District: ${district}

Follow the Ministry of Education OBC lesson plan template exactly.

Return ONLY valid JSON with this exact structure:

{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "teacherName": "${teacherName}",
  "school": "${schoolName}",
  "province": "${province}",
  "district": "${district}",
  "date": "${new Date().toISOString().split('T')[0]}",
  "duration": "80 MINUTES",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
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
  ]
}
`;
}

// ============================================
// CBC MOCK LESSON - WITH SUBTOPIC
// ============================================

function generateCBCMockLesson(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return {
    id: `lesson-${Date.now()}`,
    userId: 'mock-user',
    title: topic,
    grade,
    subject,
    topic: topic,
    subtopic: '',  // ✅ ADDED
    teacherName: teacherName,
    school: schoolName,
    province: province,
    district: district,
    date: new Date().toISOString().split('T')[0],
    time: "10:20-11:00",
    duration: "40 min",
    classSize: size,
    boys: boys,
    girls: girls,
    generalCompetences: ["Analytical thinking", "Collaboration", "Communication", "Critical thinking"],
    specificCompetence: `Classify and explain the types of ${topic}`,
    lessonGoal: `By the end of this lesson, learners will be able to identify, classify, and explain the importance of ${topic}`,
    rationale: `Understanding ${topic} is essential for learners to make informed decisions and develop critical thinking skills.`,
    priorKnowledge: "Learners have basic knowledge of the topic from previous lessons",
    references: ["2026 Teaching Module", "Curriculum Guide"],
    learningEnvironment: "Classroom, laboratory, school garden",
    materials: ["Manila paper", "Markers", "Charts", "Worksheet"],
    expectedStandard: "Topic concepts classified correctly",
    lessonProgression: [
      { stage: "INTRODUCTION", time: "5 min", teacherRole: "Ask: 'What do you know about this topic?'", learnerRole: "Listen, participate, give examples", assessmentCriteria: "Observation of participation" },
      { stage: "LESSON DEVELOPMENT", time: "10 min", teacherRole: "Explain key concepts and demonstrate", learnerRole: "Take notes, ask questions, discuss", assessmentCriteria: "Correct understanding of concepts" },
      { stage: "ACTIVITY 1", time: "11 min", teacherRole: "Guide group work and provide materials", learnerRole: "Work in groups, complete tasks", assessmentCriteria: "Group collaboration and task completion" },
      { stage: "ACTIVITY 2", time: "16 min", teacherRole: "Facilitate presentations and consolidate", learnerRole: "Present findings and correct own work", assessmentCriteria: "Accurate presentation" },
      { stage: "EXERCISE", time: "20 min", teacherRole: "Give assessment and monitor", learnerRole: "Complete assessment individually", assessmentCriteria: "Correct classification" },
      { stage: "CONCLUSION", time: "10 min", teacherRole: "Summarize key points", learnerRole: "Share what they learned", assessmentCriteria: "Verbal explanation" }
    ],
    homework: `Research and list local examples of ${topic}`,
    lessonEvaluation: "Lesson was successful, key competences were acquired",
    curriculum: 'cbc',
    objectives: [
      `By the end of this lesson, learners will be able to explain the key concepts of ${topic}`,
      `Apply knowledge of ${topic} to solve problems`,
      'Demonstrate understanding through practical activities'
    ],
    development: [
      'Introduction (5 min): Engage learners with real-world examples',
      'Main Activity (20 min): Group work exploring the topic',
      'Consolidation (10 min): Class discussion and clarification',
      'Conclusion (5 min): Summary and preview of next lesson'
    ],
    activities: [
      'Group discussion using local examples',
      'Hands-on activity with available materials',
      'Peer teaching and collaborative learning'
    ],
    assessment: 'Observation, participation, and a short written exercise',
    curriculumCodes: [
      'Outcome: Curriculum alignment (Matched)',
      'Competency: Critical thinking (Matched)'
    ],
    createdAt: new Date().toISOString()
  };
}

// ============================================
// OBC MOCK LESSON - WITH SUBTOPIC
// ============================================

function generateOBCMockLesson(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return {
    id: `lesson-${Date.now()}`,
    userId: 'mock-user',
    title: topic,
    grade,
    subject,
    topic: topic,
    subtopic: '',  // ✅ ADDED
    teacherName: teacherName,
    school: schoolName,
    province: province,
    district: district,
    date: new Date().toISOString().split('T')[0],
    duration: "80 MINUTES",
    classSize: size,
    boys: boys,
    girls: girls,
    references: [
      "Biological Science by Lisuba Bornface",
      "Simply Biology by Xavier (Page 80-81)",
      "Biology 12 Golden Tips"
    ],
    teachingAids: ["Chart of excretory organs", "Images of metabolic wastes", "Video on deamination", "PowerPoint slides", "Worksheet"],
    rationale: "Excretion is the removal of metabolic wastes that would otherwise become toxic. This lesson introduces the concept of excretion and distinguishes it from egestion and secretion. Understanding which wastes are produced and which organs remove them is essential for later topics on kidney function, osmoregulation, and homeostasis.",
    learningOutcomes: [
      "Define excretion and differentiate it from egestion and secretion.",
      "Name the main metabolic waste products (CO₂, urea, water, salts, bile pigments).",
      "List the principal excretory organs (lungs, kidneys, skin, liver) and state what each excretes.",
      "Explain how the liver produces urea (deamination of amino acids)."
    ],
    lessonDevelopment: [
      {
        time: "10 MIN",
        learningPoints: "INTRODUCTION: What is Excretion? – Removal of metabolic wastes. Distinguish from egestion (undigested food) and secretion (useful substances).",
        teacherActivities: "Teacher asks: 'What is the difference between faeces and urine?' Writes definitions on board.",
        pupilActivities: "Pupils define excretion in their own words."
      },
      {
        time: "20 MIN",
        learningPoints: "Metabolic wastes and their sources – CO₂ (respiration), urea (protein breakdown in liver), bile pigments (haemoglobin breakdown), excess water and salts.",
        teacherActivities: "Teacher lists wastes on board with their sources. Uses a diagram of the liver's role in deamination.",
        pupilActivities: "Pupils complete a table: waste → source → excretory organ."
      },
      {
        time: "20 MIN",
        learningPoints: "Excretory organs – Lungs (CO₂, water), Kidneys (urea, excess water/salts, toxins), Skin (water, salts, trace urea), Liver (converts amino acids to urea; excretes bile pigments into gut).",
        teacherActivities: "Teacher uses a body chart to point out each organ. Explains deamination simply.",
        pupilActivities: "Pupils label organs on a diagram and write one waste product for each."
      },
      {
        time: "15 MIN",
        learningPoints: "Distinctions – Excretion vs. egestion vs. secretion.",
        teacherActivities: "Teacher gives contrasting examples (e.g., sweating vs. passing faeces).",
        pupilActivities: "Pupils classify given processes as excretion, egestion, or secretion."
      },
      {
        time: "15 MIN",
        learningPoints: "CONCLUSION: Summary – Recap of wastes, organs, and distinctions.",
        teacherActivities: "Teacher leads oral quiz: 'Which organ removes CO₂?' 'What is deamination?'",
        pupilActivities: "Pupils answer worksheet questions."
      }
    ],
    learnersEvaluation: [
      "Define excretion.",
      "Name three metabolic waste products.",
      "Which organ excretes carbon dioxide?",
      "What is the difference between excretion and egestion?",
      "Why is the liver considered an excretory organ even though it does not directly expel waste?"
    ],
    teacherEvaluation: "Space for teacher's reflections",
    curriculum: 'obc',
    objectives: [
      `Define ${topic} and differentiate it from related concepts`,
      `Name the main types of ${topic}`,
      `List the principal organs/structures involved in ${topic}`,
      `Explain the importance of ${topic} in living organisms`
    ],
    development: [
      'Introduction (10 min): Engage learners with questions',
      'Main Activity (20 min): Group work exploring the topic',
      'Consolidation (20 min): Class discussion and clarification',
      'Application (15 min): Real-world examples',
      'Conclusion (15 min): Summary and quiz'
    ],
    activities: [
      'Group discussion using local examples',
      'Hands-on activity with available materials',
      'Peer teaching and collaborative learning'
    ],
    assessment: 'Observation, participation, and worksheet',
    curriculumCodes: [
      'Outcome: Curriculum alignment (Matched)',
      'Competency: Critical thinking (Matched)'
    ],
    createdAt: new Date().toISOString()
  };
}

// ============================================
// GENERATE LESSON
// ============================================

router.post('/generate', authenticate, async (req, res) => {
  try {
    const { grade, subject, topic, classSize, curriculum } = req.body;
    const size = parseInt(classSize) || 40;
    const boys = Math.floor(size * 0.45);
    const girls = size - boys;

    if (!grade || !subject || !topic) {
      return res.status(400).json({ error: 'Grade, subject, and topic are required' });
    }

    // ✅ Check lesson limit (freemium)
    const limitCheck = await checkLessonLimit(req.userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: limitCheck.message,
        remaining: 0,
        upgradeUrl: '/pricing',
        plan: 'free'
      });
    }

    // ✅ Get user info
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { fullName: true, school: true, province: true, district: true }
    });

    const teacherName = user?.fullName || 'MR/MRS';
    const schoolName = user?.school || 'KASHINAKAZHI SECONDARY SCHOOL';
    const province = user?.province || 'Southern';
    const district = user?.district || 'Itezhi-Tezhi';

    const curriculumType = curriculum || 'cbc';

    let prompt;
    if (curriculumType === 'obc') {
      prompt = buildOBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district);
    } else {
      prompt = buildCBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district);
    }

    let lessonData;
    let useMock = true;

    // ✅ Try DeepSeek
    if (deepseekClient && !ALLOW_MOCK_GENERATION) {
      try {
        console.log('📝 Calling DeepSeek API...');
        
        const completion = await deepseekClient.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "You are an expert Zambian teacher. Always respond with valid JSON only." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2048
        });

        console.log('📝 DeepSeek response received');

        try {
          const rawContent = completion.choices[0].message.content;
          const cleanedContent = rawContent
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
          lessonData = JSON.parse(cleanedContent);
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

    // Use mock if needed
    if (useMock) {
      console.log('📝 Generating mock lesson');
      if (curriculumType === 'obc') {
        lessonData = generateOBCMockLesson(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district);
      } else {
        lessonData = generateCBCMockLesson(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district);
      }
    }

    // ✅ Ensure all required fields exist
    lessonData.topic = lessonData.topic || topic;
    lessonData.title = lessonData.title || lessonData.topic || topic;
    lessonData.grade = lessonData.grade || grade;
    lessonData.subject = lessonData.subject || subject;
    lessonData.subtopic = lessonData.subtopic || '';
    lessonData.objectives = lessonData.objectives || [];
    lessonData.development = lessonData.development || [];
    lessonData.activities = lessonData.activities || [];
    lessonData.assessment = lessonData.assessment || '';
    lessonData.teacherEvaluation = lessonData.teacherEvaluation || '';
    lessonData.learningOutcomes = lessonData.learningOutcomes || [];
    lessonData.lessonDevelopment = lessonData.lessonDevelopment || [];
    lessonData.learnersEvaluation = lessonData.learnersEvaluation || [];
    lessonData.teachingAids = lessonData.teachingAids || [];

    // ✅ Save to database
    const lesson = {
      id: `lesson-${Date.now()}`,
      userId: req.userId,
      ...lessonData,
      teacherName: teacherName,
      school: schoolName,
      province: province,
      district: district,
      curriculum: curriculumType,
      classSize: size,
      createdAt: new Date().toISOString()
    };

    console.log('📝 Saving lesson...');

    await prisma.lesson.create({
      data: {
        id: lesson.id,
        userId: lesson.userId,
        grade: lesson.grade || '',
        subject: lesson.subject || '',
        topic: lesson.topic || '',
        subtopic: lesson.subtopic || '',
        title: lesson.title || lesson.topic || '',
        classSize: lesson.classSize || 40,
        duration: lesson.duration || '40 min',
        curriculum: lesson.curriculum || 'cbc',
        objectives: lesson.objectives || [],
        development: lesson.development || [],
        activities: lesson.activities || [],
        assessment: lesson.assessment || '',
        curriculumCodes: lesson.curriculumCodes || [],
        provinceContext: lesson.province || '',
        teacherName: lesson.teacherName || '',
        school: lesson.school || '',
        province: lesson.province || '',
        district: lesson.district || '',
        date: lesson.date || '',
        time: lesson.time || '',
        boys: lesson.boys || 0,
        girls: lesson.girls || 0,
        generalCompetences: lesson.generalCompetences || [],
        specificCompetence: lesson.specificCompetence || '',
        lessonGoal: lesson.lessonGoal || '',
        rationale: lesson.rationale || '',
        priorKnowledge: lesson.priorKnowledge || '',
        references: lesson.references || [],
        learningEnvironment: lesson.learningEnvironment || '',
        materials: lesson.materials || [],
        expectedStandard: lesson.expectedStandard || '',
        lessonProgression: lesson.lessonProgression || [],
        homework: lesson.homework || '',
        lessonEvaluation: lesson.lessonEvaluation || '',
        learningOutcomes: lesson.learningOutcomes || [],
        lessonDevelopment: lesson.lessonDevelopment || [],
        learnersEvaluation: lesson.learnersEvaluation || [],
        teachingAids: lesson.teachingAids || [],
        teacherEvaluation: lesson.teacherEvaluation || '',
      }
    });

    // ✅ Increment lesson count
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

// Get user's lessons
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

// ✅ Export the router
module.exports = router;
