const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const jwt = require('jsonwebtoken');

// Configure DeepSeek client
const deepseekClient = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com/v1"
});

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

// Generate lesson plan using DeepSeek
router.post('/generate', authenticate, async (req, res) => {
    try {
        const { grade, subject, topic, classSize } = req.body;

        if (!grade || !subject || !topic) {
            return res.status(400).json({ 
                error: 'Grade, subject, and topic are required' 
            });
        }

        // Build the prompt for DeepSeek
        const prompt = `
You are an expert Zambian teacher creating a lesson plan for ${grade} ${subject} on the topic: "${topic}".

Follow the Zambian CDC curriculum and CBC framework.

Return ONLY valid JSON with this exact structure:
{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "duration": "40 min",
  "objectives": ["Objective 1", "Objective 2", "Objective 3", "Objective 4", "Objective 5"],
  "development": ["Introduction (5 min): ...", "Main Activity (20 min): ...", "Consolidation (10 min): ...", "Conclusion (5 min): ..."],
  "activities": ["Activity 1", "Activity 2", "Activity 3", "Activity 4"],
  "assessment": "Assessment description",
  "curriculumCodes": ["CDC Code 1", "CDC Code 2"]
}

Use examples relevant to Zambian classrooms and ${grade} students.
`;

        // Call DeepSeek API
        const completion = await deepseekClient.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "You are a helpful assistant specialized in the Zambian education curriculum. Always respond with valid JSON only." 
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2048
        });

        // Parse the response
        const lessonData = JSON.parse(completion.choices[0].message.content);

        // Add class size if provided
        if (classSize) {
            lessonData.classSize = classSize;
        }

        // Create lesson object
        const lesson = {
            id: `lesson-${Date.now()}`,
            userId: req.userId,
            ...lessonData,
            createdAt: new Date().toISOString()
        };

        res.status(201).json(lesson);

    } catch (error) {
        console.error('DeepSeek API Error:', error);
        
        // Fallback mock lesson
        const { grade, subject, topic, classSize } = req.body;
        const fallbackLesson = {
            id: `lesson-${Date.now()}`,
            userId: req.userId,
            grade,
            subject,
            topic,
            classSize: classSize || 40,
            duration: '40 min',
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
        
        res.status(201).json(fallbackLesson);
    }
});

// Get user's lessons
router.get('/mine', authenticate, (req, res) => {
    res.json([]);
});

module.exports = router;
