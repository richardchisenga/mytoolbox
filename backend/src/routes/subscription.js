const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// ✅ Middleware to verify user
const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ✅ Get current subscription
router.get('/status', authenticate, (req, res) => {
  // This will use the auth.js subscription status
  res.json({ message: 'Subscription status endpoint' });
});

module.exports = router;
