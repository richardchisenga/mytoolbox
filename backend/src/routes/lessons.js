const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const lessons = [];

const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/generate', authenticate, (req, res) => {
  try {
    const { grade, subject, topic, classSize } = req.body;
    if (!grade || !subject || !topic) return res.status(400).json({ error: 'Grade, subject, and topic are required' });
    const lesson = {
      id: `lesson-${Date.now()}`,
      userId: req.userId,
      grade,
      subject,
      topic,
      classSize: classSize || 40,
      duration: '40 min',
      objectives: [
        `By the end of this lesson, learners will be able to identify and explain key concepts of ${topic}`,
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
    lessons.push(lesson);
    res.status(201).json(lesson);
  } catch (error) {
    res.status(500).json({ error: 'Lesson generation failed' });
  }
});

router.get('/mine', authenticate, (req, res) => {
  const userLessons = lessons.filter(l => l.userId === req.userId);
  res.json(userLessons);
});

router.get('/:id', authenticate, (req, res) => {
  const lesson = lessons.find(l => l.id === req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  if (lesson.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });
  res.json(lesson);
});

module.exports = router;
