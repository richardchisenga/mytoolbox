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
  // Remove markdown code blocks
  let cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
  
  // Try to find the JSON object
  let jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  // Fix common JSON issues
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  cleaned = cleaned.replace(/'/g, '"');
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // If still failing, try to fix incomplete JSON
    let fixed = cleaned;
    let openBraces = (fixed.match(/\{/g) || []).length;
    let closeBraces = (fixed.match(/\}/g) || []).length;
    while (closeBraces < openBraces) {
      fixed += '}';
      closeBraces++;
    }
    return JSON.parse(fixed);
  }
}

// ============ SHORTER PROMPTS ============

function buildCBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return `
Create a CBC lesson plan for ${grade} ${subject} on "${topic}".

Return ONLY valid JSON with these exact fields:
{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "generalCompetences": ["Critical thinking", "Communication", "Collaboration"],
  "specificCompetence": "Specific competence for this lesson",
  "lessonGoal": "By the end of this lesson, learners will be able to...",
  "rationale": "Why this topic is important",
  "priorKnowledge": "What learners already know",
  "references": ["Reference 1"],
  "learningEnvironment": "Classroom",
  "materials": ["Material 1"],
  "expectedStandard": "Expected achievement",
  "lessonProgression": [
    {"stage": "INTRODUCTION", "time": "5 min", "teacherRole": "Introduce topic", "learnerRole": "Listen", "assessmentCriteria": "Participation"},
    {"stage": "DEVELOPMENT", "time": "20 min", "teacherRole": "Explain concepts", "learnerRole": "Take notes", "assessmentCriteria": "Understanding"},
    {"stage": "CONCLUSION", "time": "10 min", "teacherRole": "Summarize", "learnerRole": "Share learning", "assessmentCriteria": "Verbal explanation"}
  ],
  "homework": "Research the topic",
  "lessonEvaluation": "Lesson was successful"
}
Keep it short and valid JSON.`;
}

function buildOBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return `
Create an OBC lesson plan for ${grade} ${subject} on "${topic}".

Return ONLY valid JSON with these exact fields:
{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "references": ["Reference 1", "Reference 2"],
  "teachingAids": ["Chart", "Whiteboard"],
  "rationale": "Why this topic is important",
  "learningOutcomes": ["Outcome 1", "Outcome 2"],
  "lessonDevelopment": [
    {"time": "10 min", "learningPoints": "Introduction", "teacherActivities": "Explain", "pupilActivities": "Listen"}
  ],
  "learnersEvaluation": ["Question 1", "Question 2"]
}
Keep it short and valid JSON.`;
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
      { stage: "INTRODUCTION", time: "5 min", teacherRole: "Introduce", learnerRole: "Listen", assessmentCriteria: "Participation" },
      { stage: "DEVELOPMENT", time: "20 min", teacherRole: "Explain", learnerRole: "Discuss", assessmentCriteria: "Understanding" },
      { stage: "CONCLUSION", time: "10 min", teacherRole: "Summarize", learnerRole: "Share", assessmentCriteria: "Verbal" }
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
    lessonDevelopment: [
      { time: "10 min", learningPoints: "Introduction", teacherActivities: "Explain", pupilActivities: "Listen" }
    ],
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
          temperature: 0.7,
          max_tokens: 1500 // Reduced to prevent truncation
        });

        console.log('📝 DeepSeek response received');

        try {
          const rawContent = completion.choices[0].message.content;
          lessonData = cleanAndParseJson(rawContent);
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
