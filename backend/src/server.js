// src/server.js - Complete application with all routes and CORS configured for both Vercel and Render
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

// ============ CORS CONFIGURATION ============
const corsOptions = {
  origin: [
    // Render frontend URLs
    'https://mytoolbox-1.onrender.com',
    'https://mytoolbox.onrender.com',
    /\.onrender\.com$/,  // Allows all Render subdomains
    
    // Vercel frontend URLs
    'https://mytoolbox-nine.vercel.app',
    'https://mytoolbox-0e80w147vy-ryichietechn.vercel.app',
    /\.vercel\.app$/,  // Allows all Vercel preview deployments
    
    // Backend URLs
    'https://mytoolbox-production.up.railway.app',
    
    // Local development
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

// ============ AUTH ROUTES ============

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, school, province, district, grades, subjects } = req.body;
    
    // Check if user exists
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

// Login
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

// Get current user
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        lessons: { take: 5, orderBy: { createdAt: 'desc' } },
        schemes: { take: 3, orderBy: { createdAt: 'desc' } },
      }
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
    const { topic, grade, subject, classSize, curriculum } = req.body;
    
    // Validate input
    if (!topic || !grade || !subject) {
      return res.status(400).json({ error: 'Missing required fields: topic, grade, subject' });
    }

    // Check user's lesson limit
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has reached their lesson limit
    if (user.lessonsUsed >= user.lessonsLimit) {
      return res.status(403).json({ 
        error: 'Lesson limit reached. Please upgrade your plan to generate more lessons.' 
      });
    }

    // Generate lesson content
    const generatedLesson = {
      title: topic,
      topic: topic,
      grade: grade,
      subject: subject,
      classSize: classSize || 40,
      curriculum: curriculum || 'cbc',
      duration: '40 min',
      school: user.school || '',
      province: user.province || '',
      district: user.district || '',
      teacherName: user.fullName || '',
      // OBC-specific fields
      learningOutcomes: [
        `Define and identify ${topic}`,
        `Apply ${topic} concepts to solve problems`,
        `Analyze real-world applications of ${topic}`
      ],
      lessonDevelopment: [
        {
          time: '10 min',
          learningPoints: `Introduction to ${topic}`,
          teacherActivities: `Explain the concept of ${topic} using examples`,
          pupilActivities: `Listen and take notes`
        },
        {
          time: '20 min',
          learningPoints: `Practical application of ${topic}`,
          teacherActivities: `Guide students through ${topic} problems`,
          pupilActivities: `Work in groups on ${topic} exercises`
        },
        {
          time: '10 min',
          learningPoints: `Review and summary of ${topic}`,
          teacherActivities: `Summarize key points and answer questions`,
          pupilActivities: `Ask questions and share understanding`
        }
      ],
      learnersEvaluation: [
        `Define ${topic} in your own words`,
        `Give two examples of ${topic}`,
        `Solve a ${topic} problem`
      ],
      teacherEvaluation: 'To be filled after lesson',
      // CBC-specific fields
      generalCompetences: ['Critical thinking', 'Communication', 'Collaboration'],
      specificCompetence: `Demonstrate understanding of ${topic}`,
      lessonGoal: `By the end of the lesson, learners will be able to apply ${topic} in real-world contexts`,
      rationale: `${topic} is essential for understanding advanced concepts`,
      priorKnowledge: `Basic knowledge of ${subject}`,
      references: [`${subject} Grade ${grade} Textbook`, `Teacher's Guide`],
      learningEnvironment: 'Classroom with adequate resources',
      materials: ['Whiteboard', 'Markers', 'Worksheets'],
      expectedStandard: `Learners will be able to solve ${topic} problems independently`,
      lessonProgression: [
        {
          stage: 'Introduction',
          time: '10 min',
          teacherRole: `Introduce ${topic} with engaging examples`,
          learnerRole: `Listen and participate in discussion`,
          assessmentCriteria: `Understanding of ${topic} concepts`
        },
        {
          stage: 'Development',
          time: '20 min',
          teacherRole: `Guide through ${topic} activities`,
          learnerRole: `Practice ${topic} in groups`,
          assessmentCriteria: `Application of ${topic} concepts`
        },
        {
          stage: 'Conclusion',
          time: '10 min',
          teacherRole: `Review key ${topic} concepts`,
          learnerRole: `Share findings and ask questions`,
          assessmentCriteria: `Understanding of ${topic}`
        }
      ],
      homework: `Solve the ${topic} problems in your workbook`,
      lessonEvaluation: `Learners demonstrated good understanding of ${topic}`
    };

    // Save lesson to database
    const lesson = await prisma.lesson.create({
      data: {
        userId: req.userId,
        grade: grade,
        subject: subject,
        topic: topic,
        title: topic,
        classSize: parseInt(classSize) || 40,
        duration: '40 min',
        curriculum: curriculum || 'cbc',
        objectives: [`Understand ${topic}`, `Apply ${topic}`],
        development: [`Introduction to ${topic}`, `Practice ${topic}`],
        activities: [`Group work`, `Individual practice`],
        assessment: `Quiz on ${topic}`,
        curriculumCodes: [`${subject}-${grade}-${topic.substring(0, 3)}`],
        provinceContext: user.province || '',
        lessonDevelopment: generatedLesson.lessonDevelopment,
        lessonProgression: generatedLesson.lessonProgression
      }
    });

    // Update user's lesson count
    await prisma.user.update({
      where: { id: req.userId },
      data: { lessonsUsed: user.lessonsUsed + 1 }
    });

    // Return the generated lesson
    res.status(201).json({
      ...generatedLesson,
      id: lesson.id,
      createdAt: lesson.createdAt
    });

  } catch (error) {
    console.error('Lesson generation error:', error);
    res.status(500).json({ error: 'Failed to generate lesson' });
  }
});

// ============ START SERVER ============
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Auth routes available at /api/auth/*`);
  console.log(`✅ Lesson generation available at /api/lessons/generate`);
  console.log(`✅ CORS enabled for Vercel and Render frontend`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  prisma.$disconnect();
  process.exit(0);
});
