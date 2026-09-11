// src/server.js - Complete application with DeepSeek AI integration, manual payments, Notes, Assessments, Admin routes, and Export routes
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType } = require('docx');
const PDFDocument = require('pdfkit');
const { getCurriculumContext, formatContext, listCurriculumSources, listCurriculumRows, catalogSubjects, getReferenceTitles, getRegisteredOfficialSource } = require('./utils/curriculumContext');

const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

// ============ DEEPSEEK AI CLIENT ============
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com"
});

// ============ CORS CONFIGURATION ============
const corsOptions = {
  origin: [
    'https://mytoolbox-1.onrender.com',
    'https://mytoolbox.onrender.com',
    /\.onrender\.com$/,
    'https://mytoolbox-nine.vercel.app',
    'https://mytoolbox-0e80w147vy-ryichietechn.vercel.app',
    /\.vercel\.app$/,
    'https://mytoolbox-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:5000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
};
// ============ MIDDLEWARE ============
// Disable helmet completely to avoid CSP issues
// app.use(helmet());

// Use helmet with CSP disabled
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    dnsPrefetchControl: false,
    frameguard: false,
    hsts: false,
    ieNoOpen: false,
    noSniff: false,
    referrerPolicy: false,
    xssFilter: false,
  })
);

app.use(cors(corsOptions));
app.use(express.json());
// ============ AUTHENTICATION MIDDLEWARE ============
const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============ ROOT ENDPOINT ============
app.get('/', (req, res) => {
  res.json({ message: 'MyToolbox API is running' });
});

// ============ ROBUST DEEPSEEK JSON PARSER ============

function safeParseJSON(content) {
  if (!content || typeof content !== 'string') {
    console.error('❌ DeepSeek returned empty or invalid content');
    return null;
  }

  try {
    return JSON.parse(content.trim());
  } catch (firstError) {
    console.warn('⚠️ Direct JSON.parse failed:', firstError.message);
  }

  try {
    let cleaned = content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      console.error('❌ No JSON object found in DeepSeek response');
      console.error('Response:', content.substring(0, 1000));
      return null;
    }

    cleaned = cleaned.substring(firstBrace, lastBrace + 1);

    try {
      return JSON.parse(cleaned);
    } catch (secondError) {
      console.warn('⚠️ Cleaned JSON.parse failed:', secondError.message);
      console.error('Cleaned response:', cleaned.substring(0, 1500));
      return null;
    }

  } catch (error) {
    console.error('❌ JSON cleanup failed:', error.message);
    return null;
  }
}

// ============ IMPROVED DEEPSEEK GENERATE FUNCTION ============

async function generateDeepSeekJSON(messages, options = {}) {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🤖 DeepSeek attempt ${attempt}/${maxAttempts}`);

      const maxTokens = options.max_tokens || 4000;
      
      const response = await deepseek.chat.completions.create({
        model: options.model || 'deepseek-chat',
        messages,
        temperature: options.temperature || 0.3,
        max_tokens: maxTokens,
      });

      const choice = response?.choices?.[0];

      if (!choice) {
        throw new Error('DeepSeek returned no choices');
      }

      console.log(`🤖 Finish reason: ${choice.finish_reason || 'unknown'}`);

      if (choice.finish_reason === 'length') {
        console.warn('⚠️ DeepSeek response was truncated, trying to parse partial response...');
      }

      const content = choice?.message?.content;

      if (!content) {
        throw new Error('DeepSeek returned empty content');
      }

      let parsed = null;
      try {
        parsed = JSON.parse(content.trim());
      } catch (parseError) {
        console.warn('⚠️ Direct JSON.parse failed, trying to clean...');
        
        let cleaned = content
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          try {
            parsed = JSON.parse(cleaned);
          } catch (e) {
            console.error('❌ Cleaned JSON.parse also failed:', e.message);
          }
        }
      }

      if (!parsed) {
        throw new Error('DeepSeek returned invalid JSON');
      }

      return parsed;

    } catch (error) {
      console.error(`⚠️ DeepSeek attempt ${attempt} failed:`, error.message);

      if (attempt === maxAttempts) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// ============ GENERATE CBC LESSON PROGRESSION ============
function generateLessonProgression(topic, subject, grade) {
  const topicLower = topic.toLowerCase();
  
  // Sets topic
  if (topicLower.includes('sets') || topicLower.includes('set')) {
    return [
      {
        stage: "INTRODUCTION",
        time: "5 min",
        teacherRole: "Ask: 'What is a set?' Explain that a set is a collection of well-defined objects. Give examples: set of books, set of students in class. Introduce set notation: { }.",
        learnerRole: "Listen, participate, give examples of sets they see around them.",
        assessmentCriteria: "Observation of participation"
      },
      {
        stage: "LESSON DEVELOPMENT",
        time: "10 min",
        teacherRole: "Put learners into groups of 4-5. Give each group different objects. Ask them to group the objects and define the set. Introduce terminology: elements/members, universal set, empty set.",
        learnerRole: "In groups, sort objects and define the set. Discuss what elements belong to the set.",
        assessmentCriteria: "Group collaboration and correct classification"
      },
      {
        stage: "ACTIVITY 1",
        time: "11 min",
        teacherRole: "Display different sets on the board. Introduce set notation: A = {1, 2, 3, 4, 5}. Explain that elements are written inside curly brackets. Introduce ∈ (belongs to) and ∉ (does not belong to).",
        learnerRole: "Observe, discuss, practice writing sets using proper notation. Identify whether an element belongs to a set or not.",
        assessmentCriteria: "Correct use of set notation"
      },
      {
        stage: "ACTIVITY 2",
        time: "16 min",
        teacherRole: "Introduce types of sets: Finite set, Infinite set, Empty set, Equal sets, Equivalent sets. Provide examples for each.",
        learnerRole: "Present findings; correct own work. Practice identifying different types of sets.",
        assessmentCriteria: "Accurate identification and classification of set types"
      },
      {
        stage: "EXERCISE",
        time: "20 min",
        teacherRole: "Give a worksheet with exercises on set notation and types of sets.",
        learnerRole: "Complete worksheet individually.",
        assessmentCriteria: "Correct answers on worksheet"
      },
      {
        stage: "CONCLUSION",
        time: "10 min",
        teacherRole: "Summarise key points: A set is a collection of well-defined objects. Sets are written using curly brackets { }. Types of sets: Finite, Infinite, Empty, Equal, Equivalent.",
        learnerRole: "Share one thing they learned about sets.",
        assessmentCriteria: "Verbal explanation of at least one set concept"
      }
    ];
  }
  
  // Calculus - Differentiation
  if (topicLower.includes('calculus') || topicLower.includes('differentiation')) {
    return [
      {
        stage: "INTRODUCTION",
        time: "5 min",
        teacherRole: "Ask: 'What is the meaning of differentiation?' Explain that differentiation is the process of finding the rate at which a quantity changes. Define calculus and differentiation.",
        learnerRole: "Listen, participate, give examples of rates of change in daily life (speed of a car, growth of plants).",
        assessmentCriteria: "Observation of participation"
      },
      {
        stage: "LESSON DEVELOPMENT",
        time: "10 min",
        teacherRole: "Put learners into groups of 4-5. Ask them to identify the concept of gradient/slope of a curve. Explain that differentiation is finding the gradient of a curve at any point.",
        learnerRole: "In groups, discuss what they know about gradient. Identify that straight lines have constant gradient while curves have varying gradient.",
        assessmentCriteria: "Group collaboration"
      },
      {
        stage: "ACTIVITY 1",
        time: "11 min",
        teacherRole: "Display different graphs (linear, quadratic, cubic). Ask groups to find the gradient at different points using the formula: gradient = (y₂-y₁)/(x₂-x₁). Introduce the idea of a tangent to a curve.",
        learnerRole: "Observe graphs, discuss, use rulers to draw tangents and calculate gradients. Fill chart with gradient values.",
        assessmentCriteria: "Correct recording of gradient values"
      },
      {
        stage: "ACTIVITY 2",
        time: "16 min",
        teacherRole: "Introduce the differentiation notation: dy/dx = lim(Δx→0) [f(x+Δx)-f(x)]/Δx. Show the power rule: d/dx(xⁿ) = nxⁿ⁻¹. Work through examples: d/dx(x²) = 2x, d/dx(3x⁴) = 12x³.",
        learnerRole: "Present findings; correct own work. Practice differentiating simple functions: x³, 5x², 4x⁵.",
        assessmentCriteria: "Accurate presentation and correct differentiation"
      },
      {
        stage: "EXERCISE",
        time: "20 min",
        teacherRole: "Give a quiz: Differentiate the following: a) y = x⁴ b) y = 3x³ c) y = 2x⁵ d) y = x² + 3x",
        learnerRole: "Complete quiz individually.",
        assessmentCriteria: "Correct differentiation of each function"
      },
      {
        stage: "CONCLUSION",
        time: "10 min",
        teacherRole: "Summarise key points: Differentiation is the process of finding the gradient of a curve. The power rule: d/dx(xⁿ) = nxⁿ⁻¹. Differentiation has many applications in physics, economics, and engineering.",
        learnerRole: "Share one thing they learned about differentiation.",
        assessmentCriteria: "Verbal explanation of at least one differentiation concept"
      }
    ];
  }
  
  // Mensuration - Areas
  if (topicLower.includes('mensuration') || topicLower.includes('area')) {
    return [
      {
        stage: "INTRODUCTION",
        time: "5 min",
        teacherRole: "Ask: 'What is mensuration?' Explain that mensuration is the branch of mathematics dealing with measurement of geometric figures. Define area and its importance.",
        learnerRole: "Listen, participate, give examples of where area is used in daily life.",
        assessmentCriteria: "Observation of participation"
      },
      {
        stage: "LESSON DEVELOPMENT",
        time: "10 min",
        teacherRole: "Put learners into groups of 4-5. Display different shapes (rectangle, triangle, circle, parallelogram, trapezium). Ask them to identify the formula for each shape's area.",
        learnerRole: "In groups, discuss and write down the area formulas for each shape.",
        assessmentCriteria: "Group collaboration"
      },
      {
        stage: "ACTIVITY 1",
        time: "11 min",
        teacherRole: "Display different objects and ask groups to measure and calculate their areas using the correct formula.",
        learnerRole: "Measure objects, record dimensions, and calculate areas. Fill chart with measurements and calculations.",
        assessmentCriteria: "Correct recording of measurements and calculations"
      },
      {
        stage: "ACTIVITY 2",
        time: "16 min",
        teacherRole: "Ask each group to present their findings. Consolidate by listing all area formulas on the board. Work through examples: Rectangle, Triangle, Circle, Trapezium.",
        learnerRole: "Present findings to class; correct own work. Write down consolidated formulas.",
        assessmentCriteria: "Accurate presentation and correct formula identification"
      },
      {
        stage: "EXERCISE",
        time: "20 min",
        teacherRole: "Give a quiz: Find the area of: a) Rectangle L=12cm, W=8cm b) Triangle base=10cm, height=6cm c) Circle radius=7cm",
        learnerRole: "Complete quiz individually.",
        assessmentCriteria: "Correct area calculations"
      },
      {
        stage: "CONCLUSION",
        time: "10 min",
        teacherRole: "Summarise key points: Area formulas for different shapes. Emphasize the importance of using correct units.",
        learnerRole: "Share one thing they learned about mensuration.",
        assessmentCriteria: "Verbal explanation"
      }
    ];
  }
  
  // Quadratic Equations
  if (topicLower.includes('quadratic')) {
    return [
      {
        stage: "INTRODUCTION",
        time: "5 min",
        teacherRole: "Ask: 'What is a quadratic equation?' Explain that a quadratic equation is of the form ax² + bx + c = 0.",
        learnerRole: "Listen, participate, give examples of quadratic equations.",
        assessmentCriteria: "Observation of participation"
      },
      {
        stage: "LESSON DEVELOPMENT",
        time: "10 min",
        teacherRole: "Put learners into groups. Explain the three methods of solving quadratic equations: Factorization, Completing the Square, Quadratic Formula.",
        learnerRole: "In groups, discuss the methods and their applications.",
        assessmentCriteria: "Group collaboration"
      },
      {
        stage: "ACTIVITY 1",
        time: "11 min",
        teacherRole: "Demonstrate solving quadratic equations using the quadratic formula: x = [-b ± √(b²-4ac)] / 2a",
        learnerRole: "Practice using the formula with different equations.",
        assessmentCriteria: "Correct application of formula"
      },
      {
        stage: "ACTIVITY 2",
        time: "16 min",
        teacherRole: "Show how to solve using factorization and completing the square. Work through examples.",
        learnerRole: "Practice solving equations using different methods.",
        assessmentCriteria: "Accurate solutions"
      },
      {
        stage: "EXERCISE",
        time: "20 min",
        teacherRole: "Give exercises: Solve x²+5x+6=0, x²-5x+6=0",
        learnerRole: "Complete exercises individually.",
        assessmentCriteria: "Correct solutions"
      },
      {
        stage: "CONCLUSION",
        time: "10 min",
        teacherRole: "Summarise methods of solving quadratic equations.",
        learnerRole: "Share one thing they learned.",
        assessmentCriteria: "Verbal explanation"
      }
    ];
  }
  
  // Default - Generic
  return [
    {
      stage: "INTRODUCTION",
      time: "5 min",
      teacherRole: `Ask engaging questions to introduce ${topic}. Explain the importance of ${topic} in ${subject}.`,
      learnerRole: "Listen, participate, give examples of ${topic} in daily life.",
      assessmentCriteria: "Observation of participation"
    },
    {
      stage: "LESSON DEVELOPMENT",
      time: "10 min",
      teacherRole: `Put learners into groups of 4-5. Ask them to identify key concepts of ${topic} using displayed materials.`,
      learnerRole: "In groups, handle materials and identify key concepts.",
      assessmentCriteria: "Group collaboration"
    },
    {
      stage: "ACTIVITY 1",
      time: "11 min",
      teacherRole: `Display different materials. Ask groups to record key information about ${topic}.`,
      learnerRole: "Observe, discuss, fill chart with information.",
      assessmentCriteria: "Correct recording of content"
    },
    {
      stage: "ACTIVITY 2",
      time: "16 min",
      teacherRole: `Ask each group to present findings. Consolidate by listing key points on the board.`,
      learnerRole: "Present chart to class; correct own work.",
      assessmentCriteria: "Accurate presentation and participation"
    },
    {
      stage: "EXERCISE",
      time: "20 min",
      teacherRole: `Give a quiz on ${topic}.`,
      learnerRole: "Complete quiz individually.",
      assessmentCriteria: "Correct answers"
    },
    {
      stage: "CONCLUSION",
      time: "10 min",
      teacherRole: `Summarise key points of ${topic}.`,
      learnerRole: "Share what they learned.",
      assessmentCriteria: "Verbal explanation"
    }
  ];
}

// ============ GENERATE LESSON CONTENT (OBC) ============
function generateLessonContent(topic, subject, grade) {
  const topicLower = topic.toLowerCase();
  
  // Sets topic
  if (topicLower.includes('sets') || topicLower.includes('set')) {
    return [
      {
        content: `INTRODUCTION TO SETS\n\nA set is a collection of well-defined objects. Sets are fundamental in mathematics and are used in statistics, probability, and computer science.\n\nKEY CONCEPTS:\n- A set is a collection of well-defined objects\n- Elements are the objects in a set\n- Sets are written using curly brackets { }\n- ∈ means 'belongs to'\n- ∉ means 'does not belong to'\n\nTYPES OF SETS:\n1. Finite set - countable number of elements\n2. Infinite set - uncountable number of elements\n3. Empty set - no elements (∅ or { })\n4. Equal sets - exactly the same elements\n5. Equivalent sets - same number of elements`,
        teacherActivity: "Teacher writes the definition and types of sets on the board. Teacher gives examples of each type. Teacher demonstrates set notation with examples.",
        pupilActivity: "Learners to write the notes in their exercise books. Learners to listen attentively and give examples of sets.",
        methods: "Teacher Exposition, Demonstration, Question and Answer"
      },
      {
        content: `WORKED EXAMPLES\n\nEXAMPLE 1: Set Notation\nWrite the set of even numbers less than 10.\nSolution: A = {2, 4, 6, 8}\n\nEXAMPLE 2: Belongs to\nDetermine if 5 belongs to A = {1, 2, 3, 4, 5}\nSolution: 5 ∈ A (5 belongs to set A)\n\nEXAMPLE 3: Types of Sets\nIdentify the type of set: A = {1, 2, 3, 4, 5}\nSolution: Finite set (has 5 elements)\n\nEXAMPLE 4: Empty Set\nIdentify: C = { }\nSolution: Empty set (∅)`,
        teacherActivity: "Teacher solves the examples on the board step by step. Teacher explains set notation clearly. Teacher asks learners to identify elements in sets.",
        pupilActivity: "Learners to write the examples in their exercise books. Volunteer learners to go and solve on the board.",
        methods: "Question and Answer, Demonstration, Group Discussion"
      },
      {
        content: `PRACTICE EXERCISES\n\nEXERCISE:\n1. Write the set of vowels in the alphabet.\n2. Write the set of factors of 12.\n3. Identify whether the following are finite, infinite, or empty sets:\n   a) A = {2, 4, 6, 8}\n   b) B = {all prime numbers}\n   c) C = { }\n\nEXPECTED ANSWERS:\n1. {a, e, i, o, u}\n2. {1, 2, 3, 4, 6, 12}\n3. a) Finite set, b) Infinite set, c) Empty set`,
        teacherActivity: "Teacher writes the exercise on the board. Teacher monitors progress and assists learners.",
        pupilActivity: "Learners to write the exercise in their exercise books. Learners to work individually.",
        methods: "Group Work, Individual Practice, Question and Answer"
      },
      {
        content: `REAL-WORLD APPLICATIONS\n\nAPPLICATIONS OF SETS:\n1. Organizing data in statistics\n2. Probability calculations\n3. Database queries in computer science\n4. Classifying objects in daily life\n\nSUMMARY:\n- A set is a collection of well-defined objects\n- Sets are written using curly brackets { }\n- Types: Finite, Infinite, Empty, Equal, Equivalent\n- Set notation: ∈ and ∉\n- Sets are used in many areas of mathematics`,
        teacherActivity: "Teacher consolidates learners' responses and writes the summary on the board. Teacher discusses applications and gives remedial work.",
        pupilActivity: "Learners to listen attentively and write the summary. Learners to share examples of where sets are used.",
        methods: "Review, Consolidation, Discussion"
      }
    ];
  }
  
  // Calculus - Differentiation
  if (topicLower.includes('calculus') || topicLower.includes('differentiation')) {
    return [
      {
        content: `INTRODUCTION TO DIFFERENTIATION\n\nDifferentiation is the process of finding the rate at which a quantity changes. It is a fundamental concept in calculus.\n\nKEY CONCEPTS:\n- Differentiation finds the gradient of a curve at any point\n- The derivative represents the rate of change\n- Notation: dy/dx = f'(x)\n\nRULES OF DIFFERENTIATION:\n- Power Rule: d/dx(xⁿ) = nxⁿ⁻¹\n- Constant Rule: d/dx(c) = 0\n- Sum Rule: d/dx(f+g) = f' + g'`,
        teacherActivity: "Teacher writes the definition and rules on the board. Teacher explains the concept of rate of change with real-life examples.",
        pupilActivity: "Learners to write the notes in their exercise books. Learners to listen attentively and ask questions.",
        methods: "Teacher Exposition, Demonstration, Question and Answer"
      },
      {
        content: `WORKED EXAMPLES\n\nEXAMPLE 1: Power Rule\nDifferentiate y = x³\nSolution: dy/dx = 3x²\n\nEXAMPLE 2: Power Rule with Coefficient\nDifferentiate y = 5x⁴\nSolution: dy/dx = 20x³\n\nEXAMPLE 3: Sum Rule\nDifferentiate y = x² + 3x\nSolution: dy/dx = 2x + 3\n\nEXAMPLE 4: Finding Gradient\nFind the gradient of y = x² at x = 3\nSolution: dy/dx = 2x, at x = 3, gradient = 6`,
        teacherActivity: "Teacher solves the examples on the board step by step. Teacher explains the reasoning behind each step.",
        pupilActivity: "Learners to write the examples in their exercise books. Volunteer learners to go and solve on the board.",
        methods: "Question and Answer, Demonstration, Group Discussion"
      },
      {
        content: `PRACTICE EXERCISES\n\nEXERCISE:\n1. Differentiate y = x⁵\n2. Differentiate y = 3x³\n3. Differentiate y = 2x⁴ + 5x²\n4. Differentiate y = x³ - 4x + 7\n5. Find the gradient of y = x³ at x = 2\n\nEXPECTED ANSWERS:\n1. dy/dx = 5x⁴\n2. dy/dx = 9x²\n3. dy/dx = 8x³ + 10x\n4. dy/dx = 3x² - 4\n5. dy/dx = 3x², at x = 2, gradient = 12`,
        teacherActivity: "Teacher writes the exercise on the board. Teacher monitors progress and assists learners.",
        pupilActivity: "Learners to write the exercise in their exercise books. Learners to work individually.",
        methods: "Group Work, Individual Practice, Question and Answer"
      },
      {
        content: `REAL-WORLD APPLICATIONS\n\nAPPLICATIONS OF DIFFERENTIATION:\n1. Physics: Velocity and acceleration\n2. Economics: Marginal cost and revenue\n3. Engineering: Optimization problems\n4. Biology: Growth rates\n\nSUMMARY:\n- Differentiation finds the rate of change\n- Power rule: d/dx(xⁿ) = nxⁿ⁻¹\n- Gradient of a curve at a point = derivative at that point`,
        teacherActivity: "Teacher consolidates learners' responses and writes the summary on the board. Teacher discusses applications.",
        pupilActivity: "Learners to listen attentively and write the summary.",
        methods: "Review, Consolidation, Discussion"
      }
    ];
  }
  
  // Mensuration - Areas
  if (topicLower.includes('mensuration') || topicLower.includes('area') || topicLower.includes('perimeter') || topicLower.includes('volume')) {
    return [
      {
        content: `INTRODUCTION TO MENSURATION AREAS\n\nMensuration is the branch of mathematics that deals with the measurement of geometric figures such as length, area, and volume. Area is the measure of the surface enclosed by a plane figure.\n\nFORMULAE FOR AREAS:\n- Rectangle: A = L × W\n- Square: A = L²\n- Triangle: A = ½ × base × height\n- Circle: A = πr²\n- Parallelogram: A = base × height\n- Trapezium: A = ½(a+b)h`,
        teacherActivity: "Teacher writes the formulae on the board and explains each formula with clear examples.",
        pupilActivity: "Learners to write the formulae in their exercise books. Learners to listen attentively and identify shapes around them.",
        methods: "Teacher Exposition, Demonstration, Question and Answer"
      },
      {
        content: `WORKED EXAMPLES\n\nEXAMPLE 1: Rectangle\nFind the area of a rectangle with length 12cm and width 8cm.\nSolution: A = 12 × 8 = 96cm²\n\nEXAMPLE 2: Triangle\nFind the area of a triangle with base 10cm and height 6cm.\nSolution: A = ½ × 10 × 6 = 30cm²\n\nEXAMPLE 3: Circle\nFind the area of a circle with radius 7cm. (Take π = 22/7)\nSolution: A = 154cm²\n\nEXAMPLE 4: Trapezium\nFind the area of a trapezium with parallel sides 8cm and 12cm, and height 6cm.\nSolution: A = ½(8+12) × 6 = 60cm²`,
        teacherActivity: "Teacher solves the examples on the board step by step. Teacher emphasizes the importance of using correct formulae and units.",
        pupilActivity: "Learners to write the examples in their exercise books. Volunteer learners to go and solve similar problems on the board.",
        methods: "Question and Answer, Demonstration, Group Discussion"
      },
      {
        content: `PRACTICE EXERCISES\n\nEXERCISE:\n1. Find the area of a rectangle with length 15cm and width 10cm.\n2. Find the area of a triangle with base 14cm and height 8cm.\n3. Find the area of a circle with radius 10cm. (Take π = 3.142)\n4. Find the area of a parallelogram with base 12cm and height 7cm.\n5. Find the area of a trapezium with parallel sides 8cm and 12cm, and height 6cm.\n\nEXPECTED ANSWERS:\n1. A = 150cm²\n2. A = 56cm²\n3. A = 314.2cm²\n4. A = 84cm²\n5. A = 60cm²`,
        teacherActivity: "Teacher writes the exercise on the board. Teacher moves around the class to monitor progress and assist learners.",
        pupilActivity: "Learners to write the exercise in their exercise books. Learners to work individually or in pairs.",
        methods: "Group Work, Individual Practice, Question and Answer"
      },
      {
        content: `REAL-WORLD APPLICATIONS\n\nAPPLICATIONS:\n1. Calculating floor area for tiles/paint\n2. Calculating farm area for seed/fertilizer\n3. Calculating plot area for construction\n4. Calculating circular garden area\n\nSUMMARY:\n- Area is measured in square units (cm², m², km²)\n- Different shapes have different formulae\n- Always include the correct units`,
        teacherActivity: "Teacher consolidates learners' responses and writes the summary on the board. Teacher discusses applications.",
        pupilActivity: "Learners to listen attentively and write the summary.",
        methods: "Review, Consolidation, Discussion"
      }
    ];
  }
  
  // Quadratic Equations
  if (topicLower.includes('quadratic')) {
    return [
      {
        content: `INTRODUCTION TO QUADRATIC EQUATIONS\n\nA quadratic equation is an equation of the form ax² + bx + c = 0, where a, b, and c are constants and a ≠ 0.\n\nMETHODS OF SOLVING QUADRATIC EQUATIONS:\n1. Factorization Method\n2. Completing the Square Method\n3. Quadratic Formula Method\n\nQUADRATIC FORMULA:\nx = [-b ± √(b² - 4ac)] / 2a\n\nThe discriminant (b² - 4ac) determines the nature of roots.`,
        teacherActivity: "Teacher writes the general form of quadratic equation on the board. Teacher explains each method and demonstrates the quadratic formula.",
        pupilActivity: "Learners to write the notes in their exercise books. Learners to listen attentively and ask questions.",
        methods: "Teacher Exposition, Demonstration, Question and Answer"
      },
      {
        content: `WORKED EXAMPLES\n\nEXAMPLE 1: Using Quadratic Formula\nSolve: x² + 5x + 6 = 0\nSolution: x = -2 or x = -3\n\nEXAMPLE 2: Using Factorization\nSolve: x² - 5x + 6 = 0\nSolution: x = 2 or x = 3\n\nEXAMPLE 3: Using Completing the Square\nSolve: x² + 6x - 7 = 0\nSolution: x = 1 or x = -7`,
        teacherActivity: "Teacher solves the examples on the board step by step. Teacher explains each method clearly.",
        pupilActivity: "Learners to write the examples in their exercise books. Volunteer learners to go and solve on the board.",
        methods: "Question and Answer, Demonstration, Group Discussion"
      },
      {
        content: `PRACTICE EXERCISES\n\nSolve the following quadratic equations:\n1. x² + 7x + 12 = 0\n2. x² - 4x - 12 = 0\n3. 2x² + 5x - 3 = 0\n4. x² - 6x + 9 = 0\n5. 2x² - 7x + 3 = 0\n\nEXPECTED ANSWERS:\n1. x = -3 or x = -4\n2. x = 6 or x = -2\n3. x = ½ or x = -3\n4. x = 3 (repeated root)\n5. x = 3 or x = ½`,
        teacherActivity: "Teacher writes the exercise on the board. Teacher monitors progress and assists learners.",
        pupilActivity: "Learners to write the exercise in their exercise books. Learners to work individually.",
        methods: "Group Work, Individual Practice, Question and Answer"
      },
      {
        content: `SUMMARY AND APPLICATIONS\n\nSUMMARY:\n- Quadratic equations are of the form ax² + bx + c = 0\n- Three methods: Factorization, Completing Square, Quadratic Formula\n- Discriminant determines the nature of roots\n\nAPPLICATIONS:\n- Projectile motion in Physics\n- Profit and loss calculations in Business\n- Area problems in Geometry`,
        teacherActivity: "Teacher consolidates learners' responses and writes the summary on the board.",
        pupilActivity: "Learners to listen attentively and write the summary.",
        methods: "Review and Consolidation"
      }
    ];
  }

  if (topicLower.includes('trig') || topicLower.includes('sine') || topicLower.includes('cosine') || topicLower.includes('tangent')) {
    return [
      {
        content: `INTRODUCTION TO TRIGONOMETRY\n\nTrigonometry is the study of relationships between the sides and angles of triangles.\n\nTRIGONOMETRIC RATIOS:\n- sin θ = opposite / hypotenuse\n- cos θ = adjacent / hypotenuse\n- tan θ = opposite / adjacent\n\nSPECIAL ANGLES:\n- sin 30° = ½, cos 30° = √3/2, tan 30° = 1/√3\n- sin 45° = √2/2, cos 45° = √2/2, tan 45° = 1\n- sin 60° = √3/2, cos 60° = ½, tan 60° = √3`,
        teacherActivity: "Teacher writes the trigonometric ratios on the board. Teacher explains using right-angled triangles.",
        pupilActivity: "Learners to write the notes in their exercise books. Learners to listen attentively and identify opposite, adjacent, and hypotenuse.",
        methods: "Teacher Exposition, Demonstration, Question and Answer"
      },
      {
        content: `WORKED EXAMPLES\n\nEXAMPLE 1: Find sin θ, cos θ, and tan θ for a right triangle where opposite = 3, adjacent = 4, hypotenuse = 5.\nSolution: sin θ = 3/5 = 0.6, cos θ = 4/5 = 0.8, tan θ = 3/4 = 0.75\n\nEXAMPLE 2: In a right triangle, sin θ = ½. Find θ.\nSolution: θ = sin⁻¹(½) = 30°`,
        teacherActivity: "Teacher solves the examples on the board step by step. Teacher emphasizes the importance of identifying sides correctly.",
        pupilActivity: "Learners to write the examples in their exercise books. Volunteer learners to go and solve on the board.",
        methods: "Question and Answer, Demonstration, Group Discussion"
      },
      {
        content: `PRACTICE EXERCISES\n\n1. In a right triangle, opposite = 5, adjacent = 12. Find sin θ, cos θ, and tan θ.\n2. If cos θ = ¾, find sin θ and tan θ.\n3. If tan θ = 1, find the value of θ.\n\nEXPECTED ANSWERS:\n1. sin θ = 5/13, cos θ = 12/13, tan θ = 5/12\n2. sin θ = √7/4, tan θ = √7/3\n3. θ = 45°`,
        teacherActivity: "Teacher writes the exercise on the board. Teacher monitors progress and assists learners.",
        pupilActivity: "Learners to write the exercise in their exercise books. Learners to work individually.",
        methods: "Individual Practice, Question and Answer"
      },
      {
        content: `SUMMARY AND APPLICATIONS\n\nSUMMARY:\n- Trigonometry deals with triangle relationships\n- Three main ratios: sine, cosine, tangent\n- Use SOH CAH TOA to remember\n\nAPPLICATIONS:\n- Architecture and construction\n- Navigation and surveying\n- Engineering and physics`,
        teacherActivity: "Teacher consolidates learners' responses and writes the summary on the board.",
        pupilActivity: "Learners to listen attentively and write the summary.",
        methods: "Review and Consolidation"
      }
    ];
  }
  
  // Default - Generic content
  return [
    {
      content: `INTRODUCTION TO ${topic.toUpperCase()}\n\n${topic} is an important concept in ${subject}. It involves understanding the fundamental principles and applications in real-life situations.\n\nKEY CONCEPTS:\n- Understanding the basic principles\n- Identifying different types and categories\n- Applying concepts to solve problems`,
      teacherActivity: `Teacher writes the introduction on the board and explains the concept of ${topic}. Teacher asks learners to give examples of ${topic} in daily life.`,
      pupilActivity: "Learners to write the notes in their exercise books. Learners to listen attentively and participate in class discussions.",
      methods: "Teacher Exposition, Demonstration, Question and Answer"
    },
    {
      content: `MAIN CONTENT AND EXAMPLES\n\nWork through detailed examples showing how to apply the concepts.\n\nStep 1: Identify the key information\nStep 2: Apply the appropriate formula/method\nStep 3: Solve step by step\nStep 4: Check your answer`,
      teacherActivity: `Teacher solves ${topic} problems on the board step by step. Teacher allows learners to ask questions.`,
      pupilActivity: "Learners to listen attentively and take notes. Volunteer learners to go and solve on the board.",
      methods: "Question and Answer, Group Discussion, Demonstration"
    },
    {
      content: `PRACTICE EXERCISES\n\nEXERCISE:\n1. Solve the following problems related to ${topic}\n2. Apply the concepts to solve real-world problems\n3. Identify and correct common mistakes\n\nEXPECTED ANSWERS:\nDetailed solutions showing all steps.`,
      teacherActivity: `Teacher writes the exercise on the board. Teacher provides guidance and support to learners.`,
      pupilActivity: "Learners to write the exercise in their exercise books. Learners to work individually or in groups.",
      methods: "Group Work, Individual Practice, Question and Answer"
    },
    {
      content: `SUMMARY AND CONCLUSION\n\nSUMMARY:\n- Key points covered in the lesson\n- Important formulae or concepts to remember\n- Common applications in daily life\n\nCONCLUSION:\n${topic} is an essential topic in ${subject} that helps develop critical thinking and problem-solving skills.`,
      teacherActivity: "Teacher consolidates learners' responses and writes the summary on the board.",
      pupilActivity: "Learners to listen attentively and write the summary. Learners to ask final questions.",
      methods: "Review and Consolidation"
    }
  ];
}

// ============ CBC LESSON PROMPT ============
function generateCBCPrompt(topic, grade, subject, classSize, user, subtopic, term = '', curriculumContext = null) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;
  
  // Generate topic-specific lesson progression
  const lessonProgression = generateLessonProgression(topic, subject, grade);
  
  return `
You are an expert Zambian teacher creating a CBC (Competency-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".
Term: ${term || 'not supplied'}.

CURRICULUM SOURCE CONTROL:
${formatContext(curriculumContext)}

⚠️ CRITICAL: You MUST return ONLY valid JSON that EXACTLY matches this CBC lesson structure. The lessonProgression array MUST have content with all required fields.

{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "subtopic": "${subtopic || ''}",
  "teacherName": "${user.fullName || 'MR/MRS'}",
  "school": "${user.school || ''}",
  "date": "${new Date().toISOString().split('T')[0]}",
  "time": "10:20-11:00",
  "duration": "80 MINUTES",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
  "generalCompetences": [
    "Analytical thinking",
    "Collaboration",
    "Communication",
    "Critical thinking"
  ],
  "specificCompetence": "Apply the concepts of ${topic} to solve problems",
  "lessonGoal": "By the end of this lesson, learners will be able to identify, classify, and apply the concepts of ${topic}",
  "rationale": "Understanding ${topic} is essential for learners to develop critical thinking skills and solve real-world problems in ${subject}.",
  "priorKnowledge": "Learners have basic knowledge of the topic from previous lessons",
  "references": [
    "Use the verified curriculum source shown below when available"
  ],
  "learningEnvironment": "Classroom with adequate resources",
  "materials": [
    "Manila paper",
    "Markers",
    "Charts",
    "Worksheet",
    "Real objects"
  ],
  "expectedStandard": "Topic concepts classified correctly",
  "lessonProgression": ${JSON.stringify(lessonProgression, null, 2)},
  "homework": "Research and list examples of ${topic}",
  "lessonEvaluation": "Lesson was successful, key competences were acquired",
  "teacherEvaluation": "The lesson was well delivered. The majority of the learners were able to grasp the concept and could work out problems involving ${topic}. Remedial work was given to those who had challenges.",
  "learningOutcomes": [
    "By the end of this lesson, learners should be able to:",
    "Define ${topic}",
    "Explain the concept of ${topic}",
    "Apply ${topic} to solve problems",
    "Analyze real-world applications of ${topic}"
  ],
  "learnersEvaluation": [
    "Define ${topic} in your own words",
    "Give two examples of ${topic}",
    "Explain the importance of ${topic}"
  ],
  "teachingAids": ["Whiteboard", "Charts", "Diagrams", "Real objects"],
  "curriculum": "cbc"
}
`;
}

// ============ OBC LESSON PROMPT ============
function generateOBCPrompt(topic, grade, subject, classSize, user, subtopic) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;
  
  // Generate lesson development content based on topic
  const lessonDevelopment = generateLessonContent(topic, subject, grade);
  
  return `
You are an expert Zambian teacher creating an OBC (Objective-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

⚠️ CRITICAL: You MUST return ONLY valid JSON that EXACTLY matches this OBC lesson structure. The lessonDevelopment array MUST have content with all required fields including content, teacherActivity, pupilActivity, and methods. The content field MUST contain actual lesson content with examples, not empty placeholders.

{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "subtopic": "${subtopic || ''}",
  "teacherName": "${user.fullName || 'MR/MRS'}",
  "school": "${user.school || ''}",
  "date": "${new Date().toISOString().split('T')[0]}",
  "duration": "80 MINUTES",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
  "references": [
    "Progress in ${subject} Grade ${grade} pg 78",
    "Teacher-provided curriculum materials",
    "Teacher's Guide"
  ],
  "teachingAids": [
    "Learners book",
    "Chalk board",
    "Chart",
    "Diagrams"
  ],
  "prerequisiteKnowledge": "Learners have basic knowledge of ${topic} from previous lessons.",
  "lessonIntroduction": "Teacher revises through the previous lesson and introduces the topic.",
  "rationale": "This lesson is on ${topic}. Teacher Exposition, Demonstration, Question and answer and group or class discussion methods will be used. This lesson will develop learners knowledge of ${topic}. The skill of identification and application of ${topic} methods. The value of logical thinking and accuracy in computing ${topic}.",
  "learningOutcomes": [
    "By the end of this lesson, learners should be able to:",
    "Define ${topic}",
    "Explain the concept of ${topic}",
    "Apply ${topic} to solve problems",
    "Analyze real-world applications of ${topic}"
  ],
  "lessonDevelopment": ${JSON.stringify(lessonDevelopment, null, 2)},
  "learnersEvaluation": [
    "Define ${topic} in your own words",
    "Give two examples of ${topic}",
    "Solve a ${topic} problem",
    "Explain the importance of ${topic}"
  ],
  "expectedAnswers": [
    "Correct definition of ${topic}",
    "Two valid examples of ${topic}",
    "Correct solution to the ${topic} problem",
    "Clear explanation of the importance of ${topic}"
  ],
  "lessonConclusion": "Teacher concludes lesson by revising through the lesson with learners to help remedial learners.",
  "learnersEvaluationText": "Space for teacher's assessment of learner performance",
  "teacherEvaluation": "The lesson was well delivered. The majority of the learners were able to grasp the concept and could work out problems involving ${topic}. Remedial work was given to those who had challenges.",
  "curriculum": "obc"
}
`;
}

// ============ ENHANCED FALLBACK LESSON GENERATOR ============

function generateFallbackCBC(topic, grade, subject, classSize, user, curriculumContext = null) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;
  
  return {
    title: topic,
    grade: grade,
    subject: subject,
    teacherName: user?.fullName || 'MR/MRS',
    school: user?.school || '',
    province: user?.province || '',
    district: user?.district || '',
    date: new Date().toISOString().split('T')[0],
    time: "08:00-08:40",
    duration: "80 MINUTES",
    classSize: size,
    boys: boys,
    girls: girls,
    subtopic: '',
    generalCompetences: [
      "Analytical thinking",
      "Collaboration",
      "Communication",
      "Critical thinking"
    ],
    specificCompetence: `By the end of this lesson, learners will be able to understand and explain ${topic}`,
    lessonGoal: `By the end of this lesson, learners will be able to identify, classify, and explain the importance of ${topic}`,
    rationale: `Understanding ${topic} is essential for learners to develop critical thinking skills and make informed decisions.`,
    priorKnowledge: "Learners have basic knowledge of the topic from previous lessons",
    references: curriculumContext?.matched && curriculumContext.match?.reference ? [curriculumContext.match.reference] : ["Teacher-provided curriculum materials"],
    learningEnvironment: "Classroom with adequate resources",
    materials: ["Manila paper", "Markers", "Charts", "Worksheet", "Real objects"],
    expectedStandard: "Topic concepts explained correctly",
    lessonProgression: generateLessonProgression(topic, subject, grade),
    homework: `Research and list examples of ${topic}`,
    lessonEvaluation: "Lesson was successful, key competences were acquired",
    teacherEvaluation: "Space for teacher's reflections",
    learningOutcomes: [`Understand ${topic}`, `Apply ${topic}`, `Analyze ${topic}`],
    learnersEvaluation: [`Define ${topic}`, `Give examples of ${topic}`, `Explain the importance of ${topic}`],
    lessonDevelopment: generateLessonContent(topic, subject, grade),
    teachingAids: ["Whiteboard", "Charts", "Diagrams"],
    curriculum: 'cbc'
  };
}

function generateFallbackOBC(topic, grade, subject, classSize, user) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;
  
  return {
    title: topic,
    grade: grade,
    subject: subject,
    teacherName: user?.fullName || 'MR/MRS',
    school: user?.school || '',
    date: new Date().toISOString().split('T')[0],
    duration: '80 MINUTES',
    classSize: size,
    boys: boys,
    girls: girls,
    subtopic: '',
    references: [
      `Progress in ${subject} Grade ${grade} pg 78`,
      "Teacher-provided curriculum materials",
      "Teacher's Guide"
    ],
    teachingAids: ["Learners book", "Chalk board", "Chart", "Diagrams"],
    rationale: `This lesson is on ${topic}. Teacher Exposition, Demonstration, Question and answer and group or class discussion methods will be used. This lesson will develop learners knowledge of ${topic}. The skill of identification and application of ${topic} methods. The value of logical thinking and accuracy in computing ${topic}.`,
    learningOutcomes: [
      "By the end of this lesson, learners should be able to:",
      `Define ${topic}`,
      `Explain the concept of ${topic}`,
      `Apply ${topic} to solve problems`,
      `Analyze real-world applications of ${topic}`
    ],
    prerequisiteKnowledge: "Learners have ideas about the topic being taught.",
    lessonIntroduction: "Teacher revises through the previous lesson",
    lessonDevelopment: generateLessonContent(topic, subject, grade),
    learnersEvaluation: [
      `Define ${topic} in your own words`,
      `Give two examples of ${topic}`,
      `Solve a ${topic} problem`,
      `Explain the importance of ${topic}`
    ],
    expectedAnswers: [
      `Correct definition of ${topic}`,
      `Two valid examples of ${topic}`,
      `Correct solution to the ${topic} problem`,
      `Clear explanation of the importance of ${topic}`
    ],
    lessonConclusion: "Teacher concludes lesson by revising through the lesson with learners to help remedial learners",
    learnersEvaluationText: "Space for teacher's assessment of learner performance",
    teacherEvaluation: `The lesson was well delivered. The majority of the learners were able to grasp the concept and could work out problems involving ${topic}. Remedial work was given to those who had challenges.`,
    curriculum: 'obc'
  };
}

// ============ CBC SCHEME GENERATOR ============

function generateCBCScheme(grade, subject, term, user, customTopics = {}) {
  const weeks = [];
  const totalWeeks = 13;
  
  const subjectTopics = {
    'Biology': {
      topics: [
        { topic: '1.1.0 Concepts and Methods in Biology', subtopic: '1.1.1 Nature of Science inquiry in Biology', specificCompetence: 'Apply scientific inquiry in carrying out scientific investigations' },
        { topic: '1.1.0 Concepts and Methods in Biology', subtopic: '1.1.2 Branches of Biology', specificCompetence: 'Explore the branches of Biology and their applications' },
        { topic: '1.1.0 Concepts and Methods in Biology', subtopic: '1.1.3 Levels of Biological Organisation', specificCompetence: 'Classify the levels of biological organization from simple to complex' },
        { topic: '1.1.0 Concepts and Methods in Biology', subtopic: '1.1.4 Characteristics of living things', specificCompetence: 'Analyse the characteristics of living things' },
        { topic: '1.2.0 Principles of Cellular Life', subtopic: '1.2.1 Microscopes', specificCompetence: 'Use different types microscopes to examine specimens' },
        { topic: '1.2.0 Principles of Cellular Life', subtopic: '1.2.2 Basic Cell Structure', specificCompetence: 'Explore the basic cell structure' },
        { topic: '1.2.0 Principles of Cellular Life', subtopic: '1.2.3 Types of cell Specialisation', specificCompetence: 'Explore types of cell specialisation' },
        { topic: '1.2.0 Principles of Cellular Life', subtopic: '1.2.4 Cell Classification', specificCompetence: 'Classify cells according to their structure and function' },
        { topic: '1.3.0 Maintenance of the Organism', subtopic: '1.3.1 Nutrition in Man', specificCompetence: 'Classify types of food nutrients' },
        { topic: '1.3.0 Maintenance of the Organism', subtopic: '1.3.2 Sources of Food Nutrients', specificCompetence: 'Identify sources of food nutrients using food packaging labels' },
        { topic: '1.3.0 Maintenance of the Organism', subtopic: '1.3.3 Plant Nutrients', specificCompetence: 'Categorise plant nutrients into macro and micro nutrients' },
        { topic: '1.3.0 Maintenance of the Organism', subtopic: '1.3.4 Nutritional Deficiency Diseases', specificCompetence: 'Recommend appropriate nutrients to address deficiency diseases' },
        { topic: '1.4.0 Continuity of Life', subtopic: '1.4.1 Asexual and Sexual Reproduction', specificCompetence: 'Demonstrate understanding of how living organisms reproduce' },
        { topic: '1.4.0 Continuity of Life', subtopic: '1.4.2 Reproduction and Development in Human Beings', specificCompetence: 'Discuss understanding of reproduction and development in human beings' },
        { topic: '1.4.0 Continuity of Life', subtopic: '1.4.3 Reproduction in Microorganisms', specificCompetence: 'Evaluate the importance of reproduction in viruses, protozoa, bacteria and fungi' }
      ],
      methodOptions: [
        "Group work, Experiments, Field work, Research, Individual work",
        "Experimentation, group work, question and answer, demonstration",
        "Group work, Experiments, Field work, Research, Project work",
        "Demonstration, group work, think, pair and share, question and answer",
        "Role play, group work, question and answer, field work"
      ],
      aidsOptions: [
        "Apparatus, Books, Cell plants, Beakers, Clap stand",
        "Laboratory equipment, models, charts, specimens, microscopes",
        "Charts, diagrams, models, specimens, magnifying glasses",
        "Multi-media, charts, textbooks, real objects, packaging labels",
        "Field trip equipment, specimens, cameras, recording materials"
      ],
      valuesOptions: [
        "Responsibility, teamwork, curiosity, scientific inquiry",
        "Scientific inquiry, honesty, creativity, critical thinking",
        "Respect, cooperation, critical thinking, environmental awareness",
        "Integrity, diligence, innovation, appreciation of nature",
        "Accountability, empathy, resilience, collaboration"
      ],
      skillsOptions: [
        "Critical thinking, analysis, collaboration, observation",
        "Problem solving, research, presentation, scientific writing",
        "Communication, creativity, teamwork, data collection",
        "Leadership, innovation, adaptability, experimentation",
        "Self-study, collaboration, evaluation, reporting"
      ]
    },
    'Chemistry': {
      topics: [
        { topic: '1.1.0 Introduction to Chemistry', subtopic: '1.1.1 Nature of Chemistry', specificCompetence: 'Apply scientific inquiry in chemical investigations' },
        { topic: '1.1.0 Introduction to Chemistry', subtopic: '1.1.2 Laboratory Safety', specificCompetence: 'Demonstrate understanding of laboratory safety rules' },
        { topic: '1.1.0 Introduction to Chemistry', subtopic: '1.1.3 Laboratory Apparatus', specificCompetence: 'Identify and use laboratory apparatus correctly' },
        { topic: '1.2.0 Matter and its Properties', subtopic: '1.2.1 States of Matter', specificCompetence: 'Classify matter according to its states' },
        { topic: '1.2.0 Matter and its Properties', subtopic: '1.2.2 Separating Mixtures', specificCompetence: 'Apply methods of separating mixtures' },
        { topic: '1.3.0 Atomic Structure', subtopic: '1.3.1 Atomic Theory', specificCompetence: 'Explain the structure of an atom' }
      ],
      methodOptions: [
        "Group work, Experiments, Research, Individual work, Demonstration",
        "Experimentation, group work, question and answer, practical work",
        "Group work, Experiments, Research, Project work, Discussion",
        "Demonstration, group work, think, pair and share, problem solving"
      ],
      aidsOptions: [
        "Apparatus, Books, Beakers, Test tubes, Bunsen burner",
        "Laboratory equipment, models, charts, chemicals, safety equipment",
        "Charts, diagrams, models, specimens, periodic table",
        "Multi-media, charts, textbooks, real objects, lab equipment"
      ],
      valuesOptions: [
        "Responsibility, teamwork, curiosity, scientific inquiry",
        "Scientific inquiry, honesty, creativity, critical thinking",
        "Respect, cooperation, critical thinking, safety awareness",
        "Integrity, diligence, innovation, appreciation of chemistry"
      ],
      skillsOptions: [
        "Critical thinking, analysis, collaboration, observation",
        "Problem solving, research, presentation, scientific writing",
        "Communication, creativity, teamwork, data collection",
        "Leadership, innovation, adaptability, experimentation"
      ]
    },
    'Physics': {
      topics: [
        { topic: '1.1.0 Introduction to Physics', subtopic: '1.1.1 Nature of Physics', specificCompetence: 'Apply scientific inquiry in physical investigations' },
        { topic: '1.1.0 Introduction to Physics', subtopic: '1.1.2 Measurement', specificCompetence: 'Demonstrate understanding of measurement and units' },
        { topic: '1.2.0 Mechanics', subtopic: '1.2.1 Motion', specificCompetence: 'Analyse different types of motion' },
        { topic: '1.2.0 Mechanics', subtopic: '1.2.2 Forces', specificCompetence: 'Apply concepts of forces in daily life' }
      ],
      methodOptions: [
        "Group work, Experiments, Field work, Research, Individual work",
        "Experimentation, demonstration, question and answer, practical work",
        "Group work, Experiments, Research, Project work, Discussion",
        "Demonstration, group work, think, pair and share, problem solving"
      ],
      aidsOptions: [
        "Apparatus, Books, Measuring instruments, Equipment",
        "Laboratory equipment, models, charts, measuring tools",
        "Charts, diagrams, models, real objects, calculators",
        "Multi-media, charts, textbooks, specimens, equipment"
      ],
      valuesOptions: [
        "Responsibility, teamwork, curiosity, scientific inquiry",
        "Scientific inquiry, honesty, creativity, critical thinking",
        "Respect, cooperation, critical thinking, precision",
        "Integrity, diligence, innovation, appreciation of physics"
      ],
      skillsOptions: [
        "Critical thinking, analysis, collaboration, observation",
        "Problem solving, research, presentation, measurement skills",
        "Communication, creativity, teamwork, data analysis",
        "Leadership, innovation, adaptability, experimentation"
      ]
    },
    'Mathematics': {
      topics: [
        { topic: '1.1.0 Numbers and Operations', subtopic: '1.1.1 Number Systems', specificCompetence: 'Classify and operate on different number systems' },
        { topic: '1.1.0 Numbers and Operations', subtopic: '1.1.2 Operations on Numbers', specificCompetence: 'Apply operations on numbers accurately' },
        { topic: '1.2.0 Algebra', subtopic: '1.2.1 Algebraic Expressions', specificCompetence: 'Simplify and evaluate algebraic expressions' },
        { topic: '1.2.0 Algebra', subtopic: '1.2.2 Linear Equations', specificCompetence: 'Solve linear equations and inequalities' },
        { topic: '1.3.0 Geometry', subtopic: '1.3.1 Lines and Angles', specificCompetence: 'Apply properties of lines and angles' },
        { topic: '1.3.0 Geometry', subtopic: '1.3.2 Polygons', specificCompetence: 'Calculate perimeter and area of polygons' },
        { topic: '1.4.0 Mensuration', subtopic: '1.4.1 Area and Perimeter', specificCompetence: 'Calculate area and perimeter of plane figures' },
        { topic: '1.4.0 Mensuration', subtopic: '1.4.2 Volume and Capacity', specificCompetence: 'Calculate volume and capacity of solids' }
      ],
      methodOptions: [
        "Group work, Individual work, Question and answer, Practice",
        "Demonstration, group work, problem solving, individual work",
        "Group work, Research, Project work, Discussion",
        "Problem solving, group work, think, pair and share"
      ],
      aidsOptions: [
        "Charts, Models, Geometrical instruments, Textbooks",
        "Charts, diagrams, models, measuring tools, calculators",
        "Multi-media, charts, textbooks, real objects",
        "Geometrical instruments, charts, diagrams, models"
      ],
      valuesOptions: [
        "Accuracy, precision, logical thinking, perseverance",
        "Analytical thinking, creativity, critical thinking",
        "Respect, cooperation, critical thinking, problem solving",
        "Integrity, diligence, innovation, appreciation of mathematics"
      ],
      skillsOptions: [
        "Critical thinking, analysis, problem solving, computation",
        "Problem solving, research, presentation, logical reasoning",
        "Communication, creativity, teamwork, data analysis",
        "Leadership, innovation, adaptability, calculation"
      ]
    }
  };

  const subjectData = subjectTopics[subject] || {
    topics: [
      { topic: `1.1.0 Introduction to ${subject}`, subtopic: `1.1.1 Nature of ${subject}`, specificCompetence: `Apply scientific inquiry in ${subject} investigations` },
      { topic: `1.1.0 Introduction to ${subject}`, subtopic: `1.1.2 Key Concepts in ${subject}`, specificCompetence: `Demonstrate understanding of key concepts in ${subject}` },
      { topic: `1.2.0 Core Topics in ${subject}`, subtopic: `1.2.1 Fundamental Principles`, specificCompetence: `Apply fundamental principles of ${subject}` },
      { topic: `1.2.0 Core Topics in ${subject}`, subtopic: `1.2.2 Practical Applications`, specificCompetence: `Explore practical applications of ${subject}` }
    ],
    methodOptions: [
      "Group work, Experiments, Field work, Research, Individual work",
      "Demonstration, group work, question and answer, practical work",
      "Experimentation, discussion, group work, project work",
      "Research, presentation, practical work, collaboration"
    ],
    aidsOptions: [
      "Apparatus, Books, Charts, Models, Equipment",
      "Laboratory equipment, models, charts, textbooks",
      "Charts, diagrams, models, real objects",
      "Multi-media, charts, textbooks, specimens"
    ],
    valuesOptions: [
      "Responsibility, teamwork, curiosity, scientific inquiry",
      "Scientific inquiry, honesty, creativity, critical thinking",
      "Respect, cooperation, critical thinking, environmental awareness",
      "Integrity, diligence, innovation, appreciation of science"
    ],
    skillsOptions: [
      "Critical thinking, analysis, collaboration, observation",
      "Problem solving, research, presentation, scientific writing",
      "Communication, creativity, teamwork, data collection",
      "Leadership, innovation, adaptability, experimentation"
    ]
  };

  const topicsList = subjectData.topics || [];
  const methodOptions = subjectData.methodOptions || ["Group work, Experiments, Field work, Research, Individual work"];
  const aidsOptions = subjectData.aidsOptions || ["Apparatus, Books, Charts, Models, Equipment"];
  const valuesOptions = subjectData.valuesOptions || ["Responsibility, teamwork, curiosity, scientific inquiry"];
  const skillsOptions = subjectData.skillsOptions || ["Critical thinking, analysis, collaboration, observation"];

  const shuffledTopics = [...topicsList];
  for (let i = shuffledTopics.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledTopics[i], shuffledTopics[j]] = [shuffledTopics[j], shuffledTopics[i]];
  }

  const extendedTopics = [...shuffledTopics];
  while (extendedTopics.length < totalWeeks) {
    extendedTopics.push(...topicsList);
  }

  for (let i = 1; i <= totalWeeks; i++) {
    const weekNumber = i;
    const customTopic = customTopics[weekNumber];
    const isRevision = [1, 5, 9].includes(i);
    const isAssessment = [3, 6, 9, 12].includes(i);
    
    let weekTopics = [];
    
    if (isRevision) {
      weekTopics = [{
        topic: 'REVISION WEEK',
        subtopic: 'Revision of covered topics',
        specificCompetence: 'Correct their past misconceptions and consolidate learning',
        methods: 'Class discussion, Question and answer, Group work, Peer teaching',
        aids: 'Test papers, Revision notes, Charts, Summary materials',
        references: 'Previous notes, Marking keys, Teacher\'s guide',
        knowledge: 'Consolidated understanding of topics covered',
        skills: 'Review, recall, synthesis of information',
        values: 'Perseverance, self-improvement, collaboration'
      }];
    } else if (isAssessment) {
      weekTopics = [{
        topic: 'ASSESSMENT WEEK',
        subtopic: 'Assessment and Evaluation',
        specificCompetence: 'Demonstrate understanding of the topics covered through assessment',
        methods: 'Test, Examination, Practical assessment, Quiz',
        aids: 'Examination papers, Answer sheets, Marking scheme',
        references: 'Teacher\'s guide, Marking scheme, Syllabus',
        knowledge: 'Demonstrated understanding of covered topics',
        skills: 'Test-taking, time management, application of knowledge',
        values: 'Honesty, accountability, academic integrity'
      }];
    } else if (customTopic) {
      const topicIndex = (i - 1) % extendedTopics.length;
      const defaultTopic = extendedTopics[topicIndex] || { topic: customTopic, subtopic: '', specificCompetence: '' };
      weekTopics = [{
        topic: defaultTopic.topic || customTopic,
        subtopic: defaultTopic.subtopic || customTopic,
        specificCompetence: defaultTopic.specificCompetence || `By the end of this lesson, learners will be able to understand and apply knowledge of ${customTopic}`,
        methods: methodOptions[i % methodOptions.length],
        aids: aidsOptions[i % aidsOptions.length],
        references: "Teacher-provided curriculum materials",
        knowledge: `Comprehensive knowledge of ${customTopic}`,
        skills: skillsOptions[i % skillsOptions.length],
        values: valuesOptions[i % valuesOptions.length]
      }];
    } else {
      const topicIndex = (i - 1) % extendedTopics.length;
      const topicData = extendedTopics[topicIndex];
      
      weekTopics = [{
        topic: topicData.topic || `Topic ${i}`,
        subtopic: topicData.subtopic || `Subtopic ${i}`,
        specificCompetence: topicData.specificCompetence || `By the end of this lesson, learners will be able to understand and explain the concepts`,
        methods: methodOptions[i % methodOptions.length],
        aids: aidsOptions[i % aidsOptions.length],
        references: "Teacher-provided curriculum materials",
        knowledge: `Comprehensive knowledge of ${topicData.topic}`,
        skills: skillsOptions[i % skillsOptions.length],
        values: valuesOptions[i % valuesOptions.length]
      }];
    }
    
    weeks.push({
      week: i,
      topics: weekTopics,
      assessment: isAssessment ? `End of Week ${i} Assessment` : null,
      isRevision: isRevision,
      isAssessment: isAssessment
    });
  }

  return {
    weeks: weeks,
    assessmentWeeks: [3, 6, 9, 12],
    testTopics: [`Mid-term test on ${subject}`, `End of term test on ${subject}`],
    curriculum: 'cbc'
  };
}

function generateOBCScheme(grade, subject, term, user, customTopics = {}) {
  const weeks = [];
  const totalWeeks = 13;
  
  const subjectTopics = {
    'Biology': [
      'Cell Structure and Function', 'Genetics and Heredity', 'Ecology and Environment',
      'Human Anatomy', 'Plant Physiology', 'Sense Organs and Locomotion',
      'Reproduction', 'Nutrition', 'Transport Systems',
      'Respiration', 'Excretion', 'Nervous System',
      'Endocrine System', 'Immunity and Disease', 'Evolution'
    ],
    'Mathematics': [
      'Algebra and Equations', 'Geometry and Trigonometry', 'Statistics and Probability',
      'Calculus', 'Vectors and Matrices', 'Sets and Logic',
      'Number Theory', 'Graphs and Functions', 'Sequences and Series',
      'Differentiation', 'Integration', 'Complex Numbers',
      'Linear Programming', 'Financial Mathematics', 'Mechanics'
    ],
    'Chemistry': [
      'Atomic Structure', 'Chemical Bonding', 'Organic Chemistry',
      'Acids and Bases', 'Periodic Table', 'Stoichiometry',
      'Thermodynamics', 'Kinetics', 'Electrochemistry',
      'Equilibrium', 'Chemical Reactions', 'States of Matter',
      'Solutions', 'Environmental Chemistry', 'Biochemistry'
    ],
    'Physics': [
      'Mechanics', 'Thermodynamics', 'Waves and Sound',
      'Electricity and Magnetism', 'Optics', 'Nuclear Physics',
      'Kinematics', 'Dynamics', 'Gravitation',
      'Quantum Physics', 'Astrophysics', 'Fluid Mechanics',
      'Relativity', 'Electronics', 'Energy and Power'
    ]
  };

  const topicsList = subjectTopics[subject] || [
    `Introduction to ${subject}`,
    `Basic concepts of ${subject}`,
    `Advanced ${subject} topics`,
    `Practical applications of ${subject}`,
    `Review and assessment of ${subject}`
  ];

  const shuffledTopics = [...topicsList];
  for (let i = shuffledTopics.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledTopics[i], shuffledTopics[j]] = [shuffledTopics[j], shuffledTopics[i]];
  }

  const extendedTopics = [...shuffledTopics];
  while (extendedTopics.length < totalWeeks) {
    extendedTopics.push(...topicsList);
  }

  const methodOptions = [
    "Lecture, discussion, group work, question and answer",
    "Experimentation, group work, question and answer",
    "Demonstration, group work, think, pair and share",
    "Experimentation, discussion, question and answer",
    "Role play, group work, question and answer"
  ];
  
  const aidsOptions = [
    "Whiteboard, charts, textbooks, diagrams",
    "Laboratory equipment, models, charts",
    "Charts, diagrams, models, specimens",
    "Multi-media, charts, textbooks",
    "Field trips, specimens, cameras"
  ];
  
  const valuesOptions = [
    "Responsibility, teamwork, curiosity",
    "Scientific inquiry, honesty, creativity",
    "Respect, cooperation, critical thinking",
    "Integrity, diligence, innovation",
    "Accountability, empathy, resilience"
  ];
  
  const skillsOptions = [
    "Critical thinking, analysis, collaboration",
    "Problem solving, research, presentation",
    "Communication, creativity, teamwork",
    "Leadership, innovation, adaptability",
    "Self-study, collaboration, evaluation"
  ];

  for (let i = 1; i <= totalWeeks; i++) {
    const weekTopics = [];
    const weekNumber = i;
    const customTopic = customTopics[weekNumber];
    const isRevision = [1, 5, 9].includes(i);
    const isAssessment = [3, 6, 9, 12].includes(i);
    
    if (isRevision) {
      weekTopics.push({
        topic: 'REVISION WEEK',
        specificOutcome: 'Correct their past misconceptions',
        methods: 'Class discussion, Question and answer, Group work',
        aids: 'Test papers, Revision notes',
        references: 'Test papers, Marking keys',
        knowledge: '',
        skills: '',
        values: ''
      });
    } else if (isAssessment) {
      weekTopics.push({
        topic: 'ASSESSMENT',
        specificOutcome: 'Demonstrate understanding of the topics covered',
        methods: 'Test, Examination, Practical assessment',
        aids: 'Examination papers, Answer sheets',
        references: 'Teacher\'s guide, Marking scheme',
        knowledge: '',
        skills: '',
        values: ''
      });
    } else if (customTopic) {
      weekTopics.push({
        topic: customTopic,
        specificOutcome: `By the end of this lesson, learners will be able to understand and apply knowledge of ${customTopic}`,
        methods: "Lecture, discussion, group work, question and answer",
        aids: "Whiteboard, charts, textbooks, diagrams",
        references: "Teacher-provided curriculum materials",
        knowledge: `Comprehensive knowledge of ${customTopic}`,
        skills: "Critical thinking, analysis, collaboration",
        values: "Responsibility, teamwork, curiosity"
      });
    } else {
      const topicIndex = (i - 1) % extendedTopics.length;
      const topicName = extendedTopics[topicIndex];
      
      const methodIndex = (i - 1) % methodOptions.length;
      const aidsIndex = (i - 1) % aidsOptions.length;
      const skillsIndex = (i - 1) % skillsOptions.length;
      const valuesIndex = (i - 1) % valuesOptions.length;
      
      weekTopics.push({
        topic: topicName,
        specificOutcome: `By the end of this lesson, learners will be able to understand and explain ${topicName}`,
        methods: methodOptions[methodIndex],
        aids: aidsOptions[aidsIndex],
        references: "Teacher-provided curriculum materials",
        knowledge: `Comprehensive knowledge of ${topicName}`,
        skills: skillsOptions[skillsIndex],
        values: valuesOptions[valuesIndex]
      });
    }
    
    weeks.push({
      week: i,
      topics: weekTopics,
      assessment: isAssessment ? `End of Week ${i} Assessment` : null
    });
  }

  return {
    weeks: weeks,
    assessmentWeeks: [3, 6, 9, 12],
    testTopics: [`Mid-term test on ${subject}`, `End of term test on ${subject}`],
    curriculum: 'obc'
  };
}

// ============ AUTH ROUTES ============

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, school, province, district, grades, subjects } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash: hashedPassword,
        school,
        province,
        district,
        grades: grades || [],
        subjects: subjects || [],
        role: 'FREE',
        lastActive: new Date(),
      }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const { passwordHash, ...userWithoutPassword } = user;
    res.status(201).json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const { passwordHash, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ============ LESSON GENERATION ROUTE ============

app.post('/api/lessons/generate', authenticate, async (req, res) => {
  try {
    const { topic, grade, subject, classSize, curriculum, subtopic, term } = req.body;

    if (!topic || !grade || !subject) {
      return res.status(400).json({ error: 'Missing required fields: topic, grade, subject' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'ADMIN' && user.lessonsUsed >= user.lessonsLimit) {
      return res.status(403).json({
        error: 'Lesson limit reached. Please upgrade your plan to generate more lessons.'
      });
    }

    const curriculumType = curriculum || 'cbc';

    // Keep lesson-plan grade/form selection consistent with the curriculum mode.
    // CBC uses Grades 1–6 and Secondary Forms 1–4; OBC/legacy permits Grades 1–12 and Forms 1–6.
    const normalizedGrade = String(grade).trim().replace(/\s+/g, ' ');
    const gradeMatch = normalizedGrade.match(/^Grade\s+(\d+)$/i);
    const formMatch = normalizedGrade.match(/^Form\s+(\d+)$/i);
    const gradeNumber = gradeMatch ? Number(gradeMatch[1]) : null;
    const formNumber = formMatch ? Number(formMatch[1]) : null;

    // Keep the API rules identical to the Lesson Plan selector.
    // Secondary 2024 CBC subjects are taught at Forms 1–4; primary CBC uses Grades 1–6.
    const secondaryCBCSubjects = new Set([
      'Agricultural Science', 'Art and Design', 'Biology', 'Chemistry',
      'Civic Education', 'Commerce', 'Computer Science', 'Design and Technology Studies',
      'English', 'Fashion and Fabrics', 'Food and Nutrition', 'French', 'Geography',
      'History', 'Hospitality Management', 'ICT', 'Literature in English',
      'Mathematics I', 'Mathematics II', 'Musical Arts Education',
      'Physical Education and Sport', 'Physics', 'Religious Education',
      'Travel and Tourism', 'Zambian Languages', 'Principles of Accounts'
    ]);
    const normalizedSubject = String(subject).trim().toLowerCase();
    const isSecondaryCBCSubject = Array.from(secondaryCBCSubjects)
      .some((name) => name.toLowerCase() === normalizedSubject);

    if (curriculumType === 'cbc') {
      const validCBCLevel = isSecondaryCBCSubject
        ? (formNumber !== null && formNumber >= 1 && formNumber <= 4)
        : ((gradeNumber !== null && gradeNumber >= 1 && gradeNumber <= 6) ||
           (formNumber !== null && formNumber >= 1 && formNumber <= 4));
      if (!validCBCLevel) {
        return res.status(400).json({
          error: isSecondaryCBCSubject
            ? `Invalid CBC level for ${subject}. Use Form 1–4 for 2024 CBC secondary subjects.`
            : 'Invalid CBC grade/form. Use Grade 1–6 or Form 1–4 for the 2024 Competence-Based Curriculum.'
        });
      }
    } else {
      const validOBCLevel = (gradeNumber !== null && gradeNumber >= 1 && gradeNumber <= 12) ||
        (formNumber !== null && formNumber >= 1 && formNumber <= 6);
      if (!validOBCLevel) {
        return res.status(400).json({
          error: 'Invalid OBC grade/form. Use Grade 1–12 or Form 1–6.'
        });
      }
    }

    const size = parseInt(classSize) || 40;
    const boys = Math.floor(size / 2) || 18;
    const girls = Math.ceil(size / 2) || 22;
    
    let aiContent = null;
    let useFallback = false;
    let curriculumContext = null;

    try {
      let prompt;
      
      if (curriculumType === 'cbc') {
        curriculumContext = getCurriculumContext({ curriculum: curriculumType, grade, subject, term, topic, subtopic });
        prompt = generateCBCPrompt(topic, grade, subject, classSize, user, subtopic, term, curriculumContext);
      } else {
        prompt = generateOBCPrompt(topic, grade, subject, classSize, user, subtopic);
      }

      console.log(`📝 Generating ${curriculumType.toUpperCase()} lesson with DeepSeek...`);

      const messages = [
        {
          role: "system",
          content: `
You are an expert Zambian teacher creating ${curriculumType.toUpperCase()} lesson plans.

The user will provide a topic and requirements for a lesson plan.
Parse the information and output it in valid JSON format.

For CBC: Include lessonProgression array with stages, times, teacherRole, learnerRole, and assessmentCriteria.
For OBC: Include lessonDevelopment array with content, teacherActivity, pupilActivity, and methods.

⚠️ CRITICAL: The lessonProgression and lessonDevelopment arrays MUST have content. Do NOT return empty arrays.

Return ONLY the JSON object, no other text.
`
        },
        {
          role: "user",
          content: prompt
        }
      ];

      aiContent = await generateDeepSeekJSON(messages, { 
        max_tokens: 4000,
        temperature: 0.3
      });
      
      let fallback;
      if (curriculumType === 'cbc') {
        fallback = generateFallbackCBC(topic, grade, subject, classSize, user);
      } else {
        fallback = generateFallbackOBC(topic, grade, subject, classSize, user);
      }
      aiContent = { ...fallback, ...aiContent };

      // FORCE populate if empty - THIS IS THE CRITICAL FIX
      if (curriculumType === 'cbc' && (!aiContent.lessonProgression || aiContent.lessonProgression.length === 0)) {
        console.log('📝 CBC lessonProgression was empty, FORCE populating with content...');
        aiContent.lessonProgression = generateLessonProgression(topic, subject, grade);
      }

      if (curriculumType === 'obc' && (!aiContent.lessonDevelopment || aiContent.lessonDevelopment.length === 0)) {
        console.log('📝 OBC lessonDevelopment was empty, FORCE populating with content...');
        aiContent.lessonDevelopment = generateLessonContent(topic, subject, grade);
      }

      console.log(`✅ ${curriculumType.toUpperCase()} lesson generated with DeepSeek`);
      console.log(`📝 lessonProgression length: ${aiContent.lessonProgression?.length || 0}`);
      console.log(`📝 lessonDevelopment length: ${aiContent.lessonDevelopment?.length || 0}`);

    } catch (error) {
      console.log('⚠️ DeepSeek error, using fallback:', error.message);
      useFallback = true;
    }

    if (useFallback || !aiContent) {
      console.log(`📝 Using ${curriculumType.toUpperCase()} fallback`);
      if (curriculumType === 'cbc') {
        aiContent = generateFallbackCBC(topic, grade, subject, classSize, user, curriculumContext);
      } else {
        aiContent = generateFallbackOBC(topic, grade, subject, classSize, user);
      }
    }

    // ONE MORE FINAL CHECK - Ensure lessonProgression is populated
    if (curriculumType === 'cbc' && (!aiContent.lessonProgression || aiContent.lessonProgression.length === 0)) {
      console.log('🔧 FINAL FORCE: lessonProgression still empty, populating...');
      aiContent.lessonProgression = generateLessonProgression(topic, subject, grade);
    }

    if (curriculumType === 'obc' && (!aiContent.lessonDevelopment || aiContent.lessonDevelopment.length === 0)) {
      console.log('🔧 FINAL FORCE: lessonDevelopment still empty, populating...');
      aiContent.lessonDevelopment = generateLessonContent(topic, subject, grade);
    }

    if (curriculumType === 'cbc' && curriculumContext?.matched && curriculumContext.match) {
      aiContent.specificCompetence = curriculumContext.match.specificCompetence || aiContent.specificCompetence;
      aiContent.expectedStandard = curriculumContext.match.expectedStandard || aiContent.expectedStandard;
      aiContent.materials = curriculumContext.match.resources || aiContent.materials;
      aiContent.subtopic = curriculumContext.match.subTopic || aiContent.subtopic;
    }

    let referencesArray = Array.isArray(aiContent.references)
      ? aiContent.references
      : (aiContent.references ? [aiContent.references] : []);

    // CBC references are controlled by the official DCD registry plus any
    // verified local source-pack reference. Never ask DeepSeek to invent a
    // textbook, Teaching Module title, publisher or page number.
    if (curriculumType === 'cbc') {
      const officialRefs = getReferenceTitles({ subject, grade, term, context: curriculumContext });
      if (officialRefs.length) referencesArray = officialRefs;
      else if (!referencesArray.length) referencesArray = ['No verified official reference is loaded for this selection'];
    } else if (!referencesArray.length) {
      referencesArray = ['Teacher-provided curriculum materials'];
    }

    const materialsArray = Array.isArray(aiContent.materials) 
      ? aiContent.materials 
      : (aiContent.materials ? [aiContent.materials] : ["Manila paper", "Markers", "Charts", "Worksheet", "Real objects"]);

    const teachingAidsArray = Array.isArray(aiContent.teachingAids) 
      ? aiContent.teachingAids 
      : (aiContent.teachingAids ? [aiContent.teachingAids] : ["Whiteboard", "Charts", "Diagrams"]);

    const generalCompetencesArray = Array.isArray(aiContent.generalCompetences) 
      ? aiContent.generalCompetences 
      : ["Analytical thinking", "Collaboration", "Communication", "Critical thinking"];

    const learningOutcomesArray = Array.isArray(aiContent.learningOutcomes) 
      ? aiContent.learningOutcomes 
      : [`Understand ${topic}`, `Apply ${topic}`, `Analyze ${topic}`];

    const learnersEvaluationArray = Array.isArray(aiContent.learnersEvaluation) 
      ? aiContent.learnersEvaluation 
      : [`Define ${topic}`, `Give examples of ${topic}`, `Explain the importance of ${topic}`];

    const lessonProgressionArray = Array.isArray(aiContent.lessonProgression) 
      ? aiContent.lessonProgression 
      : generateLessonProgression(topic, subject, grade);

    let lessonDevelopmentArray = Array.isArray(aiContent.lessonDevelopment) 
      ? aiContent.lessonDevelopment 
      : [];

    if (lessonDevelopmentArray.length === 0) {
      console.log('📝 lessonDevelopment was empty, populating with default content...');
      lessonDevelopmentArray = generateLessonContent(topic, subject, grade);
    }

    // Normalize OBC development field names so both the AI response and
    // legacy fallback generator are compatible with the frontend/exporters.
    if (curriculumType === 'obc') {
      lessonDevelopmentArray = lessonDevelopmentArray.map((item, index) => ({
        ...item,
        time: item.time || ['10 min', '15 min', '15 min', '10 min'][index] || '10 min',
        learningPoints: item.learningPoints ?? item.content ?? '',
        teacherActivities: item.teacherActivities ?? item.teacherActivity ?? '',
        pupilActivities: item.pupilActivities ?? item.pupilActivity ?? '',
        content: item.content ?? item.learningPoints ?? '',
        teacherActivity: item.teacherActivity ?? item.teacherActivities ?? '',
        pupilActivity: item.pupilActivity ?? item.pupilActivities ?? ''
      }));
    }

    const lesson = await prisma.lesson.create({
      data: {
        userId: req.userId,
        grade: grade,
        subject: subject,
        topic: topic,
        subtopic: aiContent.subtopic || subtopic || '',
        title: aiContent.title || topic,
        classSize: size,
        duration: aiContent.duration || '80 MINUTES',
        curriculum: curriculumType,
        objectives: learningOutcomesArray,
        development: lessonDevelopmentArray.map(d => d.learningPoints || d.content) || [],
        activities: lessonDevelopmentArray.map(d => d.pupilActivity || d.pupilActivities) || [],
        assessment: learnersEvaluationArray.join(', ') || '',
        curriculumCodes: curriculumContext?.matched && curriculumContext.match?.topic ? [curriculumContext.match.topic] : [],
        provinceContext: user.province || '',
        lessonDevelopment: lessonDevelopmentArray,
        lessonProgression: lessonProgressionArray,
        learningOutcomes: learningOutcomesArray,
        learnersEvaluation: learnersEvaluationArray,
        teacherEvaluation: aiContent.teacherEvaluation || '',
        generalCompetences: generalCompetencesArray,
        specificCompetence: aiContent.specificCompetence || '',
        lessonGoal: aiContent.lessonGoal || '',
        rationale: aiContent.rationale || '',
        priorKnowledge: aiContent.priorKnowledge || '',
        references: referencesArray,
        learningEnvironment: aiContent.learningEnvironment || '',
        materials: materialsArray,
        expectedStandard: aiContent.expectedStandard || '',
        homework: aiContent.homework || '',
        lessonEvaluation: aiContent.lessonEvaluation || '',
        teacherName: user.fullName || '',
        school: user.school || '',
        province: user.province || '',
        district: user.district || '',
        date: aiContent.date || new Date().toISOString().split('T')[0],
        time: aiContent.time || '',
        boys: aiContent.boys || 0,
        girls: aiContent.girls || 0,
        teachingAids: teachingAidsArray
      }
    });

    await prisma.user.update({
      where: { id: req.userId },
      data: { lessonsUsed: user.lessonsUsed + 1 }
    });

    const responseData = {
      ...aiContent,
      id: lesson.id,
      createdAt: lesson.createdAt,
      grade: grade,
      subject: subject,
      topic: topic,
      classSize: size,
      curriculum: curriculumType,
      school: user.school || '',
      province: user.province || '',
      district: user.district || '',
      teacherName: user.fullName || ''
    };

    if (curriculumType === 'cbc') {
      responseData.lessonProgression = lessonProgressionArray;
      responseData.curriculumSourceStatus = curriculumContext?.sourceStatus || 'SOURCE_NOT_FOUND';
      responseData.curriculumSource = curriculumContext?.source || null;
      responseData.curriculumMatch = curriculumContext?.match || null;
    } else {
      responseData.lessonDevelopment = lessonDevelopmentArray;
      responseData.curriculumSourceStatus = 'OBC_MODE';
    }

    res.status(201).json(responseData);

  } catch (error) {
    console.error('❌ Lesson generation error:', error);
    res.status(500).json({
      error: 'Failed to generate lesson',
      details: error.message
    });
  }
});

// ============ SCHEME OF WORK GENERATION ROUTE ============

app.post('/api/schemes/generate', authenticate, async (req, res) => {
  try {
    const { 
      grade, subject, term, year, school, 
      weeks: totalWeeks, assessmentWeeks, testTopics, 
      weekTopics, weekSubtopics, subtopic, curriculum 
    } = req.body;

    if (!grade || !subject) {
      return res.status(400).json({ error: 'Missing required fields: grade, subject' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'ADMIN' && user.schemesUsed >= user.schemesLimit) {
      return res.status(403).json({
        error: 'Scheme limit reached. Please upgrade your plan to generate more schemes.'
      });
    }

    const curriculumType = String(curriculum || 'cbc').toLowerCase();

    // The official 2024 secondary syllabus is organised as Forms, not the
    // old Grade 8-12 labels. For registered secondary subjects, the
    // ordinary-level DCD syllabus currently indexed by MyToolbox is Form 1-4.
    // Do not let a Grade 11/12 selection silently generate a fake 2024 CBC
    // scheme by mixing legacy content with the new syllabus.
    if (curriculumType === 'cbc') {
      const registeredSubject = getRegisteredOfficialSource(subject);
      const secondaryGrade = /^grade\s*(?:[8-9]|1[0-2])$/i.test(String(grade || '').trim());
      const unsupportedForm = /^form\s*(?:5|6)$/i.test(String(grade || '').trim());
      if (registeredSubject && (secondaryGrade || unsupportedForm)) {
        return res.status(400).json({
          error: `For the 2024 CBC ${subject} syllabus, select Form 1, Form 2, Form 3 or Form 4. ${grade} is an old/legacy grade label and must be generated under OBC.`,
          code: 'CBC_SECONDARY_REQUIRES_FORM_1_4',
          curriculum: 'cbc',
          subject,
          allowedGrades: ['Form 1', 'Form 2', 'Form 3', 'Form 4']
        });
      }
    }

    // MyToolbox syllabus mode: CBC uses the current 2024 Competence-Based
    // Curriculum; OBC uses the legacy/old syllabus structure.  This is kept
    // separate from the output format so DeepSeek knows which syllabus family
    // to follow when generating content.
    const syllabusVersion = curriculumType === 'cbc'
      ? 'NEW_2024_CBC'
      : 'OLD_LEGACY_OBC';
    const sourcePacks = listCurriculumSources({ curriculum: curriculumType, grade, subject, term });
    const sourceRowsDetailed = listCurriculumRows({ curriculum: curriculumType, grade, subject, term });
    const sourceRows = sourceRowsDetailed.map((row) => ({
      week: row.week,
      topic: row.topic,
      subTopic: row.subTopic || row.subtopic || '',
      specificCompetence: row.specificCompetence || row.specificCompetences || '',
      expectedStandard: row.expectedStandard || row.expectedStandards || '',
      methods: row.methods || row.strategies || '',
      resources: row.resources || row.aids || '',
      knowledge: row.knowledge || '',
      skills: row.skills || '',
      values: row.values || '',
      reference: (() => {
        const localReference = row.reference || row.references || '';
        const titles = getReferenceTitles({
          subject,
          grade,
          term,
          context: {
            matched: Boolean(localReference),
            match: localReference ? { reference: localReference } : null,
            source: row._source || null
          }
        });
        return titles.join('; ');
      })(),
      source: row._source
    }));
    console.log(`📚 Curriculum source packs found: ${sourcePacks.length}`);
    console.log(`📝 Generating ${curriculumType.toUpperCase()} scheme with DeepSeek (${syllabusVersion})...`);
    
    const assessmentWeeksList = assessmentWeeks || [3, 6, 9, 12];
    const customTopics = weekTopics || {};
    const customSubtopics = weekSubtopics || {};
    const totalWeeksCount = totalWeeks || 13;
    const subtopicsList = subtopic ? subtopic.split(',').map(s => s.trim()) : [];
    
    let aiContent = null;
    let useFallback = false;
    
    try {
      let prompt;
      
      if (curriculumType === 'cbc') {
        let customTopicsString = '';
        let matchedSourceDetails = '';
        Object.keys(customTopics).forEach(week => {
          if (customTopics[week]) {
            customTopicsString += `Week ${week}: ${customTopics[week]}\n`;
            const ctx = getCurriculumContext({ curriculum: curriculumType, grade, subject, term, topic: customTopics[week], subtopic: customSubtopics[week] });
            if (ctx.matched) matchedSourceDetails += `Week ${week}: ${formatContext(ctx)}\n`;
          }
        });

        const officialReferenceTitles = getReferenceTitles({ subject, grade, term });
        prompt = `
You are generating a Zambian school scheme of work.
SYLLABUS VERSION: NEW 2024 COMPETENCE-BASED CURRICULUM (CBC)
Grade/Form: "${grade}"
Subject: "${subject}"
Term: "${term || 'Term 1'}"

IMPORTANT SYLLABUS RULES:
- Follow the current Zambia Ministry of Education 2024 syllabus for the selected subject, grade/form and term.
- Do NOT use the old/legacy syllabus when CBC is selected.
- Use official syllabus topic/sub-topic terminology and numbering where known.
- Do not invent unrelated topics merely to fill weeks.
- If the user supplies topics/subtopics, preserve them and build the CBC competences, activities and standards around them.
- If an official topic cannot be confidently identified, use the closest syllabus-aligned topic and keep the wording conservative rather than fabricating syllabus codes.
- The output must remain suitable for a Zambian Ministry of Education CBC scheme of work.
${customTopicsString ? `User topics (respect these):\n${customTopicsString}` : 'Generate appropriate topics for all weeks from the selected 2024 CBC syllabus.'}
Assessment weeks: ${assessmentWeeksList.join(', ')}

OFFICIAL DCD REFERENCE CONTROL:
${officialReferenceTitles.length ? officialReferenceTitles.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'No registered official DCD reference is available for this selection.'}
- These are verified reference titles from the Zambia Ministry of Education Directorate of Curriculum Development registry.
- Do not invent textbooks, Teaching Module titles, authors, publishers or page numbers.

LOCAL CURRICULUM SOURCE CONTROL:
${sourceRows.length ? JSON.stringify(sourceRows, null, 2) : 'NO VERIFIED LOCAL SOURCE PACK IS AVAILABLE FOR THIS SUBJECT/GRADE/TERM. Do not invent official syllabus codes, page numbers or CDC claims.'}
- When a local source pack is available, its rows are the authoritative local sequence for this generation. Preserve the supplied topic/subtopic/competence wording rather than replacing it with a generic DeepSeek sequence.
- Never use a subject-specific default such as Biology when the selected subject is different.
- References must use the verified DCD reference titles supplied above, plus a matched local source-pack page/range when one exists. Never invent a textbook or page.
${matchedSourceDetails ? `VERIFIED DETAILS FOR USER-SUPPLIED TOPICS:
${matchedSourceDetails}` : ''}
- If a verified local source row matches a supplied topic, preserve its official wording, competence, resources and reference.
- If a verified source pack exists but the user leaves a week topic blank, use the source pack sequence rather than inventing a different topic.
- If no verified source exists, generate a useful scheme but do not label invented topic codes/references as official CDC content.

Return ONLY valid JSON with this CBC scheme structure:
{
  "weeks": [
    {
      "week": 1,
      "topics": [
        {
          "topic": "Topic code and name (e.g., 1.1.0 Concepts and Methods in Biology)",
          "subtopic": "Subtopic name (e.g., 1.1.1 Nature of Science inquiry)",
          "specificCompetence": "What learners should achieve (e.g., Apply scientific inquiry in carrying out scientific investigations)",
          "methods": "Teaching methods (e.g., Group work, Experiments, Field work)",
          "aids": "Teaching aids/resources (e.g., Apparatus, Books, Beakers)",
          "references": "Reference books (e.g., 2024 New Syllabus pages 1-10)",
          "knowledge": "Knowledge gained from the topic",
          "skills": "Skills developed",
          "values": "Values adopted"
        }
      ],
      "assessment": null,
      "isRevision": false,
      "isAssessment": false
    }
  ],
  "assessmentWeeks": [3, 6, 9, 12],
  "testTopics": ["Mid-term test", "End of term test"]
}
`;
      } else {
        let customTopicsString = '';
        Object.keys(customTopics).forEach(week => {
          if (customTopics[week]) {
            customTopicsString += `Week ${week}: ${customTopics[week]}\n`;
          }
        });

        prompt = `
You are generating a Zambian school scheme of work.
SYLLABUS VERSION: OLD / LEGACY ZAMBIAN O-LEVEL SYLLABUS
Grade/Form: "${grade}"
Subject: "${subject}"
Term: "${term || 'Term 1'}"

IMPORTANT SYLLABUS RULES:
- Follow the older/legacy Zambia syllabus structure for the selected subject, grade/form and term.
- Do NOT replace the old syllabus topics with the 2024 CBC topic sequence when OBC is selected.
- Preserve established old-syllabus topic/sub-topic names and numbering where known.
- If the user supplies topics/subtopics, preserve them.
- Do not invent unrelated content just to fill weeks.
- Keep objectives, methods, aids, knowledge, skills and values appropriate to the old Objective-Based Curriculum format.
${customTopicsString ? `User topics (respect these):\n${customTopicsString}` : 'Generate appropriate topics for all weeks following the legacy syllabus sequence.'}
Assessment weeks: ${assessmentWeeksList.join(', ')}

Return ONLY valid JSON with this OBC scheme structure:
{
  "weeks": [
    {
      "week": 1,
      "topics": [
        {
          "topic": "Topic name",
          "specificOutcome": "What learners should achieve",
          "methods": "Teaching methods",
          "aids": "Teaching aids",
          "references": "Reference books",
          "knowledge": "Knowledge gained",
          "skills": "Skills developed",
          "values": "Values adopted"
        }
      ],
      "assessment": null
    }
  ],
  "assessmentWeeks": [3, 6, 9, 12],
  "testTopics": ["Mid-term test", "End of term test"]
}
`;
      }

      const messages = [
        {
          role: "system",
          content: `
You are an expert curriculum planner for Zambian schools creating ${curriculumType.toUpperCase()} schemes of work.

The user will provide grade, subject, and term information.
Parse the information and output it in valid JSON format.

Syllabus selection is mandatory:
- NEW_2024_CBC: use the current 2024 Zambia Ministry of Education Competence-Based syllabus and CBC terminology.
- OLD_LEGACY_OBC: use the older/legacy Zambian syllabus and Objective-Based terminology; do not silently substitute the 2024 CBC sequence.
For CBC: Include topic, subtopic, specificCompetences, learningActivities, expectedStandards, resources, strategies, and reference.
For OBC: Include topic, specificOutcome, methods, aids, references, knowledge, skills, and values.

Return ONLY the JSON object, no other text.
`
        },
        {
          role: "user",
          content: prompt
        }
      ];

      aiContent = await generateDeepSeekJSON(messages, { 
        max_tokens: 4000,
        temperature: 0.1
      });
      
      console.log('✅ DeepSeek generated scheme successfully');

    } catch (error) {
      console.log('⚠️ DeepSeek error, using fallback:', error.message);
      useFallback = true;
    }
    
    if (!aiContent || useFallback) {
      console.log(`📝 Using ${curriculumType.toUpperCase()} fallback scheme generator`);
      if (curriculumType === 'cbc' && sourceRowsDetailed.length) {
        aiContent = {
          weeks: sourceRowsDetailed.map((row, index) => ({
            week: Number(row.week || index + 1),
            topics: [{
              topic: row.topic || '',
              subtopic: row.subTopic || row.subtopic || '',
              specificCompetence: row.specificCompetence || row.specificCompetences || '',
              methods: row.methods || row.strategies || '',
              aids: row.resources || row.aids || '',
              references: row.reference || row.references || 'Teacher-provided curriculum materials',
              knowledge: row.knowledge || '',
              skills: row.skills || '',
              values: row.values || ''
            }],
            isRevision: false,
            isAssessment: false
          })),
          assessmentWeeks: assessmentWeeksList,
          testTopics: testTopics || []
        };
      } else if (curriculumType === 'cbc') {
        aiContent = generateCBCScheme(grade, subject, term, user, customTopics);
      } else {
        aiContent = generateOBCScheme(grade, subject, term, user, customTopics);
      }
    }
    
    const weeks = (aiContent?.weeks || []).map(week => {
      if (curriculumType === 'cbc') {
        const topic = Array.isArray(week.topics) && week.topics.length > 0
          ? week.topics[0]
          : week;

        const weekNumber = Number(week.week);
        const forcedSubtopic = customSubtopics[weekNumber] || customSubtopics[String(weekNumber)] || '';
        const topicName = topic.topic || '';
        const competence = topic.specificCompetences ?? topic.specificCompetence ?? topic.competencies ?? '';
        const activities = topic.learningActivities ?? topic.activities ?? '';
        const standards = topic.expectedStandards ?? topic.expectedStandard ??
          (competence ? `Learners demonstrate the competence: ${Array.isArray(competence) ? competence.join('; ') : competence}.` : '');
        const resources = topic.resources ?? topic.aids ?? '';
        const strategies = topic.strategies ?? topic.methods ?? '';
        const reference = topic.reference ?? topic.references ?? '';
        const sourceMatch = sourceRowsDetailed.find((row) =>
          Number(row.week) === weekNumber ||
          (String(row.topic || '').trim().toLowerCase() && String(row.topic || '').trim().toLowerCase() === String(topicName || '').trim().toLowerCase())
        );
        const finalTopic = sourceMatch?.topic || topicName;
        const finalSubTopic = forcedSubtopic || sourceMatch?.subTopic || sourceMatch?.subtopic || topic.subTopic || topic.subtopic || '';
        const finalCompetence = sourceMatch?.specificCompetence || sourceMatch?.specificCompetences || competence;
        const finalActivities = sourceMatch?.learningActivities || activities;
        const finalStandards = sourceMatch?.expectedStandard || sourceMatch?.expectedStandards || standards;
        const finalResources = sourceMatch?.resources || sourceMatch?.aids || resources;
        const finalStrategies = sourceMatch?.strategies || sourceMatch?.methods || strategies;
        const officialReferenceText = getReferenceTitles({ subject, grade, term, context: curriculumContext }).join('; ');
        const aiReferenceIsGeneric = !reference || /teacher-provided curriculum materials/i.test(String(reference));
        const finalReference = sourceMatch?.reference || sourceMatch?.references ||
          (aiReferenceIsGeneric ? officialReferenceText : reference) ||
          'No verified official reference is loaded for this selection';

        return {
          week: weekNumber,
          topic: finalTopic,
          subTopic: finalSubTopic,
          specificCompetences: finalCompetence,
          learningActivities: finalActivities || (finalTopic ? [`Introduction and discussion of ${finalTopic}`, `Group/individual activities on ${finalTopic}`] : ''),
          expectedStandards: finalStandards,
          resources: finalResources,
          strategies: finalStrategies,
          reference: finalReference,
          isRevision: week.isRevision || false,
          isAssessment: week.isAssessment || false,
          // Keep nested data for compatibility with older saved scheme viewers.
          topics: Array.isArray(week.topics) ? week.topics : [topic]
        };
      }

      return {
        week: week.week,
        topics: (week.topics || []).map(topic => ({
          topic: topic.topic || '',
          subtopic: topic.subtopic || '',
          specificCompetence: topic.specificCompetence || topic.specificOutcome || '',
          specificOutcome: topic.specificOutcome || '',
          methods: topic.methods || '',
          aids: topic.aids || '',
          references: topic.references || '',
          knowledge: topic.knowledge || '',
          skills: topic.skills || '',
          values: topic.values || ''
        })),
        assessment: week.assessment || null,
        isRevision: week.isRevision || false,
        isAssessment: week.isAssessment || false
      };
    });
    if (subtopicsList.length > 0) {
      let weekIndex = 0;
      for (let i = 0; i < weeks.length; i++) {
        if (!assessmentWeeksList.includes(weeks[i].week) && !weeks[i].isRevision && !weeks[i].isAssessment) {
          if (weekIndex < subtopicsList.length && weeks[i].topics?.[0]) {
            const manualSubtopic = subtopicsList[weekIndex];
            // A user-entered subtopic must never replace the official topic.
            // It belongs in the Sub-topic column, while the verified topic,
            // competence and standard remain intact.
            if (curriculumType === 'cbc') {
              weeks[i].subTopic = manualSubtopic;
              weeks[i].topics[0].subtopic = manualSubtopic;
              if (!weeks[i].specificCompetences) {
                weeks[i].specificCompetences = `By the end of this lesson, learners will be able to understand and explain ${manualSubtopic}`;
              }
              if (!weeks[i].topics[0].specificCompetence) {
                weeks[i].topics[0].specificCompetence = weeks[i].specificCompetences;
              }
              if (!weeks[i].expectedStandards) {
                weeks[i].expectedStandards = `Learners explain and apply ${manualSubtopic} correctly.`;
              }
            } else {
              weeks[i].topics[0].subtopic = manualSubtopic;
              if (!weeks[i].topics[0].specificOutcome) {
                weeks[i].topics[0].specificOutcome = `By the end of this lesson, learners will be able to understand and explain ${manualSubtopic}`;
              }
            }
            weekIndex++;
          }
        }
      }
    }

    const generatedScheme = {
      grade: grade,
      subject: subject,
      term: term || 'Term 1',
      year: year || new Date().getFullYear().toString(),
      totalWeeks: totalWeeksCount,
      school: school || user.school || '',
      teacherName: user.fullName || '',
      subtopic: subtopic || '',
      weeks: weeks,
      assessmentWeeks: assessmentWeeksList,
      testTopics: testTopics || [`Mid-term test on ${subject}`, `End of term test on ${subject}`],
      curriculum: curriculumType,
      curriculumSourceStatus: sourcePacks.length ? 'VERIFIED_LOCAL_PACK_AVAILABLE' : 'NO_LOCAL_SOURCE',
      curriculumSources: sourcePacks,
      createdAt: new Date().toISOString()
    };

    const scheme = await prisma.scheme.create({
      data: {
        userId: req.userId,
        grade: grade,
        subject: subject,
        term: term || 'Term 1',
        year: year || new Date().getFullYear().toString(),
        totalWeeks: totalWeeksCount,
        weeks: weeks,
        assessmentWeeks: generatedScheme.assessmentWeeks,
        school: school || user.school || '',
        teacherName: user.fullName || '',
        subtopic: subtopic || '',
        testTopics: generatedScheme.testTopics,
        curriculum: curriculumType
      }
    });

    await prisma.user.update({
      where: { id: req.userId },
      data: { schemesUsed: user.schemesUsed + 1 }
    });

    console.log(`✅ ${curriculumType.toUpperCase()} scheme generated successfully`);
    res.status(201).json({
      ...generatedScheme,
      id: scheme.id,
      createdAt: scheme.createdAt
    });

  } catch (error) {
    console.error('❌ Scheme generation error:', error);
    res.status(500).json({
      error: 'Failed to generate scheme of work',
      details: error.message
    });
  }
});

// ============ SCHEME EXPORT ROUTES ============

function cbcListText(value) {
  if (Array.isArray(value)) return value.join('\n');
  return String(value ?? '');
}

function cbcExportRow(week) {
  return {
    week: String(week.week ?? ''),
    topic: String(week.topic ?? ''),
    subTopic: String(week.subTopic ?? week.subtopic ?? ''),
    specificCompetences: cbcListText(week.specificCompetences ?? week.specificCompetence ?? week.competencies ?? ''),
    learningActivities: cbcListText(week.learningActivities ?? week.activities ?? ''),
    expectedStandards: String(week.expectedStandards ?? week.expectedStandard ?? ''),
    resources: cbcListText(week.resources ?? week.aids ?? ''),
    strategies: cbcListText(week.strategies ?? week.methods ?? ''),
    reference: cbcListText(week.reference ?? week.references ?? 'Teacher-provided curriculum materials')
  };
}

function cbcCell(text, options = {}) {
  return new TableCell({
    width: { size: options.width || 100, type: WidthType.PERCENTAGE },
    children: [new Paragraph({
      alignment: options.align || AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: 180 },
      children: [new TextRun({
        text: String(text ?? ''),
        bold: !!options.bold,
        font: 'Times New Roman',
        size: options.size || 14
      })]
    })]
  });
}

app.get('/api/schemes/export/:id/word', authenticate, async (req, res) => {
  try {
    const scheme = await prisma.scheme.findUnique({ where: { id: req.params.id } });
    if (!scheme) return res.status(404).json({ error: 'Scheme not found' });
    if (scheme.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    if (String(scheme.curriculum || '').toLowerCase() === 'cbc') {
      const widths = [6, 11, 13, 15, 17, 13, 11, 13, 13];
      const headerNames = ['week','Topic','Sub- topic','Specific competences','Learning activities','Expected standards','T/L\nRESOURCES','STRATEGIES\nTECHNIQUES','REFERENCE'];
      const tableRows = [new TableRow({
        children: headerNames.map((h, i) => cbcCell(h, { bold: true, align: AlignmentType.CENTER, width: widths[i], size: 14 }))
      })];

      for (const week of (scheme.weeks || [])) {
        const r = cbcExportRow(week);
        tableRows.push(new TableRow({ children: [
          cbcCell(r.week, { align: AlignmentType.CENTER, width: widths[0] }),
          cbcCell(r.topic, { width: widths[1] }),
          cbcCell(r.subTopic, { width: widths[2] }),
          cbcCell(r.specificCompetences, { width: widths[3] }),
          cbcCell(r.learningActivities, { width: widths[4] }),
          cbcCell(r.expectedStandards, { width: widths[5] }),
          cbcCell(r.resources, { width: widths[6] }),
          cbcCell(r.strategies, { width: widths[7] }),
          cbcCell(r.reference, { width: widths[8] })
        ] }));
      }

      const doc = new Document({ sections: [{
        properties: {
          page: {
            size: { width: 16838, height: 11906, orientation: 'landscape' },
            margin: { top: 360, right: 360, bottom: 360, left: 360 }
          }
        },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: 'MINISTRY OF EDUCATION', font: 'Times New Roman', size: 22, bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: scheme.school || '', font: 'Times New Roman', size: 21, bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: 'DEPARTMENT OF NATURAL SCIENCES', font: 'Times New Roman', size: 21, bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: `SCHEMES OF WORK FOR ${String(scheme.subject || '').toUpperCase()}`, font: 'Times New Roman', size: 21, bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 100 }, children: [new TextRun({ text: `SUBJECT: ${String(scheme.subject || '').toUpperCase()}     FORM: ${scheme.grade || ''}     TERM: ${termWord(scheme.term)}     YEAR: ${scheme.year || new Date().getFullYear()}`, font: 'Times New Roman', size: 18, bold: true })] }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows })
        ]
      }] });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${scheme.subject}_Scheme_of_Work_Term_${scheme.term}.docx"`);
      return res.send(buffer);
    }

    const tableRows = [];

    const headerRow = new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: 'WEEK', bold: true })], width: { size: 5, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'TOPIC', bold: true })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'SUBTOPIC', bold: true })], width: { size: 15, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'SPECIFIC COMPETENCE', bold: true })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'METHODS', bold: true })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'AIDS', bold: true })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'REFERENCES', bold: true })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'KNOWLEDGE', bold: true })], width: { size: 5, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: 'SKILLS', bold: true })], width: { size: 5, type: WidthType.PERCENTAGE } }),
      ],
    });
    tableRows.push(headerRow);

    scheme.weeks.forEach(week => {
      const topics = week.topics || [];
      
      const topicText = topics.map(t => t.topic || '').join('\n');
      const subtopicText = topics.map(t => t.subtopic || '').join('\n');
      const competenceText = topics.map(t => t.specificCompetence || t.specificOutcome || '').join('\n');
      const methodsText = topics.map(t => t.methods || '').join('\n');
      const aidsText = topics.map(t => t.aids || '').join('\n');
      const refsText = topics.map(t => t.references || '').join('\n');
      const knowledgeText = topics.map(t => t.knowledge || '').join('\n');
      const skillsText = topics.map(t => t.skills || '').join('\n');
      const valuesText = topics.map(t => t.values || '').join('\n');

      const dataRow = new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: String(week.week) })] }),
          new TableCell({ children: [new Paragraph({ text: topicText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: subtopicText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: competenceText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: methodsText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: aidsText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: refsText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: knowledgeText || '-' })] }),
          new TableCell({ children: [new Paragraph({ text: skillsText || '-' })] }),
        ],
      });
      tableRows.push(dataRow);
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({ text: 'MINISTRY OF EDUCATION', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: 'SCHEME OF WORK', heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: `School: ${scheme.school || 'School Name'}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Subject: ${scheme.subject}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Grade: ${scheme.grade}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Term: ${scheme.term}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Year: ${scheme.year}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Curriculum: ${scheme.curriculum || 'CBC'}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: `Assessment Weeks: ${scheme.assessmentWeeks?.join(', ') || 'None'}`, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: '' }),
          new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '© 2026 mytoolbox - Made for teachers in Zambia', alignment: AlignmentType.CENTER }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="scheme_${scheme.id}.docx"`);
    res.send(buffer);

  } catch (error) {
    console.error('❌ Word export error:', error);
    return res.status(500).json({ error: 'Failed to export scheme as Word' });
  }
});

app.get('/api/schemes/export/:id/pdf', authenticate, async (req, res) => {
  try {
    const scheme = await prisma.scheme.findUnique({ where: { id: req.params.id } });
    if (!scheme) return res.status(404).json({ error: 'Scheme not found' });
    if (scheme.userId !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    if (String(scheme.curriculum || '').toLowerCase() === 'cbc') {
      const doc = new PDFDocument({ margin: 22, size: 'A3', layout: 'landscape' });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => res.send(Buffer.concat(chunks)));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${scheme.subject}_Scheme_of_Work_Term_${scheme.term}.pdf"`);

      doc.font('Helvetica-Bold').fontSize(15).text('MINISTRY OF EDUCATION', { align: 'center' });
      doc.fontSize(14).text(scheme.school || '', { align: 'center' });
      doc.fontSize(14).text('DEPARTMENT OF NATURAL SCIENCES', { align: 'center' });
      doc.fontSize(14).text(`SCHEMES OF WORK FOR ${String(scheme.subject || '').toUpperCase()}`, { align: 'center' });
      doc.fontSize(11).text(`SUBJECT: ${String(scheme.subject || '').toUpperCase()}     FORM: ${scheme.grade || ''}     TERM: ${termWord(scheme.term)}     YEAR: ${scheme.year || new Date().getFullYear()}`, { align: 'center' });
      doc.moveDown(0.6);

      const headers = ['week','Topic','Sub- topic','Specific competences','Learning activities','Expected standards','T/L RESOURCES','STRATEGIES / TECHNIQUES','REFERENCE'];
      const baseWidths = [35, 80, 90, 125, 145, 110, 95, 110, 115];
      const usable = doc.page.width - 44;
      const scale = usable / baseWidths.reduce((a,b) => a + b, 0);
      const widths = baseWidths.map(w => w * scale);
      const startX = 22;
      let y = doc.y;

      const drawCell = (x, yy, w, h, text, bold = false, align = 'left') => {
        doc.rect(x, yy, w, h).stroke();
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.4).text(String(text || ''), x + 3, yy + 3, { width: w - 6, height: h - 6, align, ellipsis: true });
      };

      let x = startX;
      headers.forEach((h, i) => { drawCell(x, y, widths[i], 28, h, true, 'center'); x += widths[i]; });
      y += 28;

      for (const week of (scheme.weeks || [])) {
        const r = cbcExportRow(week);
        const vals = [r.week, r.topic, r.subTopic, r.specificCompetences, r.learningActivities, r.expectedStandards, r.resources, r.strategies, r.reference];
        const heights = vals.map((v, i) => Math.ceil(String(v || '').length / Math.max(12, Math.floor(widths[i] / 4.1))) * 7 + 10);
        const h = Math.max(26, Math.min(160, Math.max(...heights)));
        x = startX;
        vals.forEach((v, i) => { drawCell(x, y, widths[i], h, v, false, i === 0 ? 'center' : 'left'); x += widths[i]; });
        y += h;
        if (y > doc.page.height - 45) {
          doc.addPage();
          y = 25;
          x = startX;
          headers.forEach((h2, i) => { drawCell(x, y, widths[i], 28, h2, true, 'center'); x += widths[i]; });
          y += 28;
        }
      }
      doc.end();
      return;
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="scheme_${scheme.id}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).text('MINISTRY OF EDUCATION', { align: 'center' });
    doc.fontSize(14).text('SCHEME OF WORK', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`School: ${scheme.school || 'School Name'}`, { align: 'center' });
    doc.text(`Subject: ${scheme.subject}`, { align: 'center' });
    doc.text(`Grade: ${scheme.grade}`, { align: 'center' });
    doc.text(`Term: ${scheme.term}`, { align: 'center' });
    doc.text(`Year: ${scheme.year}`, { align: 'center' });
    doc.text(`Curriculum: ${scheme.curriculum || 'CBC'}`, { align: 'center' });
    doc.text(`Assessment Weeks: ${scheme.assessmentWeeks?.join(', ') || 'None'}`, { align: 'center' });
    doc.moveDown();

    const tableTop = doc.y;
    const columnWidths = [30, 50, 50, 60, 40, 40, 40, 30, 30];
    const headers = ['WK', 'TOPIC', 'SUBTOPIC', 'SPECIFIC COMPETENCE', 'METHODS', 'AIDS', 'REFERENCES', 'KNOWLEDGE', 'SKILLS'];
    
    let x = 50;
    let y = tableTop;
    
    doc.rect(50, y - 5, 495, 25).fill('#e0e0e0');
    doc.fillColor('black');
    
    headers.forEach((header, i) => {
      doc.fontSize(8).text(header, x, y, { width: columnWidths[i], align: 'center' });
      x += columnWidths[i];
    });
    
    y += 25;
    
    scheme.weeks.forEach(week => {
      const topics = week.topics || [];
      const topicText = topics.map(t => t.topic || '').join('\n');
      const subtopicText = topics.map(t => t.subtopic || '').join('\n');
      const competenceText = topics.map(t => t.specificCompetence || t.specificOutcome || '').join('\n');
      const methodsText = topics.map(t => t.methods || '').join('\n');
      const aidsText = topics.map(t => t.aids || '').join('\n');
      const refsText = topics.map(t => t.references || '').join('\n');
      const knowledgeText = topics.map(t => t.knowledge || '').join('\n');
      const skillsText = topics.map(t => t.skills || '').join('\n');
      const valuesText = topics.map(t => t.values || '').join('\n');
      
      const rowData = [
        String(week.week),
        topicText || '-',
        subtopicText || '-',
        competenceText || '-',
        methodsText || '-',
        aidsText || '-',
        refsText || '-',
        knowledgeText || '-',
        skillsText || '-'
      ];
      
      let maxHeight = 20;
      rowData.forEach((text, i) => {
        doc.fontSize(7).text(text, 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y, {
          width: columnWidths[i],
          align: 'left',
          ellipsis: true,
        });
        const height = doc.heightOfString(text, { width: columnWidths[i] });
        if (height > maxHeight) maxHeight = height;
      });
      
      let currentX = 50;
      rowData.forEach((text, i) => {
        doc.rect(currentX, y, columnWidths[i], maxHeight + 5).stroke();
        currentX += columnWidths[i];
      });
      
      y += maxHeight + 10;
      
      if (y > 750) {
        doc.addPage();
        y = 50;
      }
    });
    
    doc.moveDown();
    doc.fontSize(10).text('© 2026 mytoolbox - Made for teachers in Zambia', { align: 'center' });
    
    doc.end();

  } catch (error) {
    console.error('❌ PDF export error:', error);
    return res.status(500).json({ error: 'Failed to export scheme as PDF' });
  }
});

// ============ NOTES ROUTES ============

app.get('/api/notes', authenticate, async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

app.get('/api/notes/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const note = await prisma.note.findUnique({
      where: { id: id },
    });
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    if (note.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    res.json(note);
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

app.post('/api/notes', authenticate, async (req, res) => {
  try {
    const { title, content, subject, grade } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    const note = await prisma.note.create({
      data: {
        userId: req.userId,
        title,
        content,
        subject,
        grade,
      }
    });
    res.status(201).json(note);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

app.put('/api/notes/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, subject, grade } = req.body;
    const existingNote = await prisma.note.findUnique({
      where: { id: id },
    });
    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found' });
    }
    if (existingNote.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const note = await prisma.note.update({
      where: { id: id },
      data: { title, content, subject, grade },
    });
    res.json(note);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

app.delete('/api/notes/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const existingNote = await prisma.note.findUnique({
      where: { id: id },
    });
    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found' });
    }
    if (existingNote.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    await prisma.note.delete({
      where: { id: id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ============ ASSESSMENTS ROUTES ============

// Generate a topic-specific assessment with DeepSeek. Falls back to a
// deterministic Zambia-school-friendly set if AI is unavailable or malformed.
app.post('/api/assessments/generate', authenticate, async (req, res) => {
  try {
    const { title, type = 'test', subject, grade, topic, description = '' } = req.body || {};
    if (!title || !subject || !grade || !topic) {
      return res.status(400).json({ error: 'Title, subject, grade and topic are required.' });
    }

    const fallback = [
      { id: 'q1', type: 'multiple-choice', question: `Which statement best describes ${topic} in ${subject}?`, options: [`A correct definition or principle of ${topic}`, `An unrelated concept`, `A historical date only`, `A laboratory safety rule only`], answer: `A correct definition or principle of ${topic}`, marks: 2 },
      { id: 'q2', type: 'multiple-choice', question: `Which example correctly demonstrates ${topic}?`, options: [`A relevant example of ${topic}`, `An unrelated example`, `A contradiction of ${topic}`, `None of the above`], answer: `A relevant example of ${topic}`, marks: 2 },
      { id: 'q3', type: 'short-answer', question: `Define ${topic} and give two important points about it.`, answer: `A correct definition plus two relevant points about ${topic}.`, marks: 4 },
      { id: 'q4', type: 'short-answer', question: `Explain how ${topic} applies to a practical or everyday situation.`, answer: `A clear topic-specific explanation with a relevant example.`, marks: 5 },
      { id: 'q5', type: 'essay', question: `Discuss ${topic}. Include key concepts, examples and its importance in ${subject}.`, answer: `Award marks for accurate concepts, examples, explanation and relevance.`, marks: 7 }
    ];

    const prompt = `Create a ${type} assessment for a Zambian school. Return ONLY valid JSON, no markdown.\n` +
      `Subject: ${subject}\nGrade/Form: ${grade}\nSpecific topic: ${topic}\nTitle: ${title}\n` +
      `Instructions/context: ${description || 'Use the stated topic only.'}\n` +
      `Return exactly: {"description":"...","questions":[{"id":"q1","type":"multiple-choice|short-answer|essay","question":"...","options":["..."],"answer":"...","marks":2}]}\n` +
      `Create 5-10 questions. Questions MUST be specifically about ${topic}, not generic ${subject}. Include a mixture of question types. Use realistic school-level content. For multiple-choice use exactly four options. Include concise marking answers. Ensure the JSON is syntactically valid.`;

    let generated = null;
    try {
      generated = await generateDeepSeekJSON([
        { role: 'system', content: 'You are an expert Zambian secondary-school assessment setter. Output strict JSON only.' },
        { role: 'user', content: prompt }
      ], { max_tokens: 5000, temperature: 0.2 });
    } catch (aiError) {
      console.error('Assessment AI generation failed:', aiError?.message || aiError);
    }

    const questions = Array.isArray(generated?.questions) && generated.questions.length
      ? generated.questions.map((q, i) => ({
          id: q.id || `q${i + 1}`,
          type: ['multiple-choice', 'short-answer', 'essay'].includes(q.type) ? q.type : 'short-answer',
          question: String(q.question || `Explain ${topic}.`),
          options: q.type === 'multiple-choice' ? (Array.isArray(q.options) ? q.options.slice(0, 4) : fallback[0].options) : undefined,
          answer: String(q.answer || ''),
          marks: Math.max(1, Number(q.marks) || 5)
        }))
      : fallback;

    res.json({
      title,
      type,
      subject,
      grade,
      topic,
      description: generated?.description || description || `Assessment on ${topic}`,
      questions,
      maxScore: questions.reduce((sum, q) => sum + q.marks, 0),
      source: generated ? 'deepseek' : 'fallback'
    });
  } catch (error) {
    console.error('Assessment generation error:', error);
    res.status(500).json({ error: 'Failed to generate assessment.' });
  }
});

app.get('/api/assessments', authenticate, async (req, res) => {
  try {
    const assessments = await prisma.assessment.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json(assessments);
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
});

app.get('/api/assessments/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const assessment = await prisma.assessment.findUnique({
      where: { id: id },
    });
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (assessment.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    res.json(assessment);
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
});

app.post('/api/assessments', authenticate, async (req, res) => {
  try {
    const { title, type, subject, grade, description, questions, maxScore } = req.body;
    if (!title || !type) {
      return res.status(400).json({ error: 'Title and type are required' });
    }
    const assessment = await prisma.assessment.create({
      data: {
        userId: req.userId,
        title,
        type,
        subject,
        grade,
        description,
        questions: questions || [],
        maxScore: maxScore || 0,
      }
    });
    res.status(201).json(assessment);
  } catch (error) {
    console.error('Error creating assessment:', error);
    res.status(500).json({ error: 'Failed to create assessment' });
  }
});

app.post('/api/assessments/:id/submit', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { score, answers } = req.body;
    const existingAssessment = await prisma.assessment.findUnique({
      where: { id: id },
    });
    if (!existingAssessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (existingAssessment.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const assessment = await prisma.assessment.update({
      where: { id: id },
      data: {
        score: score || 0,
        questions: answers || existingAssessment.questions,
        completedAt: new Date(),
      }
    });
    res.json(assessment);
  } catch (error) {
    console.error('Error submitting assessment:', error);
    res.status(500).json({ error: 'Failed to submit assessment' });
  }
});

app.delete('/api/assessments/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const existingAssessment = await prisma.assessment.findUnique({
      where: { id: id },
    });
    if (!existingAssessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (existingAssessment.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    await prisma.assessment.delete({
      where: { id: id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting assessment:', error);
    res.status(500).json({ error: 'Failed to delete assessment' });
  }
});

// ============ MANUAL PAYMENT ROUTES ============
const PLAN_CONFIG = {
  PRO: { amount: 150, role: 'PRO', schemesLimit: 100, lessonsLimit: 1000 },
  SCHOOL: { amount: 500, role: 'SCHOOL', schemesLimit: 1000, lessonsLimit: 10000 },
};

function normalizePlan(plan) {
  const value = String(plan || '').trim().toUpperCase();
  return PLAN_CONFIG[value] ? value : null;
}

function normalizeZambianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (/^260\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `260${digits.slice(1)}`;
  throw new Error('Invalid Zambian phone number. Use 0XXXXXXXXX or 260XXXXXXXXX.');
}

function createManualReference() {
  return `MT-MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function applySuccessfulPayment(payment) {
  const config = PLAN_CONFIG[payment.plan] || PLAN_CONFIG.PRO;
  await prisma.payment.update({
    where: { referenceId: payment.referenceId },
    data: { status: 'completed', completedAt: new Date() }
  });
  await prisma.user.update({
    where: { id: payment.userId },
    data: {
      role: config.role,
      schemesLimit: config.schemesLimit,
      lessonsLimit: config.lessonsLimit,
      subscriptionEndsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    }
  });
}

// Teacher submits a payment notification after paying directly to your mobile-money number.
app.post('/api/payments/manual', authenticate, async (req, res) => {
  try {
    const { plan, phoneNumber, provider, transactionReference } = req.body;
    const normalizedPlan = normalizePlan(plan);
    if (!normalizedPlan) return res.status(400).json({ error: 'Invalid plan. Choose PRO or SCHOOL.' });

    const config = PLAN_CONFIG[normalizedPlan];
    let cleanPhone = '';
    try { cleanPhone = normalizeZambianPhone(phoneNumber); }
    catch (error) { return res.status(400).json({ error: error.message }); }

    const cleanProvider = String(provider || '').trim().toUpperCase();
    if (!['MTN', 'AIRTEL', 'ZAMTEL'].includes(cleanProvider)) {
      return res.status(400).json({ error: 'Choose MTN, Airtel or Zamtel.' });
    }

    const txRef = String(transactionReference || '').trim();
    if (!txRef || txRef.length < 3) {
      return res.status(400).json({ error: 'Enter the transaction/reference number from your mobile-money payment.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const duplicate = await prisma.payment.findFirst({ where: { externalId: txRef } });
    if (duplicate) return res.status(409).json({ error: 'That transaction reference has already been submitted.' });

    const referenceId = createManualReference();
    const transactionId = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const payment = await prisma.payment.create({
      data: {
        userId: req.userId,
        referenceId,
        transactionId,
        amount: config.amount,
        currency: 'ZMW',
        provider: cleanProvider.toLowerCase(),
        phoneNumber: cleanPhone,
        status: 'pending',
        externalId: txRef,
        plan: normalizedPlan,
      },
    });

    return res.status(201).json({
      success: true,
      paymentId: payment.id,
      referenceId,
      status: 'pending',
      amount: config.amount,
      plan: normalizedPlan,
      message: 'Payment notification received. We will verify your payment and activate your plan.',
    });
  } catch (error) {
    console.error('Manual payment submission error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to submit payment.' });
  }
});

app.get('/api/payments/history', authenticate, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// ============ ADMIN ROUTES (FIXED) ============

const isAdmin = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true }
    });
    
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Manual payment verification: admin checks the transaction in the mobile-money account
// and approves or rejects the teacher's request.
app.get('/api/admin/payments/pending', authenticate, isAdmin, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { user: { select: { fullName: true, email: true, school: true, phone: true } } },
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching pending payments:', error);
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
});

app.post('/api/admin/payments/:id/approve', authenticate, isAdmin, async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status === 'completed') return res.json({ success: true, message: 'Payment is already approved.' });
    if (payment.status !== 'pending') return res.status(400).json({ error: `Payment is already ${payment.status}.` });

    await applySuccessfulPayment(payment);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    res.json({ success: true, payment: updated, message: 'Payment approved and subscription activated for 90 days.' });
  } catch (error) {
    console.error('Error approving payment:', error);
    res.status(500).json({ error: error?.message || 'Failed to approve payment.' });
  }
});

app.post('/api/admin/payments/:id/reject', authenticate, isAdmin, async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status !== 'pending') return res.status(400).json({ error: `Payment is already ${payment.status}.` });

    const updated = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
    res.json({ success: true, payment: updated, message: 'Payment request rejected.' });
  } catch (error) {
    console.error('Error rejecting payment:', error);
    res.status(500).json({ error: error?.message || 'Failed to reject payment.' });
  }
});

// Admin Stats
app.get('/api/admin/stats', authenticate, isAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const activeSince = new Date(now.getTime() - 15 * 60 * 1000);

    const [
      totalUsers, totalLessons, totalSchemes, totalPayments,
      newUsersToday, lessonsToday, schemesToday, paymentsToday,
      completedRevenue, pendingModeration, activeUsers, proPayments, schoolPayments
    ] = await Promise.all([
      prisma.user.count(),
      prisma.lesson.count(),
      prisma.scheme.count(),
      prisma.payment.count(),
      prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.lesson.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.scheme.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.payment.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.payment.aggregate({ where: { status: 'completed' }, _sum: { amount: true } }),
      Promise.resolve(0),
      prisma.user.count({ where: { lastActive: { gte: activeSince } } }).catch(() => 0),
      prisma.payment.count({ where: { status: 'completed', plan: 'PRO' } }).catch(() => 0),
      prisma.payment.count({ where: { status: 'completed', plan: 'SCHOOL' } }).catch(() => 0)
    ]);

    res.json({
      stats: {
        totalUsers,
        totalLessons,
        totalSchemes,
        totalPayments,
        revenue: Number(completedRevenue?._sum?.amount || 0),
        totalRevenue: Number(completedRevenue?._sum?.amount || 0),
        newUsersToday,
        lessonsToday,
        schemesToday,
        paymentsToday,
        activeUsers,
        pendingModeration,
        systemHealth: 'Operational',
        uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
        proPayments,
        schoolPayments
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to load administrator statistics.' });
  }
});

// Admin Users (basic)
app.get('/api/admin/users', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        school: true,
        province: true,
        district: true,
        role: true,
        lessonsUsed: true,
        lessonsLimit: true,
        schemesUsed: true,
        schemesLimit: true,
        createdAt: true,
        subscriptionEndsAt: true
      }
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin Detailed Users - FIXED (Simplified, no _count issues)
app.get('/api/admin/users/detailed', authenticate, isAdmin, async (req, res) => {
  try {
    console.log('📊 Fetching detailed users...');
    
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        school: true,
        province: true,
        district: true,
        role: true,
        lessonsUsed: true,
        lessonsLimit: true,
        schemesUsed: true,
        schemesLimit: true,
        createdAt: true,
        subscriptionEndsAt: true,
        lastActive: true
      }
    });

    const formattedUsers = users.map(user => ({
      id: String(user.id || ''),
      fullName: String(user.fullName || ''),
      email: String(user.email || ''),
      school: String(user.school || ''),
      province: String(user.province || ''),
      district: String(user.district || ''),
      role: String(user.role || 'FREE'),
      lessonsUsed: Number(user.lessonsUsed || 0),
      lessonsLimit: Number(user.lessonsLimit || 5),
      schemesUsed: Number(user.schemesUsed || 0),
      schemesLimit: Number(user.schemesLimit || 3),
      createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
      subscriptionEndsAt: user.subscriptionEndsAt ? user.subscriptionEndsAt.toISOString() : null,
      lastActive: user.lastActive ? user.lastActive.toISOString() : new Date().toISOString(),
      // These are the fields the frontend expects for toLocaleString
      totalLessons: Number(0),
      totalSchemes: Number(0),
      totalPayments: Number(0),
      totalNotes: Number(0),
      totalAssessments: Number(0),
      lessons: Number(user.lessonsUsed || 0),
      schemes: Number(user.schemesUsed || 0),
      payments: Number(0),
      notes: Number(0),
      assessments: Number(0)
    }));

    console.log(`✅ Found ${formattedUsers.length} users`);
    
    res.json({
      success: true,
      users: formattedUsers,
      total: formattedUsers.length
    });

  } catch (error) {
    console.error('❌ Error fetching detailed users:', error);
    res.json({
      success: false,
      users: [],
      total: 0,
      error: error.message
    });
  }
});

// Admin User Stats
app.get('/api/admin/users/:id/stats', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        school: true,
        province: true,
        district: true,
        role: true,
        lessonsUsed: true,
        lessonsLimit: true,
        schemesUsed: true,
        schemesLimit: true,
        createdAt: true,
        subscriptionEndsAt: true,
        lastActive: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const recentLessons = await prisma.lesson.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        topic: true,
        subject: true,
        grade: true,
        createdAt: true
      }
    }).catch(() => []);

    const recentPayments = await prisma.payment.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        plan: true
      }
    }).catch(() => []);

    const recentSchemes = await prisma.scheme.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        subject: true,
        grade: true,
        term: true,
        createdAt: true
      }
    }).catch(() => []);

    res.json({
      user: {
        ...user,
        _count: undefined
      },
      stats: {
        totalLessons: Number(user.lessonsUsed || 0),
        totalSchemes: Number(user.schemesUsed || 0),
        totalPayments: Number(0),
        totalNotes: Number(0),
        totalAssessments: Number(0)
      },
      recentLessons: recentLessons.map(l => ({
        id: String(l.id || ''),
        topic: String(l.topic || ''),
        subject: String(l.subject || ''),
        grade: String(l.grade || ''),
        createdAt: l.createdAt ? l.createdAt.toISOString() : new Date().toISOString()
      })),
      recentPayments: recentPayments.map(p => ({
        id: String(p.id || ''),
        amount: Number(p.amount || 0),
        status: String(p.status || 'pending'),
        createdAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(),
        plan: String(p.plan || 'PRO')
      })),
      recentSchemes: recentSchemes.map(s => ({
        id: String(s.id || ''),
        subject: String(s.subject || ''),
        grade: String(s.grade || ''),
        term: String(s.term || ''),
        createdAt: s.createdAt ? s.createdAt.toISOString() : new Date().toISOString()
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching user stats:', error);
    res.status(500).json({
      error: 'Failed to fetch user statistics',
      details: error.message
    });
  }
});

// Admin System Stats - FIXED (Simplified)
app.get('/api/admin/system/stats', authenticate, isAdmin, async (req, res) => {
  try {
    console.log('📊 Fetching system stats...');
    
    // Get all counts with guaranteed numbers
    const totalUsers = Number(await prisma.user.count().catch(() => 0));
    const totalLessons = Number(await prisma.lesson.count().catch(() => 0));
    const totalSchemes = Number(await prisma.scheme.count().catch(() => 0));
    const totalPayments = Number(await prisma.payment.count().catch(() => 0));
    const totalNotes = Number(await prisma.note.count().catch(() => 0));
    const totalAssessments = Number(await prisma.assessment.count().catch(() => 0));
    
    // Get revenue
    const revenueResult = await prisma.payment.aggregate({
      where: { status: 'completed' },
      _sum: { amount: true }
    }).catch(() => ({ _sum: { amount: 0 } }));
    const totalRevenue = Number(revenueResult?._sum?.amount || 0);
    
    // Get role counts
    const freeUsers = Number(await prisma.user.count({ where: { role: 'FREE' } }).catch(() => 0));
    const proUsers = Number(await prisma.user.count({ where: { role: 'PRO' } }).catch(() => 0));
    const schoolUsers = Number(await prisma.user.count({ where: { role: 'SCHOOL' } }).catch(() => 0));
    const adminUsers = Number(await prisma.user.count({ where: { role: 'ADMIN' } }).catch(() => 0));
    
    // Get new users last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsersLast30Days = Number(await prisma.user.count({
      where: { createdAt: { gte: thirtyDaysAgo } }
    }).catch(() => 0));

    // Get recent users
    const recentUsers = await prisma.user.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        school: true,
        role: true,
        createdAt: true,
        lessonsUsed: true,
        schemesUsed: true
      }
    }).catch(() => []);

    const formattedRecentUsers = recentUsers.map(user => ({
      id: String(user.id || ''),
      fullName: String(user.fullName || ''),
      email: String(user.email || ''),
      school: String(user.school || ''),
      role: String(user.role || 'FREE'),
      createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
      lessonsUsed: Number(user.lessonsUsed || 0),
      schemesUsed: Number(user.schemesUsed || 0)
    }));

    // Return response with ALL numeric fields as numbers
    const response = {
      totals: {
        users: totalUsers,
        lessons: totalLessons,
        schemes: totalSchemes,
        payments: totalPayments,
        notes: totalNotes,
        assessments: totalAssessments,
        revenue: totalRevenue
      },
      growth: {
        newUsersLast30Days: newUsersLast30Days
      },
      subscriptions: {
        free: freeUsers,
        pro: proUsers,
        school: schoolUsers,
        admin: adminUsers
      },
      recent: {
        users: formattedRecentUsers,
        lessons: [],
        payments: []
      }
    };

    console.log('📊 System stats response sent successfully');
    res.json(response);

  } catch (error) {
    console.error('❌ Error fetching system stats:', error);
    // Always return a valid response with all numeric fields
    res.json({
      totals: { users: 0, lessons: 0, schemes: 0, payments: 0, notes: 0, assessments: 0, revenue: 0 },
      growth: { newUsersLast30Days: 0 },
      subscriptions: { free: 0, pro: 0, school: 0, admin: 0 },
      recent: { users: [], lessons: [], payments: [] }
    });
  }
});

// Admin Update User Role
app.put('/api/admin/users/:id/role', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['FREE', 'PRO', 'SCHOOL', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be FREE, PRO, SCHOOL, or ADMIN' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, fullName: true, email: true, role: true }
    });

    res.json(user);
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Admin Lessons
app.get('/api/admin/lessons', authenticate, isAdmin, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            school: true
          }
        }
      }
    });
    res.json(lessons);
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Admin Schemes
app.get('/api/admin/schemes', authenticate, isAdmin, async (req, res) => {
  try {
    const schemes = await prisma.scheme.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            school: true
          }
        }
      }
    });
    res.json(schemes);
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ error: 'Failed to fetch schemes' });
  }
});

// Admin Payments
app.get('/api/admin/payments', authenticate, isAdmin, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            fullName: true,
            email: true
          }
        }
      }
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Admin Delete User
app.delete('/api/admin/users/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id === req.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.user.delete({
      where: { id }
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Admin System Health Check
app.get('/api/admin/health', authenticate, isAdmin, async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    let deepseekStatus = 'unknown';
    try {
      await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5
      });
      deepseekStatus = 'healthy';
    } catch (error) {
      deepseekStatus = 'unhealthy';
    }

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: 'connected',
        deepseek: deepseekStatus,
        manualPayments: 'enabled'
      },
      memory: process.memoryUsage(),
      version: process.version
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// ============ GET ROUTES ============

app.get('/api/lessons', authenticate, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json(lessons);
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

app.get('/api/lessons/mine', authenticate, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json(lessons);
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

app.get('/api/schemes', authenticate, async (req, res) => {
  try {
    const schemes = await prisma.scheme.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    res.json(schemes);
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ error: 'Failed to fetch schemes' });
  }
});

app.get('/api/schemes/mine', authenticate, async (req, res) => {
  try {
    const schemes = await prisma.scheme.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    res.json(schemes);
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ error: 'Failed to fetch schemes' });
  }
});

// ============ CURRICULUM CATALOG API ============
app.get('/api/curriculum/subjects', (req, res) => {
  try {
    const curriculum = String(req.query.curriculum || 'cbc').toLowerCase();
    const grade = String(req.query.grade || '');
    const term = String(req.query.term || '');
    const localSources = listCurriculumSources({ curriculum, grade, term });
    const catalog = catalogSubjects();
    const subjects = [...new Set([...catalog, ...localSources.map((s) => s.subject).filter(Boolean)])].sort();
    const sourceBySubject = {};
    for (const source of localSources) sourceBySubject[source.subject] = true;
    if (curriculum === 'cbc') {
      for (const subject of subjects) {
        if (getRegisteredOfficialSource(subject)) sourceBySubject[subject] = true;
      }
    }
    res.json({
      curriculum, grade, term, subjects,
      sources: localSources,
      sourceAvailability: Object.fromEntries(subjects.map((s) => [s, Boolean(sourceBySubject[s])]))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load curriculum subjects' });
  }
});

app.get('/api/curriculum/topics', (req, res) => {
  try {
    const curriculum = String(req.query.curriculum || 'cbc').toLowerCase();
    const grade = String(req.query.grade || '');
    const subject = String(req.query.subject || '');
    const term = String(req.query.term || '');
    const sources = listCurriculumSources({ curriculum, grade, subject, term });
    const rows = listCurriculumRows({ curriculum, grade, subject, term });
    const topics = [...new Set(rows.map((r) => r.topic).filter(Boolean))];
    const subtopics = [...new Set(rows.map((r) => r.subTopic || r.subtopic).filter(Boolean))];
    res.json({ curriculum, grade, subject, term, hasLocalSource: sources.length > 0, topics, subtopics, rows, sources });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load curriculum topics' });
  }
});

app.get('/api/curriculum/status', (req, res) => {
  try {
    const curriculum = String(req.query.curriculum || 'cbc').toLowerCase();
    const grade = String(req.query.grade || '');
    const subject = String(req.query.subject || '');
    const term = String(req.query.term || '');
    const sources = listCurriculumSources({ curriculum, grade, subject, term });
    const officialSource = curriculum === 'cbc' ? getRegisteredOfficialSource(subject) : null;
    res.json({
      curriculum, grade, subject, term,
      status: sources.length ? 'VERIFIED_LOCAL_PACK_AVAILABLE' : (officialSource ? 'OFFICIAL_SOURCE_REGISTERED_NO_LOCAL_PACK' : (curriculum === 'obc' ? 'OBC_MODE' : 'NO_LOCAL_SOURCE')),
      sources,
      officialSource: officialSource || null,
      references: curriculum === 'cbc' ? getReferenceTitles({ subject, grade, term }) : []
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load curriculum status' });
  }
});

// ============ START SERVER ============
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Auth routes available at /api/auth/*`);
  console.log(`✅ Lesson generation available at /api/lessons/generate`);
  console.log(`✅ Scheme generation available at /api/schemes/generate`);
  console.log(`✅ Scheme export available at /api/schemes/export/:id/:format`);
  console.log(`✅ Notes routes available at /api/notes`);
  console.log(`✅ Assessments routes available at /api/assessments`);
  console.log(`✅ Payment routes available at /api/payments/*`);
  console.log(`✅ Admin routes available at /api/admin/*`);
  console.log(`✅ Get lessons at /api/lessons`);
  console.log(`✅ Get schemes at /api/schemes`);
  console.log(`✅ Get lessons (alias) at /api/lessons/mine`);
  console.log(`✅ Get schemes (alias) at /api/schemes/mine`);
  console.log(`✅ DeepSeek AI integration enabled`);
  console.log(`✅ Manual payment verification enabled`);
  console.log(`✅ CORS enabled for Vercel and Render frontend`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  prisma.$disconnect();
  process.exit(0);
});
