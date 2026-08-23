const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../utils/auth');
const prisma = new PrismaClient();

router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where:{id:req.userId}, select:{role:true,lessonsUsed:true,lessonsLimit:true,schemesUsed:true,schemesLimit:true,subscriptionEndsAt:true,lastResetAt:true} });
    if (!user) return res.status(404).json({error:'User not found'});
    const activePaid = ['PRO','SCHOOL'].includes(user.role) && user.subscriptionEndsAt && user.subscriptionEndsAt > new Date();
    res.json({ plan: activePaid ? user.role : 'FREE', role:user.role, active:!!activePaid, lessonsUsed:user.lessonsUsed, lessonsLimit:user.lessonsLimit, schemesUsed:user.schemesUsed, schemesLimit:user.schemesLimit, subscriptionEndsAt:user.subscriptionEndsAt });
  } catch(error){ console.error(error); res.status(500).json({error:'Failed to load subscription'}); }
});
module.exports = router;
