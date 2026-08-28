const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../utils/auth');
const { exportSchemeToWord, exportSchemeToPDF } = require('../utils/export');

const prisma = new PrismaClient();


// Generate scheme with custom topics per week
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { grade, subject, term, weeks, assessmentWeeks, testTopics, weekTopics, curriculum } = req.body;
    const curriculumType = String(curriculum || 'cbc').toLowerCase();
    if (!['cbc', 'obc'].includes(curriculumType)) {
      return res.status(400).json({ error: 'Curriculum must be either CBC or OBC' });
    }
    
    console.log('📝 Received weekTopics:', weekTopics);

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

    const generatedWeeks = [];

    const methods = ['Group work', 'Question and answer', 'Demonstrations', 'Discussion', 'Practical activities'];
    const aids = ['Worksheets', 'Charts', 'Textbooks', 'Lab equipment', 'Multimedia'];

    for (let i = 0; i < totalWeeks; i++) {
      const weekNum = i + 1;
      const isAssessmentWeek = assessmentWeekNumbers.includes(weekNum);
      
      // ✅ USE CUSTOM TOPIC if provided
      let topic;
      if (isAssessmentWeek) {
        topic = testTopicMap[weekNum] || `Assessment - Week ${weekNum}`;
      } else {
        // ✅ Use the custom topic from frontend
        topic = customWeekTopics[weekNum] || `Topic for Week ${weekNum}`;
      }
      
      console.log(`📝 Week ${weekNum}:`, topic);
      
      const cbcCompetencies = isAssessmentWeek
        ? ['Assessment competence', 'Critical thinking']
        : ['Communication', 'Collaboration', 'Problem solving'];
      const obcObjectives = isAssessmentWeek
        ? ['Demonstrate knowledge of covered topics', 'Apply learned concepts correctly', 'Show mastery through assessment']
        : [`State key facts and concepts about ${topic}`, `Explain ${topic} using relevant examples`, `Apply knowledge of ${topic} in classroom tasks`];

      generatedWeeks.push({
        week: weekNum,
        topic: topic,
        isAssessment: isAssessmentWeek,
        assessmentType: isAssessmentWeek ? 'Test/Assessment' : '',
        curriculum: curriculumType,
        specificOutcome: isAssessmentWeek
          ? `Assessment of topics covered in weeks ${Math.max(1, weekNum - 3)} - ${weekNum}`
          : curriculumType === 'obc'
            ? `By the end of the lesson, learners should be able to state, explain and apply knowledge related to ${topic}`
            : `By the end of the week, learners will demonstrate competencies in ${subject} related to ${topic}`,
        methods: isAssessmentWeek
          ? ['Assessment', 'Test', 'Evaluation']
          : [methods[i % methods.length], methods[(i + 1) % methods.length]],
        aids: isAssessmentWeek
          ? ['Test papers', 'Assessment rubrics', 'Marking guide']
          : [aids[i % aids.length], aids[(i + 1) % aids.length]],
        objectives: isAssessmentWeek
          ? obcObjectives
          : curriculumType === 'obc'
            ? obcObjectives
            : [`Develop understanding of ${topic}`, `Apply knowledge of ${topic}`, 'Demonstrate competency through practical tasks'],
        competencies: curriculumType === 'cbc' ? cbcCompetencies : [],
        knowledge: isAssessmentWeek ? 'Assessment of covered topics' : `Key concepts in ${topic}`,
        skills: isAssessmentWeek ? 'Evaluation, Critical thinking' : 'Critical thinking, problem-solving, analysis',
        values: isAssessmentWeek ? 'Honesty, Responsibility' : 'Responsibility, collaboration, curiosity'
      });
    }

    const scheme = {
        userId: req.userId,
      school: schoolName,
      grade: `Grade ${grade}`,
      subject,
      term: `Term ${term}`,
      year: String(new Date().getFullYear()),
      totalWeeks: totalWeeks,
      curriculum: curriculumType,
      assessmentWeeks: assessmentWeekNumbers,
      testTopics: testTopicMap,
      weekTopics: customWeekTopics,
      weeks: generatedWeeks,
      createdAt: new Date().toISOString()
    };

    await prisma.scheme.create({ data: scheme });
    res.status(201).json(scheme);
  } catch (error) {
    console.error('Scheme generation error:', error);
    res.status(500).json({ error: 'Scheme generation failed', details: error.message });
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
