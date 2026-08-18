const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
// ✅ Enable trust proxy for Railway
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;  

// ============================================
// CORS - FIXED WITH OPTIONS HANDLING
// ============================================
app.use(cors({
  origin: [
    'https://mytoolbox-nine.vercel.app',
    'https://mytoolbox.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ Handle preflight requests
app.options('*', cors());

// ============================================
// MIDDLEWARE
// ============================================

// Security
app.use(helmet());

// Parse JSON
app.use(express.json({ limit: '10mb' }));

// Rate limiting - FIXED
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { 
    xForwardedForHeader: false  // Fixes the header validation
  }
});
app.use(limiter);

// ============================================
// ROUTES
// ============================================

// ✅ Try to load routes with error handling
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.log('⚠️ Auth routes not loaded:', error.message);
}

try {
  const lessonRoutes = require('./routes/lessons');
  app.use('/api/lessons', lessonRoutes);
  console.log('✅ Lesson routes loaded');
} catch (error) {
  console.log('⚠️ Lesson routes not loaded:', error.message);
}

try {
  const schemeRoutes = require('./routes/schemes');
  app.use('/api/schemes', schemeRoutes);
  console.log('✅ Scheme routes loaded');
} catch (error) {
  console.log('⚠️ Scheme routes not loaded:', error.message);
}

// ============================================
// BASIC ROUTES
// ============================================

// Root route
app.get('/', (req, res) => {
  res.send('✅ mytoolbox backend is running!');
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Backend is live!'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check: /api/health`);
});
