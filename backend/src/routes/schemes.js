const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { exportSchemeToWord, exportSchemeToPDF } = require('../utils/export');

const prisma = new PrismaClient();

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

// Generate scheme with custom topics per week
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { grade, subject, term, weeks, assessmentWeeks, testTopics, weekTopics } = req.body;
    
    console.log('📝 Received weekTopics:', weekTopics); // Debug log

    if (!grade || !subject) {
      return res.status(400).json({ error: 'Grade and subject are required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { school: true }
    });

    const schoolName = user?.school || 'KASHINAKAZHI SECONDARY SCHOOL';
    const totalWeeks = weeks || 13;
    const assessmentWeekNumbers = assessmentWeeks || [6, 13];
    const testTopicMap = testTopics || {};
    const customWeekTopics = weekTopics || {};

    console.log('📝 Custom weekTopics:', customWeekTopics); // Debug log

    const generatedWeeks = [];
    const defaultTopics = [
      `Introduction to ${subject}`,
      `Basic concepts in ${subject}`,
      `Core principles of ${subject}`,
      `Practical applications of ${subject}`,
      `Advanced topics in ${subject}`,
      `Review and consolidation`,
      `Assessment preparation`,
      `Mid-term assessment`,
      `${subject} in action`,
      `Real-world examples in ${subject}`,
      `Critical thinking in ${subject}`,
      `Group projects in ${subject}`,
      `Revision and final assessment`
    ];

    const methods = ['Group work', 'Question and answer', 'Demonstrations', 'Discussion', 'Practical activities'];
    const aids = ['Worksheets', 'Charts', 'Textbooks', 'Lab equipment', 'Multimedia'];

    for (let i = 0; i < totalWeeks; i++) {
      const weekNum = i + 1;
      const isAssessmentWeek = assessmentWeekNumbers.includes(weekNum);
      
      // ✅ USE CUSTOM TOPIC if provided, otherwise use default
      let topic;
      if (isAssessmentWeek) {
        // For assessment weeks, use the test topic or default
        topic = testTopicMap[weekNum] || `Assessment - Week ${weekNum}`;
      } else {
        // For normal weeks, use custom topic or default
        topic = customWeekTopics[weekNum] || defaultTopics[i % defaultTopics.length];
      }
      
      console.log(`📝 Week ${weekNum} topic:`, topic); // Debug log
      
      generatedWeeks.push({
        week: weekNum,
        topic: topic, // ✅ This now uses custom topics
        isAssessment: isAssessmentWeek,
        assessmentType: isAssessmentWeek ? 'Test/Assessment' : '',
        specificOutcome: isAssessmentWeek 
          ? `Assessment on topics covered in weeks ${Math.max(1, weekNum - 3)} - ${weekNum}`
          : `By the end of this week, learners will be able to understand and apply ${subject} concepts related to ${topic}`,
        methods: isAssessmentWeek 
          ? ['Assessment', 'Test', 'Evaluation']
          : [
              methods[i % methods.length],
              methods[(i + 1) % methods.length]
            ],
        aids: isAssessmentWeek
          ? ['Test papers', 'Assessment rubrics', 'Marking guide']
          : [
              aids[i % aids.length],
              aids[(i + 1) % aids.length]
            ],
        objectives: isAssessmentWeek
          ? [
              `Demonstrate understanding of topics covered`,
              `Apply knowledge to solve problems`,
              'Show mastery of key concepts'
            ]
          : [
              `Understand key concepts of ${topic}`,
              `Apply knowledge to solve problems`,
              'Demonstrate understanding through practical tasks'
            ],
        knowledge: isAssessmentWeek ? 'Assessment of covered topics' : `Key concepts in ${topic}`,
        skills: isAssessmentWeek ? 'Evaluation, Critical thinking' : 'Critical thinking, problem-solving, analysis',
        values: isAssessmentWeek ? 'Honesty, Responsibility' : 'Curiosity, responsibility, collaboration'
      });
    }

    const scheme = {
      id: `scheme-${Date.now()}`,
      userId: req.userId,
      school: schoolName,
      grade: `Grade ${grade}`,
      subject,
      term: `Term ${term}`,
      year: "2026",
      totalWeeks: totalWeeks,
      assessmentWeeks: assessmentWeekNumbers,
      testTopics: testTopicMap,
      weekTopics: customWeekTopics, // ✅ Store custom topics
      weeks: generatedWeeks,
      createdAt: new Date().toISOString()
    };

    await prisma.scheme.create({ data: scheme });
    res.status(201).json(scheme);
  } catch (error) {
    console.error('Scheme generation error:', error);
    res.status(500).json({ error: 'Scheme generation failed' });
  }
});

// Get all schemes for user
router.get('/mine', authenticate, async (req, res) => {
  try {
    const userSchemes = await prisma.scheme.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(userSchemes);
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ error: 'Failed to fetch schemes' });
  }
});

// Get a single scheme
router.get('/:id', authenticate, async (req, res) => {
  try {
    const scheme = await prisma.scheme.findUnique({
      where: { id: req.params.id }
    });

    if (!scheme) {
      return res.status(404).json({ error: 'Scheme not found' });
    }

    if (scheme.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(scheme);
  } catch (error) {
    console.error('Error fetching scheme:', error);
    res.status(500).json({ error: 'Failed to fetch scheme' });
  }
});

// Export Scheme to Word
router.get('/export/:id/word', authenticate, async (req, res) => {
  try {
    const scheme = await prisma.scheme.findUnique({
      where: { id: req.params.id }
    });

    if (!scheme) {
      return res.status(404).json({ error: 'Scheme not found' });
    }

    if (scheme.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const buffer = await exportSchemeToWord(scheme);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=${scheme.subject}_Scheme_of_Work_Term_${scheme.term}.docx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export scheme' });
  }
});

// Export Scheme to PDF
router.get('/export/:id/pdf', authenticate, async (req, res) => {
  try {
    const scheme = await prisma.scheme.findUnique({
      where: { id: req.params.id }
    });

    if (!scheme) {
      return res.status(404).json({ error: 'Scheme not found' });
    }

    if (scheme.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const buffer = await exportSchemeToPDF(scheme);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${scheme.subject}_Scheme_of_Work_Term_${scheme.term}.pdf`);
    res.send(buffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export scheme' });
  }
});

module.exports = router;
