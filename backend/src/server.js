const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 8080);
const prisma = new PrismaClient();
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured and be at least 32 characters');
}
if (isProduction && process.env.ALLOW_MOCK_MODE === 'true') {
  throw new Error('ALLOW_MOCK_MODE cannot be enabled in production');
}

if (isProduction) {
  const requiredProductionEnv = ['DATABASE_URL','DEEPSEEK_API_KEY','LIPILA_API_KEY','LIPILA_WEBHOOK_SECRET','BACKEND_URL','ADMIN_EMAILS','RESEND_API_KEY','RESEND_FROM'];
  const missing = requiredProductionEnv.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
}

const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
  .split(',').map(v => v.trim()).filter(Boolean);
if (isProduction && !allowedOrigins.length) throw new Error('FRONTEND_URL(S) must be configured in production');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || !isProduction) return callback(null, true);
    return callback(null, allowedOrigins.includes(origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With']
}));
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please try again later.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many authentication attempts. Please try again later.' } });
app.use('/api', apiLimiter);

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status:'ok', database:'ok', timestamp:new Date().toISOString(), version:process.env.APP_VERSION || '1.0.0' });
  } catch (error) {
    res.status(503).json({ status:'degraded', database:'unavailable' });
  }
});
app.get('/', (req,res) => res.json({ service:'mytoolbox-api', status:'ok' }));

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/schemes', require('./routes/schemes'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));

app.use((req,res) => res.status(404).json({ error:'Not found' }));
app.use((err,req,res,next) => {
  console.error(err);
  const status = Number(err.status || err.statusCode || 500);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

const server = app.listen(PORT, '0.0.0.0', () => console.log(`mytoolbox API listening on ${PORT}`));
async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', err => console.error('Unhandled rejection', err));
process.on('uncaughtException', err => { console.error('Uncaught exception', err); process.exit(1); });
