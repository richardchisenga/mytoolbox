const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

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
  console.log('⚠️ DeepSeek not configured, using mock mode');
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

// Generate lesson using DeepSeek with CBC or OBC template
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { grade, subject, topic, classSize, curriculum } = req.body;

    if (!grade || !subject || !topic) {
      return res.status(400).json({ error: 'Grade, subject, and topic are required' });
    }

    // Determine curriculum type
    const curriculumType = curriculum || 'cbc'; // 'cbc' or 'obc'

    // Build the prompt based on curriculum type
    const prompt = buildLessonPrompt(grade, subject, topic, classSize, curriculumType);

    // If DeepSeek is configured, use it
    if (deepseekClient) {
      try {
        const completion = await deepseekClient.chat.completions.create({
          model: "deepseek-v4-flash",
          messages: [
            { role: "system", content: "You are an expert Zambian teacher following the Ministry of Education curriculum standards. Always respond with valid JSON only." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 4096
        });

        // Parse the response
        let lessonData;
        try {
          lessonData = JSON.parse(completion.choices[0].message.content);
        } catch (parseError) {
          console.log('⚠️ Failed to parse DeepSeek response, using fallback');
          throw new Error('Invalid JSON response');
        }

        const lesson = {
          id: `lesson-${Date.now()}`,
          userId: req.userId,
          ...lessonData,
          curriculum: curriculumType,
          classSize: classSize || 40,
          createdAt: new Date().toISOString()
        };

        console.log(`✅ Lesson generated with DeepSeek (${curriculumType}) for user:`, req.userId);
        return res.status(201).json(lesson);
      } catch (error) {
        console.error('❌ DeepSeek API error:', error.message);
        // Fall through to mock lesson
      }
    }

    // Fallback mock lesson with template structure
    const mockLesson = generateMockLesson(grade, subject, topic, classSize, curriculumType);
    res.status(201).json(mockLesson);

  } catch (error) {
    console.error('❌ Generation error:', error);
    res.status(500).json({ error: 'Failed to generate lesson' });
  }
});

// ============================================
// BUILD LESSON PROMPT
// ============================================

function buildLessonPrompt(grade, subject, topic, classSize, curriculumType) {
  const size = classSize || 40;
  const boys = Math.floor(size * 0.45);
  const girls = size - boys;

  if (curriculumType === 'cbc') {
    return `
You are an expert Zambian teacher creating a CBC (Competency-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

Follow the Ministry of Education CBC lesson plan template exactly.

Return ONLY valid JSON with this exact structure:
{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "teacherName": "MR/MRS",
  "date": "Current date",
  "time": "08:00-08:40",
  "duration": "40 min",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
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
  } else {
    // OBC (Objective-Based Curriculum)
    return `
You are an expert Zambian teacher creating an OBC (Objective-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

Follow the Ministry of Education OBC lesson plan template exactly.

Return ONLY valid JSON with this exact structure:
{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "teacherName": "MR/MRS",
  "date": "Current date",
  "duration": "80 min",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
  "references": ["Reference 1", "Reference 2", "Reference 3"],
  "teachingAids": ["Chart", "Images", "Video", "PowerPoint", "Worksheet"],
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
}

// ============================================
// MOCK LESSON GENERATOR (Fallback)
// ============================================

function generateMockLesson(grade, subject, topic, classSize, curriculumType) {
  const size = classSize || 40;
  const boys = Math.floor(size * 0.45);
  const girls = size - boys;

  if (curriculumType === 'cbc') {
    return {
      id: `lesson-${Date.now()}`,
      userId: 'mock-user',
      title: topic,
      grade,
      subject,
      teacherName: 'MR/MRS',
      date: new Date().toISOString().split('T')[0],
      time: '08:00-08:40',
      duration: '40 min',
      classSize: size,
      boys: boys,
      girls: girls,
      generalCompetences: ['Critical thinking', 'Creativity', 'Communication', 'Collaboration'],
      specificCompetence: `Classify and explain the types of ${topic}`,
      lessonGoal: `By the end of this lesson, learners will be able to identify, classify, and explain ${topic}`,
      rationale: `Understanding ${topic} is essential for learners to make informed decisions and develop critical thinking skills.`,
      priorKnowledge: 'Learners have basic knowledge of the topic from previous lessons',
      references: ['2026 Teaching Module', 'Curriculum Guide'],
      learningEnvironment: 'classroom, laboratory, school garden',
      materials: ['Manila paper', 'Markers', 'Charts', 'Worksheet'],
      expectedStandard: 'Topic concepts classified correctly',
      lessonProgression: [
        { stage: 'INTRODUCTION', time: '5 min', teacherRole: 'Ask: "What do you know about this topic?"', learnerRole: 'Listen, participate, give examples', assessmentCriteria: 'Observation of participation' },
        { stage: 'LESSON DEVELOPMENT', time: '10 min', teacherRole: 'Explain key concepts and demonstrate', learnerRole: 'Take notes, ask questions, discuss', assessmentCriteria: 'Correct understanding of concepts' },
        { stage: 'ACTIVITY 1', time: '11 min', teacherRole: 'Guide group work and provide materials', learnerRole: 'Work in groups, complete tasks', assessmentCriteria: 'Group collaboration and task completion' },
        { stage: 'ACTIVITY 2', time: '16 min', teacherRole: 'Facilitate presentations and consolidate', learnerRole: 'Present findings and correct own work', assessmentCriteria: 'Accurate presentation' },
        { stage: 'EXERCISE', time: '20 min', teacherRole: 'Give assessment and monitor', learnerRole: 'Complete assessment individually', assessmentCriteria: 'Correct classification' },
        { stage: 'CONCLUSION', time: '10 min', teacherRole: 'Summarize key points', learnerRole: 'Share what they learned', assessmentCriteria: 'Verbal explanation' }
      ],
      homework: `Research and list local examples of ${topic}`,
      lessonEvaluation: 'Lesson was successful, key competences were acquired',
      curriculum: 'cbc',
      createdAt: new Date().toISOString()
    };
  } else {
    return {
      id: `lesson-${Date.now()}`,
      userId: 'mock-user',
      title: topic,
      grade,
      subject,
      teacherName: 'MR/MRS',
      date: new Date().toISOString().split('T')[0],
      duration: '80 min',
      classSize: size,
      boys: boys,
      girls: girls,
      references: ['Biological Science by Lisuba Bornface', 'Simply Biology by Xavier', 'Biology 12 Golden Tips'],
      teachingAids: ['Chart', 'Images', 'Video', 'PowerPoint', 'Worksheet'],
      rationale: `Understanding ${topic} is essential for understanding body systems and maintaining health.`,
      learningOutcomes: [
        `Define ${topic} and differentiate it from related concepts`,
        `Name the main types of ${topic}`,
        `List the principal organs/structures involved in ${topic}`,
        `Explain the importance of ${topic} in living organisms`
      ],
      lessonDevelopment: [
        { time: '10 min', learningPoints: 'Introduction: What is the topic?', teacherActivities: 'Ask: "What do you know?" Write definitions on board', pupilActivities: 'Define in their own words, participate' },
        { time: '20 min', learningPoints: 'Key concepts and their sources', teacherActivities: 'List key concepts with sources, use diagrams', pupilActivities: 'Complete tables, take notes' },
        { time: '20 min', learningPoints: 'Main content and examples', teacherActivities: 'Use charts and diagrams to explain', pupilActivities: 'Label diagrams, write examples' },
        { time: '15 min', learningPoints: 'Distinctions and applications', teacherActivities: 'Give contrasting examples', pupilActivities: 'Classify given processes' },
        { time: '15 min', learningPoints: 'Conclusion and summary', teacherActivities: 'Lead oral quiz and recap', pupilActivities: 'Answer worksheet questions' }
      ],
      learnersEvaluation: [
        'Define the topic',
        'Name three key concepts',
        'Which organ/structure is involved?',
        'What is the difference between related concepts?',
        'Why is this important?'
      ],
      curriculum: 'obc',
      createdAt: new Date().toISOString()
    };
  }
}

// Get user's lessons
router.get('/mine', authenticate, (req, res) => {
  res.json([]);
});

module.exports = router;
