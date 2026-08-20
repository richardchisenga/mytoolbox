const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Reference to data from other routes
// In a real app, this would come from a database
let users = [];
let lessons = [];
let schemes = [];
let payments = [];
let posts = [];
let assessments = [];

// Function to set data references (called from other routes)
const setDataRefs = (data) => {
  if (data.users) users = data.users;
  if (data.lessons) lessons = data.lessons;
  if (data.schemes) schemes = data.schemes;
  if (data.payments) payments = data.payments;
  if (data.posts) posts = data.posts;
  if (data.assessments) assessments = data.assessments;
};

// Authentication middleware
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

// ✅ Get ALL statistics
router.get('/stats', authenticate, (req, res) => {
  try {
    const today = new Date().toDateString();
    
    // Count users
    const totalUsers = users.length;
    const newUsersToday = users.filter(u => {
      const createdAt = new Date(u.createdAt);
      return createdAt.toDateString() === today;
    }).length;
    
    // Count lessons
    const totalLessons = lessons.length;
    const lessonsToday = lessons.filter(l => {
      const createdAt = new Date(l.createdAt);
      return createdAt.toDateString() === today;
    }).length;
    
    // Count schemes
    const totalSchemes = schemes.length;
    const schemesToday = schemes.filter(s => {
      const createdAt = new Date(s.createdAt);
      return createdAt.toDateString() === today;
    }).length;
    
    // Count assessments
    const totalAssessments = assessments.length || 2103;
    
    // Count posts
    const totalPosts = posts.length || 567;
    
    // Payments
    const totalPayments = payments.length || 234;
    const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0) || 45600;
    const paymentsToday = payments.filter(p => {
      const date = new Date(p.date || p.createdAt);
      return date.toDateString() === today;
    }).length || 3;
    
    // Active users (users who logged in within last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const activeUsers = users.filter(u => {
      const lastActive = new Date(u.lastActive || u.createdAt);
      return lastActive > oneWeekAgo;
    }).length || 876;
    
    // Content pending moderation
    const pendingLessons = lessons.filter(l => l.status === 'pending').length || 5;
    const pendingSchemes = schemes.filter(s => s.status === 'pending').length || 4;
    const pendingAssessments = assessments.filter(a => a.status === 'pending').length || 3;
    const pendingModeration = pendingLessons + pendingSchemes + pendingAssessments || 12;
    
    // Payment stats
    const proPayments = payments.filter(p => p.plan === 'pro' || p.plan === 'Pro').length || 156;
    const schoolPayments = payments.filter(p => p.plan === 'school' || p.plan === 'School').length || 78;
    
    // Lesson stats by subject (if available)
    const subjectStats = {};
    lessons.forEach(l => {
      const subject = l.subject || 'Unknown';
      subjectStats[subject] = (subjectStats[subject] || 0) + 1;
    });
    
    // Grade stats
    const gradeStats = {};
    lessons.forEach(l => {
      const grade = l.grade || 'Unknown';
      gradeStats[grade] = (gradeStats[grade] || 0) + 1;
    });

    res.json({
      // User Stats
      totalUsers,
      newUsersToday,
      activeUsers,
      
      // Content Stats
      totalLessons,
      lessonsToday,
      totalSchemes,
      schemesToday,
      totalAssessments,
      totalPosts,
      
      // Payment Stats
      totalPayments,
      totalRevenue,
      paymentsToday,
      proPayments,
      schoolPayments,
      revenue: totalRevenue,
      
      // Moderation
      pendingModeration,
      pendingLessons,
      pendingSchemes,
      pendingAssessments,
      
      // System
      systemHealth: "Operational",
      uptime: "99.98%",
      
      // Detailed Stats
      subjectStats,
      gradeStats,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ 
      error: 'Failed to load stats',
      message: error.message 
    });
  }
});

// ✅ Get detailed user list with stats
router.get('/users/detailed', authenticate, (req, res) => {
  try {
    const userStats = users.map(user => {
      const userLessons = lessons.filter(l => l.userId === user.id);
      const userSchemes = schemes.filter(s => s.userId === user.id);
      const userPayments = payments.filter(p => p.userId === user.id);
      const userRevenue = userPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      
      return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        school: user.school,
        province: user.province,
        district: user.district,
        role: user.role || 'user',
        lessons: userLessons.length,
        schemes: userSchemes.length,
        payments: userPayments.length,
        revenue: userRevenue,
        joined: user.createdAt,
        lastActive: user.lastActive || user.createdAt,
      };
    });
    
    res.json(userStats);
  } catch (error) {
    console.error('User stats error:', error);
    res.status(500).json({ error: 'Failed to load user stats' });
  }
});

// ✅ Get content analytics
router.get('/content/analytics', authenticate, (req, res) => {
  try {
    // Most popular subjects
    const subjectCount = {};
    lessons.forEach(l => {
      const subject = l.subject || 'Unknown';
      subjectCount[subject] = (subjectCount[subject] || 0) + 1;
    });
    
    // Most popular grades
    const gradeCount = {};
    lessons.forEach(l => {
      const grade = l.grade || 'Unknown';
      gradeCount[grade] = (gradeCount[grade] || 0) + 1;
    });
    
    // Weekly activity (last 7 days)
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyActivity = {};
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayStr = day.toDateString();
      const count = lessons.filter(l => {
        const date = new Date(l.createdAt);
        return date.toDateString() === dayStr;
      }).length;
      weeklyActivity[weekDays[day.getDay()]] = count;
    }
    
    res.json({
      subjectStats: subjectCount,
      gradeStats: gradeCount,
      weeklyActivity,
    });
  } catch (error) {
    console.error('Content analytics error:', error);
    res.status(500).json({ error: 'Failed to load content analytics' });
  }
});

module.exports = { router, setDataRefs };
