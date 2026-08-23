const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { signAccessToken, authenticate } = require('../utils/auth');
const crypto = require('crypto');

const prisma = new PrismaClient();
const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(8).max(128),
  school: z.string().trim().min(2).max(200),
  province: z.string().trim().min(2).max(100),
  district: z.string().trim().min(2).max(100),
  grades: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  subjects: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
});
const loginSchema = z.object({ email: z.string().trim().email().transform(v => v.toLowerCase()), password: z.string().min(1).max(128) });

function adminEmails() {
  return new Set((process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}



const requestResetSchema = z.object({ email: z.string().trim().email().transform(v => v.toLowerCase()) });
const resetPasswordSchema = z.object({ token: z.string().min(32).max(256), password: z.string().min(8).max(128) });

async function sendPasswordResetEmail(email, resetUrl) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    throw new Error('Password reset email is not configured');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [email],
      subject: 'Reset your MyToolbox password',
      html: `<p>You requested a password reset for MyToolbox.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 30 minutes.</p>`
    })
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = requestResetSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return the same response to prevent account enumeration.
    if (user) {
      const rawToken = crypto.randomBytes(48).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
      const frontend = (process.env.FRONTEND_URLS || '').split(',')[0].trim();
      if (!frontend) throw new Error('FRONTEND_URLS is not configured');
      await sendPasswordResetEmail(user.email, `${frontend}/forgot-password?token=${encodeURIComponent(rawToken)}`);
    }
    res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Enter a valid email address.' });
    console.error('Password reset request error:', error);
    res.status(503).json({ error: 'Password reset service is temporarily unavailable.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const input = resetPasswordSchema.parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) return res.status(400).json({ error: 'Invalid or expired reset link.' });
    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
    ]);
    res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid reset details.' });
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Password reset failed.' });
  }
});
router.post('/register', async (req, res) => {
  try {
    const input = registerSchema.parse(req.body);
    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(input.password, 12);
    const role = adminEmails().has(input.email) ? 'ADMIN' : 'FREE';
    const user = await prisma.user.create({
      data: { ...input, passwordHash, role, lastActive: new Date() }
    });
    res.status(201).json({ user: publicUser(user), token: signAccessToken(user) });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid registration details', details: error.flatten().fieldErrors });
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });

    const shouldBeAdmin = adminEmails().has(user.email);
    const updates = { lastActive: new Date() };
    if (shouldBeAdmin && user.role !== 'ADMIN') updates.role = 'ADMIN';
    await prisma.user.update({ where: { id: user.id }, data: updates });
    const currentUser = { ...user, ...updates };
    res.json({ user: publicUser(currentUser), token: signAccessToken(currentUser) });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid login details' });
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { lessons: { take: 5, orderBy: { createdAt: 'desc' } }, schemes: { take: 3, orderBy: { createdAt: 'desc' } } } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await prisma.user.update({ where: { id: user.id }, data: { lastActive: new Date() } });
    res.json(publicUser(user));
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = router;
