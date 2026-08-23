const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { authenticate } = require('../utils/auth');
const prisma = new PrismaClient();

const LIPILA_API_BASE = process.env.LIPILA_API_URL || 'https://api.lipila.com/v1';
const paymentSchema = z.object({ plan: z.enum(['pro','school']), phoneNumber: z.string().trim().regex(/^\+?260\d{9}$/).or(z.string().trim().regex(/^0\d{9}$/)) });
const pricing = { pro: { amount: 150, label: 'Pro Plan' }, school: { amount: 500, label: 'School Plan' } };

async function activateSubscription(tx, payment) {
  const now = new Date();
  const current = await tx.user.findUnique({ where: { id: payment.userId }, select: { subscriptionEndsAt:true } });
  const base = current?.subscriptionEndsAt && current.subscriptionEndsAt > now ? current.subscriptionEndsAt : now;
  const end = new Date(base); end.setMonth(end.getMonth() + 1);
  return tx.user.update({ where:{id:payment.userId}, data:{ role:payment.plan, lessonsLimit:999999, subscriptionEndsAt:end, lessonsUsed:0, lastResetAt:now } });
}

router.post('/initiate', authenticate, async (req,res) => {
  try {
    const input = paymentSchema.parse(req.body);
    if (!process.env.LIPILA_API_KEY || !process.env.BACKEND_URL) return res.status(503).json({ error:'Payments are not configured yet.' });
    const selected = pricing[input.plan];
    const referenceId = `mytoolbox-${uuidv4()}`;
    const transactionId = `TX-${uuidv4()}`;
    const payment = await prisma.payment.create({ data:{ userId:req.userId, amount:selected.amount, plan:input.plan.toUpperCase(), currency:'ZMW', provider:'lipila', phoneNumber:input.phoneNumber, referenceId, transactionId, status:'pending', expiresAt:new Date(Date.now()+30*60*1000) } });

    try {
      const response = await fetch(`${LIPILA_API_BASE}/collections`, { method:'POST', headers:{ Authorization:`Bearer ${process.env.LIPILA_API_KEY}`, 'Content-Type':'application/json' }, body:JSON.stringify({ referenceId, amount:selected.amount, accountNumber:input.phoneNumber, currency:'ZMW', callbackUrl:`${process.env.BACKEND_URL}/api/payments/webhook`, description:`mytoolbox ${selected.label} subscription - ${referenceId}` }) });
      if (!response.ok) throw new Error(`Lipila returned ${response.status}`);
      const data = await response.json();
      await prisma.payment.update({ where:{id:payment.id}, data:{ externalId:data.identifier || data.id || null } });
      res.json({ success:true,paymentId:payment.id,transactionId,referenceId,amount:selected.amount,plan:input.plan,status:'pending',mockMode:false,instructions:'Complete the mobile-money prompt on your phone. Your plan will activate after payment confirmation.' });
    } catch (error) {
      await prisma.payment.update({ where:{id:payment.id}, data:{status:'failed'} });
      console.error('Lipila initiation error:',error);
      res.status(502).json({ error:'Payment provider unavailable. Please try again.' });
    }
  } catch(error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error:'Invalid payment details' });
    console.error('Payment initiation error:',error); res.status(500).json({error:'Payment initiation failed'});
  }
});

router.get('/status/:transactionId', authenticate, async (req,res) => {
  try {
    const payment = await prisma.payment.findUnique({where:{transactionId:req.params.transactionId}});
    if (!payment) return res.status(404).json({error:'Transaction not found'});
    if (payment.userId !== req.userId) return res.status(403).json({error:'Unauthorized'});
    const user = await prisma.user.findUnique({where:{id:req.userId},select:{role:true,subscriptionEndsAt:true}});
    res.json({transactionId:payment.transactionId,referenceId:payment.referenceId,status:payment.status,amount:payment.amount,plan:payment.plan,createdAt:payment.createdAt,completedAt:payment.completedAt||null,userRole:user?.role,isUpgraded:['PRO','SCHOOL'].includes(user?.role),subscriptionEndsAt:user?.subscriptionEndsAt||null});
  } catch(error){console.error(error);res.status(500).json({error:'Failed to get transaction status'});}
});

router.get('/history', authenticate, async (req,res) => {
  try { res.json({payments:await prisma.payment.findMany({where:{userId:req.userId},orderBy:{createdAt:'desc'}})}); }
  catch(error){console.error(error);res.status(500).json({error:'Failed to get payment history'});}
});

router.post('/webhook', async (req,res) => {
  try {
    if (process.env.LIPILA_WEBHOOK_SECRET) {
      const provided = req.get('x-webhook-secret');
      if (!provided || provided !== process.env.LIPILA_WEBHOOK_SECRET) return res.status(401).json({error:'Invalid webhook secret'});
    }
    const {referenceId,status,identifier} = req.body || {};
    if (!referenceId) return res.status(400).json({error:'Missing referenceId'});
    const payment = await prisma.payment.findUnique({where:{referenceId}});
    if (!payment) return res.status(200).json({received:true});
    if (payment.status === 'completed') return res.status(200).json({received:true});
    const normalized = String(status || '').toUpperCase();
    if (['SUCCESS','COMPLETED','PAID'].includes(normalized)) {
      await prisma.$transaction(async tx => {
        const updated = await tx.payment.updateMany({where:{id:payment.id,status:'pending'},data:{status:'completed',completedAt:new Date(),externalId:identifier||payment.externalId}});
        if (updated.count) await activateSubscription(tx,payment);
      });
    } else if (['FAILED','CANCELLED','EXPIRED'].includes(normalized)) {
      await prisma.payment.update({where:{id:payment.id},data:{status:'failed',externalId:identifier||payment.externalId}});
    }
    res.status(200).json({received:true});
  } catch(error){console.error('Webhook error:',error);res.status(500).json({error:'Webhook processing failed'});}
});

module.exports = router;
