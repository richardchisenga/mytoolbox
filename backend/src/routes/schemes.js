const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../utils/auth');
const { exportSchemeToWord, exportSchemeToPDF } = require('../utils/export');

const prisma = new PrismaClient();

const TERM_NAMES = { '1': 'ONE', '2': 'TWO', '3': 'THREE' };

// Generate scheme with custom topics per week.
// CBC rows follow the Ministry-style scheme format shown by the user:
// Week | Topic | Sub-topic | Specific competences | Learning activities |
// Expected standards | T/L Resources | Strategies/Techniques | Reference
router.post('/generate', authenticate, async (req, res) => {
  try {
    const {
      grade,
      subject,
      term,
      weeks,
      assessmentWeeks,
      testTopics,
      weekTopics,
      weekSubtopics,
      curriculum,
      subtopic,
    } = req.body;

    const curriculumType = String(curriculum || 'cbc').toLowerCase();
    if (!['cbc', 'obc'].includes(curriculumType)) {
      return res.status(400).json({ error: 'Curriculum must be either CBC or OBC' });
    }

    if (!grade || !subject) {
      return res.status(400).json({ error: 'Grade and subject are required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { school: true }
    });

    const schoolName = user?.school || 'KASHINAKAZHI SECONDARY SCHOOL';
    const totalWeeks = Number(weeks) || 13;
    const assessmentWeekNumbers = Array.isArray(assessmentWeeks) ? assessmentWeeks : [6, 13];
    const testTopicMap = testTopics || {};
    const customWeekTopics = weekTopics || {};
    const customWeekSubtopics = weekSubtopics || {};

    const generatedWeeks = [];

    const cbcReferences = [
      '2024 New Biology Syllabus',
      'Biological Science',
      'Basic Biology'
    ];
    const methods = ['Discussion', 'Explanatory', 'Group work', 'Individual work', 'Teacher exposition'];
    const resources = ['Charts', 'Books', 'Web sites', 'Locally available materials'];

    for (let i = 0; i < totalWeeks; i++) {
      const weekNum = i + 1;
      const isAssessmentWeek = assessmentWeekNumbers.includes(weekNum);

      const topic = isAssessmentWeek
        ? (testTopicMap[weekNum] || `Assessment - Week ${weekNum}`)
        : (customWeekTopics[weekNum] || `Topic for Week ${weekNum}`);

      const rowSubtopic = customWeekSubtopics[weekNum] || subtopic || '';

      if (curriculumType === 'cbc') {
        generatedWeeks.push({
          week: weekNum,
          topic,
          subTopic: rowSubtopic,
          isAssessment: isAssessmentWeek,
          specificCompetences: isAssessmentWeek
            ? ['Demonstrate understanding of concepts covered', 'Apply knowledge and skills in assessment tasks']
            : [`Explore ${topic} and its relevance`, `Apply knowledge of ${topic} to familiar situations`],
          learningActivities: isAssessmentWeek
            ? ['Revision of covered work', 'Individual assessment', 'Marking and discussion of responses']
            : [`Exploring ${topic}`, `Discussing key concepts and examples`, `Group and individual activities related to ${topic}`],
          expectedStandards: isAssessmentWeek
            ? 'Learners demonstrate the expected knowledge, skills and competencies in the assessed work.'
            : `Learners explain ${topic}, participate in activities and apply the knowledge correctly.`,
          resources: isAssessmentWeek
            ? ['Test papers', 'Assessment rubrics', 'Marking guide']
            : resources,
          strategies: isAssessmentWeek
            ? ['Individual work', 'Assessment', 'Discussion']
            : methods,
          reference: cbcReferences,
          // Retain the old fields for compatibility with existing saved data/UI.
          specificOutcome: isAssessmentWeek
            ? `Assessment of topics covered in weeks ${Math.max(1, weekNum - 3)} - ${weekNum}`
            : `By the end of the week, learners will demonstrate competencies related to ${topic}`,
          methods: isAssessmentWeek ? ['Assessment', 'Test', 'Evaluation'] : methods.slice(0, 3),
          aids: isAssessmentWeek ? ['Test papers', 'Assessment rubrics', 'Marking guide'] : resources.slice(0, 3),
          knowledge: isAssessmentWeek ? 'Assessment of covered topics' : `Key concepts in ${topic}`,
          skills: isAssessmentWeek ? 'Application, analysis and critical thinking' : 'Communication, collaboration, problem-solving and analysis',
          values: isAssessmentWeek ? 'Honesty, responsibility' : 'Responsibility, collaboration, curiosity',
          competencies: isAssessmentWeek ? ['Critical thinking', 'Problem solving'] : ['Communication', 'Collaboration', 'Critical thinking', 'Problem solving']
        });
      } else {
        // Keep OBC generation compatible with the existing application.
        const obcObjectives = isAssessmentWeek
          ? ['Demonstrate knowledge of covered topics', 'Apply learned concepts correctly', 'Show mastery through assessment']
          : [`State key facts and concepts about ${topic}`, `Explain ${topic} using relevant examples`, `Apply knowledge of ${topic} in classroom tasks`];

        generatedWeeks.push({
          week: weekNum,
          topic,
          subTopic: rowSubtopic,
          isAssessment: isAssessmentWeek,
          assessmentType: isAssessmentWeek ? 'Test/Assessment' : '',
          curriculum: 'obc',
          specificOutcome: isAssessmentWeek
            ? `Assessment of topics covered in weeks ${Math.max(1, weekNum - 3)} - ${weekNum}`
            : `By the end of the lesson, learners should be able to state, explain and apply knowledge related to ${topic}`,
          methods: isAssessmentWeek ? ['Assessment', 'Test', 'Evaluation'] : [methods[i % methods.length], methods[(i + 1) % methods.length]],
          aids: isAssessmentWeek ? ['Test papers', 'Assessment rubrics', 'Marking guide'] : [resources[i % resources.length], resources[(i + 1) % resources.length]],
          objectives: obcObjectives,
          competencies: [],
          knowledge: isAssessmentWeek ? 'Assessment of covered topics' : `Key concepts in ${topic}`,
          skills: isAssessmentWeek ? 'Evaluation, Critical thinking' : 'Critical thinking, problem-solving, analysis',
          values: isAssessmentWeek ? 'Honesty, Responsibility' : 'Responsibility, collaboration, curiosity'
        });
      }
    }

    const scheme = {
      userId: req.userId,
      school: schoolName,
      grade: String(grade).startsWith('Grade ') ? String(grade) : `Grade ${grade}`,
      subject,
      term: String(term || '1').startsWith('Term ') ? String(term || 'Term 1') : `Term ${term || 1}`,
      year: String(new Date().getFullYear()),
      totalWeeks,
      curriculum: curriculumType,
      assessmentWeeks: assessmentWeekNumbers,
      testTopics: testTopicMap,
      weekTopics: customWeekTopics,
      subtopic: subtopic || '',
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

router.get('/:id', authenticate, async (req, res) => {
  try {
    const scheme = await prisma.scheme.findUnique({ where: { id: req.params.id } });
    if (!scheme) return res.status(404).json({ error: 'Scheme not found' });
    if (scheme.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });
    res.json(scheme);
  } catch (error) {
    console.error('Error fetching scheme:', error);
    res.status(500).json({ error: 'Failed to fetch scheme' });
  }
});

router.get('/export/:id/word', authenticate, async (req, res) => {
  try {
    const scheme = await prisma.scheme.findUnique({ where: { id: req.params.id } });
    if (!scheme) return res.status(404).json({ error: 'Scheme not found' });
    if (scheme.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    const buffer = await exportSchemeToWord(scheme);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=${scheme.subject}_Scheme_of_Work_Term_${scheme.term}.docx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export scheme' });
  }
});

router.get('/export/:id/pdf', authenticate, async (req, res) => {
  try {
    const scheme = await prisma.scheme.findUnique({ where: { id: req.params.id } });
    if (!scheme) return res.status(404).json({ error: 'Scheme not found' });
    if (scheme.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

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
