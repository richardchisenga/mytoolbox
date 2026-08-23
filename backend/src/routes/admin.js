const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../utils/auth');
const prisma = new PrismaClient();
const adminOnly = [authenticate, requireAdmin(prisma)];

router.get('/stats', ...adminOnly, async (req, res, next) => {
  try {
    const startToday = new Date(); startToday.setHours(0,0,0,0);
    const startWeek = new Date(Date.now() - 7 * 86400000);
    const [totalUsers,totalLessons,totalSchemes,totalPayments,revenue,newUsersToday,lessonsToday,schemesToday,paymentsToday,activeUsers,proPayments,schoolPayments] = await Promise.all([
      prisma.user.count(), prisma.lesson.count(), prisma.scheme.count(), prisma.payment.count({ where:{ status:'completed' } }),
      prisma.payment.aggregate({ _sum:{ amount:true }, where:{ status:'completed' } }),
      prisma.user.count({ where:{ createdAt:{ gte:startToday } } }), prisma.lesson.count({ where:{ createdAt:{ gte:startToday } } }), prisma.scheme.count({ where:{ createdAt:{ gte:startToday } } }),
      prisma.payment.count({ where:{ status:'completed', completedAt:{ gte:startToday } } }), prisma.user.count({ where:{ lastActive:{ gte:startWeek } } }),
      prisma.payment.count({ where:{ status:'completed', plan:'PRO' } }), prisma.payment.count({ where:{ status:'completed', plan:'SCHOOL' } })
    ]);
    res.json({ totalUsers,newUsersToday,activeUsers,totalLessons,lessonsToday,totalSchemes,schemesToday,totalAssessments:0,totalPosts:0,totalPayments,totalRevenue:revenue._sum.amount || 0,paymentsToday,proPayments,schoolPayments,revenue:revenue._sum.amount || 0,pendingModeration:0,pendingLessons:0,pendingSchemes:0,pendingAssessments:0,systemHealth:'Operational',uptime:'N/A' });
  } catch (error) { next(error); }
});

router.get('/users/detailed', ...adminOnly, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy:{createdAt:'desc'}, select:{id:true,fullName:true,email:true,school:true,province:true,district:true,role:true,createdAt:true,lastActive:true,_count:{select:{lessons:true,schemes:true,payments:true}}} });
    const payments = await prisma.payment.groupBy({ by:['userId'], where:{status:'completed'}, _sum:{amount:true} });
    const revenue = new Map(payments.map(p => [p.userId, p._sum.amount || 0]));
    res.json(users.map(u => ({ id:u.id,fullName:u.fullName,email:u.email,school:u.school,province:u.province,district:u.district,role:u.role,lessons:u._count.lessons,schemes:u._count.schemes,payments:u._count.payments,revenue:revenue.get(u.id)||0,joined:u.createdAt,lastActive:u.lastActive })));
  } catch (error) { next(error); }
});

module.exports = router;
