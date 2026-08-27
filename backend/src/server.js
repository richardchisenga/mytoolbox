// src/server.js - Complete application with DeepSeek AI integration, Lipila payments, Notes, Assessments, Admin routes, and Export routes
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');
const axios = require('axios');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType } = require('docx');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

// ============ DEEPSEEK AI CLIENT ============
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com"
});

// ============ LIPILA PAYMENT SERVICE ============
class LipilaService {
  constructor() {
    this.apiKey = process.env.LIPILA_API_KEY || process.env.LIPIJA_API_KEY;
    const isSandbox = this.apiKey?.startsWith('lsk_');
    this.baseURL = isSandbox 
      ? 'https://sandbox.lipila.com' 
      : 'https://api.lipila.com';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async createCollection({ referenceId, amount, accountNumber, currency = 'ZMW', callbackUrl }) {
    try {
      const response = await this.client.post('/api/v1/collections', {
        referenceId,
        amount,
        accountNumber,
        currency,
        callbackUrl,
      });
      return response.data;
    } catch (error) {
      console.error('Lipila collection error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Payment initiation failed');
    }
  }

  async getTransactionStatus(referenceId) {
    try {
      const response = await this.client.get(`/api/v1/transactions/${referenceId}/status`);
      return response.data;
    } catch (error) {
      console.error('Status check error:', error.response?.data || error.message);
      throw new Error('Failed to check transaction status');
    }
  }

  async getBalance() {
    try {
      const response = await this.client.get('/api/v1/balance');
      return response.data;
    } catch (error) {
      console.error('Balance check error:', error.response?.data || error.message);
      throw new Error('Failed to get balance');
    }
  }
}

const lipilaService = new LipilaService();

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
app.use(helmet());
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

      const maxTokens = options.max_tokens || 3000;
      
      const response = await deepseek.chat.completions.create({
        model: options.model || 'deepseek-chat',
        messages,
        temperature: options.temperature || 0.1,
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
  
  // Calculus - Differentiation
  if (topicLower.includes('calculus') || topicLower.includes('differentiation')) {
    return [
      {
        content: `INTRODUCTION TO DIFFERENTIATION\n\nDifferentiation is the process of finding the rate at which a quantity changes. It is a fundamental concept in calculus.\n\nKEY CONCEPTS:\n- Differentiation finds the gradient of a curve at any point\n- The derivative represents the rate of change\n- Notation: dy/dx = f'(x)\n\nRULES OF DIFFERENTIATION:\n- Power Rule: d/dx(xⁿ) = nxⁿ⁻¹\n- Constant Rule: d/dx(c) = 0\n- Sum Rule: d/dx(f+g) = f' + g'`,
        teacherActivity: "Teacher writes the definition and rules on the board. Teacher explains the concept of rate of change with real-life examples. Teacher demonstrates the power rule with examples.",
        pupilActivity: "Learners to write the notes in their exercise books. Learners to listen attentively and ask questions. Learners to identify the derivative of simple functions.",
        methods: "Teacher Exposition, Demonstration, Question and Answer"
      },
      {
        content: `WORKED EXAMPLES\n\nEXAMPLE 1: Power Rule\nDifferentiate y = x³\nSolution:\ndy/dx = 3x²\n\nEXAMPLE 2: Power Rule with Coefficient\nDifferentiate y = 5x⁴\nSolution:\ndy/dx = 5 × 4x³ = 20x³\n\nEXAMPLE 3: Sum Rule\nDifferentiate y = x² + 3x\nSolution:\ndy/dx = 2x + 3\n\nEXAMPLE 4: Finding Gradient\nFind the gradient of y = x² at x = 3\nSolution:\ndy/dx = 2x\nAt x = 3, dy/dx = 2(3) = 6`,
        teacherActivity: "Teacher solves the examples on the board step by step. Teacher explains the reasoning behind each step. Teacher emphasizes the importance of applying the correct rule.",
        pupilActivity: "Learners to write the examples in their exercise books. Learners to listen attentively and ask questions. Volunteer learners to go and solve on the board.",
        methods: "Question and Answer, Demonstration, Group Discussion"
      },
      {
        content: `PRACTICE EXERCISES\n\nEXERCISE:\n1. Differentiate y = x⁵\n2. Differentiate y = 3x³\n3. Differentiate y = 2x⁴ + 5x²\n4. Differentiate y = x³ - 4x + 7\n5. Find the gradient of y = x³ at x = 2\n\nEXPECTED ANSWERS:\n1. dy/dx = 5x⁴\n2. dy/dx = 9x²\n3. dy/dx = 8x³ + 10x\n4. dy/dx = 3x² - 4\n5. dy/dx = 3x², at x = 2, gradient = 12`,
        teacherActivity: "Teacher writes the exercise on the board. Teacher monitors progress and assists learners. Teacher asks volunteer learners to solve on the board.",
        pupilActivity: "Learners to write the exercise in their exercise books. Learners to work individually. Volunteer learners to solve on the board.",
        methods: "Group Work, Individual Practice, Question and Answer"
      },
      {
        content: `REAL-WORLD APPLICATIONS\n\nAPPLICATIONS OF DIFFERENTIATION:\n1. Physics: Velocity and acceleration\n2. Economics: Marginal cost and revenue\n3. Engineering: Optimization problems\n4. Biology: Growth rates\n\nSUMMARY:\n- Differentiation finds the rate of change\n- Power rule: d/dx(xⁿ) = nxⁿ⁻¹\n- Gradient of a curve at a point = derivative at that point\n- Differentiation has wide applications in real life`,
        teacherActivity: "Teacher consolidates learners' responses and writes the summary on the board. Teacher discusses real-world applications. Teacher gives remedial work.",
        pupilActivity: "Learners to listen attentively and write the summary. Learners to share examples of where differentiation is used. Learners to ask questions.",
        methods: "Review, Consolidation, Discussion"
      }
    ];
  }
  
  // Mensuration - Areas
  if (topicLower.includes('mensuration') || topicLower.includes('area') || topicLower.includes('perimeter') || topicLower.includes('volume')) {
    return [
      {
        content: `INTRODUCTION TO MENSURATION AREAS\n\nMensuration is the branch of mathematics that deals with the measurement of geometric figures such as length, area, and volume. Area is the measure of the surface enclosed by a plane figure.\n\nFORMULAE FOR AREAS:\n- Rectangle: A = L × W\n- Square: A = L²\n- Triangle: A = ½ × base × height\n- Circle: A = πr²\n- Parallelogram: A = base × height\n- Trapezium: A = ½(a+b)h`,
        teacherActivity: "Teacher writes the formulae on the board and explains each formula with clear examples. Teacher demonstrates how to identify the base, height, length, width, and radius in different shapes.",
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
        teacherActivity: "Teacher consolidates learners' responses and writes the summary on the board. Teacher discusses applications and gives remedial work.",
        pupilActivity: "Learners to listen attentively and write the summary. Learners to share examples of where mensuration is used.",
        methods: "Review, Consolidation, Discussion"
      }
    ];
  }
  
  // Quadratic Equations
  if (topicLower.includes('quadratic')) {
    return [
      {
        content: `INTRODUCTION TO QUADRATIC EQUATIONS\n\nA quadratic equation is an equation of the form ax² + bx + c = 0, where a, b, and c are constants and a ≠ 0.\n\nMETHODS OF SOLVING QUADRATIC EQUATIONS:\n1. Factorization Method\n2. Completing the Square Method\n3. Quadratic Formula Method\n\nQUADRATIC FORMULA:\nx = [-b ± √(b² - 4ac)] / 2a\n\nThe discriminant (b² - 4ac) determines the nature of roots:\n- If b² - 4ac > 0: Two distinct real roots\n- If b² - 4ac = 0: One repeated real root\n- If b² - 4ac < 0: No real roots (complex roots)`,
        teacherActivity: "Teacher writes the general form of quadratic equation on the board. Teacher explains each method and demonstrates the quadratic formula.",
        pupilActivity: "Learners to write the notes in their exercise books. Learners to listen attentively and ask questions.",
        methods: "Teacher Exposition, Demonstration, Question and Answer"
      },
      {
        content: `WORKED EXAMPLES\n\nEXAMPLE 1: Using Quadratic Formula\nSolve: x² + 5x + 6 = 0\nSolution:\na = 1, b = 5, c = 6\nx = [-5 ± √(25 - 24)] / 2\nx = [-5 ± 1] / 2\nx = -2 or x = -3\n\nEXAMPLE 2: Using Factorization\nSolve: x² - 5x + 6 = 0\nSolution:\n(x - 2)(x - 3) = 0\nx = 2 or x = 3\n\nEXAMPLE 3: Using Completing the Square\nSolve: x² + 6x - 7 = 0\nSolution:\n(x + 3)² = 16\nx = 1 or x = -7`,
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
        content: `SUMMARY AND APPLICATIONS\n\nSUMMARY:\n- Quadratic equations are of the form ax² + bx + c = 0\n- Three methods: Factorization, Completing Square, Quadratic Formula\n- Discriminant determines the nature of roots\n\nAPPLICATIONS:\n- Projectile motion in Physics\n- Profit and loss calculations in Business\n- Area problems in Geometry\n- Motion problems in Kinematics`,
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
        content: `WORKED EXAMPLES\n\nEXAMPLE 1: Find sin θ, cos θ, and tan θ for a right triangle where opposite = 3, adjacent = 4, hypotenuse = 5.\nSolution:\nsin θ = 3/5 = 0.6\ncos θ = 4/5 = 0.8\ntan θ = 3/4 = 0.75\n\nEXAMPLE 2: In a right triangle, sin θ = ½. Find θ.\nSolution:\nθ = sin⁻¹(½) = 30°`,
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
function generateCBCPrompt(topic, grade, subject, classSize, user, subtopic) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;
  
  // Generate topic-specific lesson progression
  const lessonProgression = generateLessonProgression(topic, subject, grade);
  
  return `
You are an expert Zambian teacher creating a CBC (Competency-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

⚠️ CRITICAL: You MUST return ONLY valid JSON that EXACTLY matches this CBC lesson structure. The lessonProgression array MUST have content with all required fields.

{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "subtopic": "${subtopic || ''}",
  "teacherName": "${user.fullName || 'MR/MRS'}",
  "school": "${user.school || 'KASHINAKAZHI SECONDARY SCHOOL'}",
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
    "2026 Teaching Module",
    "Curriculum Guide",
    "${subject} Grade ${grade} Textbook"
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
  "school": "${user.school || 'KASHINAKAZHI SECONDARY SCHOOL'}",
  "date": "${new Date().toISOString().split('T')[0]}",
  "duration": "80 MINUTES",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
  "references": [
    "Progress in ${subject} Grade ${grade} pg 78",
    "${subject} Grade ${grade} Textbook",
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

function generateFallbackCBC(topic, grade, subject, classSize, user) {
  const size = parseInt(classSize) || 40;
  const boys = Math.floor(size / 2) || 18;
  const girls = Math.ceil(size / 2) || 22;
  
  return {
    title: topic,
    grade: grade,
    subject: subject,
    teacherName: user?.fullName || 'MR/MRS',
    school: user?.school || 'KASHINAKAZHI SECONDARY SCHOOL',
    province: user?.province || 'Southern',
    district: user?.district || 'Itezhi-Tezhi',
    date: new Date().toISOString().split('T')[0],
    time: "08:00-08:40",
    duration: "40 min",
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
    references: ["2026 Teaching Module", "Curriculum Guide", `${subject} Grade ${grade} Textbook`],
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
    school: user?.school || 'KASHINAKAZHI SECONDARY SCHOOL',
    date: new Date().toISOString().split('T')[0],
    duration: '80 MINUTES',
    classSize: size,
    boys: boys,
    girls: girls,
    subtopic: '',
    references: [
      `Progress in ${subject} Grade ${grade} pg 78`,
      `${subject} Grade ${grade} Textbook`,
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
        references: `${subject} Grade ${grade} Textbook, Teacher's Guide, Syllabus`,
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
        references: `${subject} Grade ${grade} Textbook, Teacher's Guide`,
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
        references: "Textbook, Teacher's Guide",
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
        references: `${subject} Grade ${grade} Textbook, Teacher's Guide`,
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
    const { topic, grade, subject, classSize, curriculum, subtopic } = req.body;

    if (!topic || !grade || !subject) {
      return res.status(400).json({ error: 'Missing required fields: topic, grade, subject' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.lessonsUsed >= user.lessonsLimit) {
      return res.status(403).json({
        error: 'Lesson limit reached. Please upgrade your plan to generate more lessons.'
      });
    }

    const curriculumType = curriculum || 'cbc';
    const size = parseInt(classSize) || 40;
    const boys = Math.floor(size / 2) || 18;
    const girls = Math.ceil(size / 2) || 22;
    
    let aiContent = null;
    let useFallback = false;

    try {
      let prompt;
      
      if (curriculumType === 'cbc') {
        prompt = generateCBCPrompt(topic, grade, subject, classSize, user, subtopic);
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

Return ONLY the JSON object, no other text.
`
        },
        {
          role: "user",
          content: prompt
        }
      ];

      aiContent = await generateDeepSeekJSON(messages, { 
        max_tokens: 3000,
        temperature: 0.1
      });
      
      let fallback;
      if (curriculumType === 'cbc') {
        fallback = generateFallbackCBC(topic, grade, subject, classSize, user);
      } else {
        fallback = generateFallbackOBC(topic, grade, subject, classSize, user);
      }
      aiContent = { ...fallback, ...aiContent };

      if (curriculumType === 'cbc' && (!aiContent.lessonProgression || aiContent.lessonProgression.length === 0)) {
        console.log('📝 CBC lessonProgression was empty, populating with default content...');
        aiContent.lessonProgression = generateLessonProgression(topic, subject, grade);
      }

      if (curriculumType === 'obc' && (!aiContent.lessonDevelopment || aiContent.lessonDevelopment.length === 0)) {
        console.log('📝 OBC lessonDevelopment was empty, populating with default content...');
        aiContent.lessonDevelopment = generateLessonContent(topic, subject, grade);
      }

      console.log(`✅ ${curriculumType.toUpperCase()} lesson generated with DeepSeek`);

    } catch (error) {
      console.log('⚠️ DeepSeek error, using fallback:', error.message);
      useFallback = true;
    }

    if (useFallback || !aiContent) {
      console.log(`📝 Using ${curriculumType.toUpperCase()} fallback`);
      if (curriculumType === 'cbc') {
        aiContent = generateFallbackCBC(topic, grade, subject, classSize, user);
      } else {
        aiContent = generateFallbackOBC(topic, grade, subject, classSize, user);
      }
    }

    const referencesArray = Array.isArray(aiContent.references) 
      ? aiContent.references 
      : (aiContent.references ? [aiContent.references] : ["Textbook", "Teacher's Guide"]);

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

    const lesson = await prisma.lesson.create({
      data: {
        userId: req.userId,
        grade: grade,
        subject: subject,
        topic: topic,
        subtopic: aiContent.subtopic || subtopic || '',
        title: aiContent.title || topic,
        classSize: size,
        duration: aiContent.duration || '80 min',
        curriculum: curriculumType,
        objectives: learningOutcomesArray,
        development: lessonDevelopmentArray.map(d => d.learningPoints || d.content) || [],
        activities: lessonDevelopmentArray.map(d => d.pupilActivity || d.pupilActivities) || [],
        assessment: learnersEvaluationArray.join(', ') || '',
        curriculumCodes: [`${subject}-${grade}-${topic.substring(0, 3)}`],
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
    } else {
      responseData.lessonDevelopment = lessonDevelopmentArray;
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

// ============ REST OF SERVER (SCHEMES, NOTES, ASSESSMENTS, PAYMENTS, ADMIN, GET ROUTES) ============
// ... (keep all the existing code for schemes, notes, assessments, payments, admin, and get routes)
// The rest of the server code remains unchanged from your current version
