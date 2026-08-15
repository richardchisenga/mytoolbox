const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Log every step
console.log('Starting server...');

// Basic middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// ✅ Root route
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'mytoolbox backend is running!',
    timestamp: new Date().toISOString()
  });
});

// ✅ Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

// ✅ Try to load routes with error handling
try {
  console.log('Loading auth routes...');
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.log('⚠️ Auth routes not found:', error.message);
}

try {
  console.log('Loading lesson routes...');
  const lessonRoutes = require('./routes/lessons');
  app.use('/api/lessons', lessonRoutes);
  console.log('✅ Lesson routes loaded');
} catch (error) {
  console.log('⚠️ Lesson routes not found:', error.message);
}

try {
  console.log('Loading scheme routes...');
  const schemeRoutes = require('./routes/schemes');
  app.use('/api/schemes', schemeRoutes);
  console.log('✅ Scheme routes loaded');
} catch (error) {
  console.log('⚠️ Scheme routes not found:', error.message);
}

// ✅ 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found', 
    path: req.path 
  });
});

// ✅ Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// ✅ Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check: https://your-url.railway.app/api/health`);
});
