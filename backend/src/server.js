const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE
// ============================================

// Security
app.use(helmet());

// CORS - allow your frontend
app.use(cors({
  origin: [
    'https://mytoolbox-nine.vercel.app',
    'https://mytoolbox.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true
}));

// Parse JSON
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// ============================================
// ROUTES - Import from files
// ============================================

// Import route files
const authRoutes = require('./routes/auth');
const lessonRoutes = require('./routes/lessons');
const schemeRoutes = require('./routes/schemes');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/schemes', schemeRoutes);

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
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
  console.log(`✅ Auth routes: http://localhost:${PORT}/api/auth`);
  console.log(`✅ Lesson routes: http://localhost:${PORT}/api/lessons`);
});
