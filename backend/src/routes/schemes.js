const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const schemes = [];

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
    const { grade, subject, term } = req.body;
    if (!grade || !subject) return res.status(400).json({ error: 'Grade and subject are required' });
    const weeks = [];
    const topics = [
      `Introduction to ${subject}`, `Basic concepts in ${subject}`,
      `Core principles of ${subject}`, `Practical applications of ${subject}`,
      `Advanced topics in ${subject}`, `Review and consolidation`,
      `Assessment preparation`, `Mid-term assessment`,
      `${subject} in action`, `Real-world examples in ${subject}`,
      `Critical thinking in ${subject}`, `Group projects in ${subject}`,
      `Revision and final assessment`
    ];
    for (let i = 0; i < 13; i++) {
      weeks.push({
        week: i + 1,
        topics: [`Week ${i+1}: ${topics[i]}`, `Topic ${i+1}: Detailed exploration`],
        objectives: [
          `Understand and apply ${subject} concepts`,
          'Develop problem-solving skills',
          'Demonstrate understanding through practical tasks'
        ]
      });
    }
    const scheme = {
      id: `scheme-${Date.now()}`,
      userId: req.userId,
      grade: `Grade ${grade}`,
      subject,
      term: term || 'Term 1',
      year: '2026',
      totalWeeks: 13,
      weeks,
      createdAt: new Date().toISOString()
    };
    schemes.push(scheme);
    res.status(201).json(scheme);
  } catch (error) {
    res.status(500).json({ error: 'Scheme generation failed' });
  }
});

router.get('/mine', authenticate, (req, res) => {
  const userSchemes = schemes.filter(s => s.userId === req.userId);
  res.json(userSchemes);
});

router.get('/:id', authenticate, (req, res) => {
  const scheme = schemes.find(s => s.id === req.params.id);
  if (!scheme) return res.status(404).json({ error: 'Scheme not found' });
  if (scheme.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });
  res.json(scheme);
});

module.exports = router;
