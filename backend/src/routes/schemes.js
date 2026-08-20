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

// Generate scheme with Ministry of Education template
router.post('/generate', authenticate, (req, res) => {
  try {
    const { grade, subject, term } = req.body;
    if (!grade || !subject) {
      return res.status(400).json({ error: 'Grade and subject are required' });
    }

    // Ministry of Education Scheme of Work Template
    const weeks = [];
    
    // Week 1: Orientation
    weeks.push({
      week: 1,
      topic: "ORIENTATION",
      specificOutcome: "Get oriented to the subject and expectations",
      methods: ["Group work", "Question and answer"],
      aids: ["Worksheets", "Textbooks"],
      knowledge: "Subject overview and expectations",
      skills: "Communication, listening",
      values: "Responsibility, punctuality"
    });

    // Week 2: Introduction to Biology
    weeks.push({
      week: 2,
      topic: "INTRODUCTION TO BIOLOGY",
      subtopics: [
        "Definition of Biology",
        "Branches of biology",
        "Importance of biology"
      ],
      specificOutcome: "Define the term biology. State the branches of biology. Identify the characteristics of living organisms.",
      methods: ["Group work", "Question and answer", "Demonstrations"],
      aids: ["Worksheets", "Lower animals and Plants", "Stones, Wood, Glass"],
      references: ["K.C.S.C Golden Tips pg 1-2", "Basics of Biology pg 1-3", "Macmillan Secondary Biology pg 1-2"],
      knowledge: "The characteristics of living organisms: Feeding, breathing, reproducing, growing, locomotion, sensitivity and excretion.",
      skills: "Communicating information on the characteristics of living organisms. Comparing Living and non-Living organisms.",
      values: "Appreciating characteristics of living organisms. Asking questions for more understanding."
    });

    // Week 3: Living Organisms and Life Processes
    weeks.push({
      week: 3,
      topic: "LIVING ORGANISMS AND LIFE PROCESSES",
      subtopics: [
        "Characteristics of living organisms",
        "Life processes of living organisms"
      ],
      specificOutcome: "Distinguish between living and non-living organisms. Describe life processes of living organisms.",
      methods: ["Group work", "Question and answer", "Demonstrations"],
      aids: ["Worksheets", "Charts", "Textbooks"],
      references: ["K.C.S.C Golden Tips pg 2-3", "Basics of Biology pg 4-6"],
      knowledge: "Life processes of living organisms: Metabolism (Catabolism and anabolism). Include the role of enzymes.",
      skills: "Communicating Metabolism and the role of enzymes.",
      values: "Appreciating life processes and role of enzymes."
    });

    // Generate remaining weeks
    const topics = [
      "CELL STRUCTURE AND FUNCTION",
      "CELL ORGANELLES",
      "MOVEMENT OF SUBSTANCES",
      "ENZYMES",
      "NUTRITION IN PLANTS",
      "NUTRITION IN ANIMALS",
      "RESPIRATION",
      "GASEOUS EXCHANGE",
      "TRANSPORT IN PLANTS",
      "TRANSPORT IN ANIMALS",
      "EXCRETION",
      "HOMEOSTASIS"
    ];

    for (let i = 0; i < 12; i++) {
      const weekNum = i + 4;
      weeks.push({
        week: weekNum,
        topic: topics[i] || `TOPIC ${weekNum}`,
        specificOutcome: `By the end of this week, learners will be able to understand and apply concepts related to ${topics[i] || `topic ${weekNum}`}`,
        methods: ["Group work", "Question and answer", "Demonstrations", "Discussion"],
        aids: ["Worksheets", "Charts", "Textbooks", "Lab equipment"],
        references: [`K.C.S.C Golden Tips pg ${10 + i * 2}-${12 + i * 2}`, `Basics of Biology pg ${8 + i * 2}`],
        knowledge: `Key concepts in ${topics[i] || `topic ${weekNum}`}`,
        skills: "Critical thinking, problem-solving, analysis",
        values: "Curiosity, responsibility, collaboration"
      });
    }

    const scheme = {
      id: `scheme-${Date.now()}`,
      userId: req.userId,
      school: "KASHINAKAZHI SECONDARY SCHOOL",
      grade: `Grade ${grade}`,
      subject,
      term: `Term ${term}`,
      year: "2026",
      totalWeeks: 13,
      weeks,
      createdAt: new Date().toISOString()
    };

    schemes.push(scheme);
    res.status(201).json(scheme);
  } catch (error) {
    console.error('Scheme generation error:', error);
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
