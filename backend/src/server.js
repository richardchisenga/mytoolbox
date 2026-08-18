const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================
// CORS
// ============================================
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

// ============================================
// MIDDLEWARE
// ============================================

app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// ============================================
// ROUTES - ORDER MATTERS!
// ============================================

// 1. Health check (must be first)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Backend is live!',
    port: PORT
  });
});

// 2. Root route
app.get('/', (req, res) => {
  res.send(`✅ mytoolbox backend is running on port ${PORT}!`);
});

// 3. Auth routes
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.log('⚠️ Auth routes not loaded:', error.message);
}

// 4. Lesson routes
try {
  const lessonRoutes = require('./routes/lessons');
  app.use('/api/lessons', lessonRoutes);
  console.log('✅ Lesson routes loaded');
} catch (error) {
  console.log('⚠️ Lesson routes not loaded:', error.message);
}

// 5. Scheme routes
try {
  const schemeRoutes = require('./routes/schemes');
  app.use('/api/schemes', schemeRoutes);
  console.log('✅ Scheme routes loaded');
} catch (error) {
  console.log('⚠️ Scheme routes not loaded:', error.message);
}

// 6. 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// 7. Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// ============================================
// START SERVER - LISTEN ON ALL INTERFACES
// ============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check: /api/health`);
  console.log(`✅ CORS enabled for all origins`);
});
