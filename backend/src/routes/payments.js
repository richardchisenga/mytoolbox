const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ✅ MOCK MODE - Set to true for testing without real payments
const USE_MOCK = true; // ← Change to false when you have real Lipila credentials

// Lipila API configuration (for real mode)
const LIPILA_API_BASE = process.env.LIPILA_API_URL || 'https://api.lipila.com/v1';

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

// ============================================
// INITIATE PAYMENT - MOCK MODE
// ============================================

router.post('/initiate', authenticate, async (req, res) => {
  try {
    const { plan, phoneNumber } = req.body;
    const userId = req.userId;

    // Pricing
    const pricing = {
      pro: { amount: 150, label: 'Pro Plan' },
      school: { amount: 500, label: 'School Plan' }
    };

    const selectedPlan = pricing[plan];
    if (!selectedPlan) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId,
        amount: selectedPlan.amount,
        plan: plan,
        currency: 'ZMW',
        provider: 'mock',
        phoneNumber: phoneNumber || '260977123456',
        referenceId: `mytoolbox-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
        transactionId: `TX-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes expiry
      }
    });

    // ============================================
    // MOCK MODE - Auto-complete payment after 5 seconds
    // ============================================
    if (USE_MOCK) {
      console.log('📝 MOCK MODE: Payment initiated for user:', userId);
      console.log('📝 Payment details:', { 
        plan: plan, 
        amount: selectedPlan.amount, 
        transactionId: payment.transactionId 
      });

      // Auto-complete after 5 seconds
      setTimeout(async () => {
        try {
          // Update payment status
          await prisma.payment.update({
            where: { id: payment.id },
            data: { 
              status: 'completed', 
              completedAt: new Date(),
              externalId: `mock-${Date.now()}`
            }
          });

          // ✅ Upgrade user to PRO
          const now = new Date();
          const subscriptionEndsAt = new Date(now);
          subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + 1);

          await prisma.user.update({
            where: { id: userId },
            data: {
              role: plan === 'school' ? 'SCHOOL' : 'PRO',
              lessonsLimit: 999999,
              subscriptionEndsAt: subscriptionEndsAt,
              lessonsUsed: 0,
              lastResetAt: now
            }
          });

          console.log(`✅ MOCK: User ${userId} upgraded to ${plan} plan`);
          console.log(`📝 Subscription ends: ${subscriptionEndsAt.toISOString()}`);
        } catch (error) {
          console.error('❌ MOCK upgrade error:', error);
        }
      }, 5000);

      return res.json({
        success: true,
        paymentId: payment.id,
        transactionId: payment.transactionId,
        referenceId: payment.referenceId,
        amount: selectedPlan.amount,
        plan: plan,
        status: 'pending',
        mockMode: true,
        message: '✅ Payment initiated! In mock mode, payment will auto-complete in 5 seconds.',
        instructions: 'You will be automatically upgraded to Pro in 5 seconds. No real money will be charged.'
      });
    }

    // ============================================
    // REAL LIPILA API CALL (when USE_MOCK = false)
    // ============================================
    try {
      const response = await fetch(`${LIPILA_API_BASE}/collections`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.LIPILA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referenceId: payment.referenceId,
          amount: selectedPlan.amount,
          accountNumber: phoneNumber,
          currency: 'ZMW',
          callbackUrl: `${process.env.BACKEND_URL}/api/payments/webhook`,
          description: `mytoolbox ${selectedPlan.label} subscription - ${payment.referenceId}`
        })
      });

      const data = await response.json();

      if (data.identifier) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { externalId: data.identifier }
        });
      }

      res.json({
        success: true,
        paymentId: payment.id,
        transactionId: payment.transactionId,
        referenceId: payment.referenceId,
        amount: selectedPlan.amount,
        plan: plan,
        status: 'pending',
        mockMode: false,
        instructions: 'Please complete the payment on your phone. You will receive a prompt on your mobile money.'
      });

    } catch (error) {
      console.error('❌ Lipila API Error:', error);
      
      // Mark payment as failed
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed' }
      });

      return res.status(500).json({ 
        error: 'Payment initiation failed. Please try again.',
        details: error.message 
      });
    }

  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    res.status(500).json({ error: 'Payment initiation failed. Please try again.' });
  }
});

// ============================================
// CHECK PAYMENT STATUS
// ============================================

router.get('/status/:transactionId', authenticate, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.userId;

    const payment = await prisma.payment.findUnique({
      where: { transactionId: transactionId }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (payment.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get current user to check if upgrade was applied
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    res.json({
      transactionId: payment.transactionId,
      referenceId: payment.referenceId,
      status: payment.status,
      amount: payment.amount,
      plan: payment.plan,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt || null,
      userRole: user?.role,
      isUpgraded: user?.role === 'PRO' || user?.role === 'SCHOOL'
    });

  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({ error: 'Failed to get transaction status' });
  }
});

// ============================================
// GET USER'S PAYMENT HISTORY
// ============================================

router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.userId;

    const payments = await prisma.payment.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ payments });
  } catch (error) {
    console.error('❌ Payment history error:', error);
    res.status(500).json({ error: 'Failed to get payment history' });
  }
});

// ============================================
// WEBHOOK (for real Lipila payments)
// ============================================

router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('📞 Webhook received:', payload);

    const { referenceId, status, accountNumber, identifier } = payload;

    if (!referenceId) {
      return res.status(400).json({ error: 'Missing referenceId' });
    }

    const payment = await prisma.payment.findUnique({
      where: { referenceId: referenceId }
    });

    if (!payment) {
      console.warn('⚠️ Payment not found for referenceId:', referenceId);
      return res.status(200).json({ received: true });
    }

    if (payment.status === 'completed') {
      return res.status(200).json({ received: true });
    }

    if (status === 'SUCCESS' || status === 'COMPLETED') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          externalId: identifier
        }
      });

      // ✅ Upgrade user
      const now = new Date();
      const subscriptionEndsAt = new Date(now);
      subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + 1);

      await prisma.user.update({
        where: { id: payment.userId },
        data: {
          role: payment.plan === 'school' ? 'SCHOOL' : 'PRO',
          lessonsLimit: 999999,
          subscriptionEndsAt: subscriptionEndsAt,
          lessonsUsed: 0,
          lastResetAt: now
        }
      });

      console.log(`✅ User ${payment.userId} upgraded to ${payment.plan} plan`);
    } else if (status === 'FAILED' || status === 'CANCELLED') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed' }
      });
      console.log(`❌ Payment failed for user ${payment.userId}`);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================
// TEST MOCK PAYMENT DIRECTLY (for debugging)
// ============================================

router.post('/test-mock', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Immediately upgrade user for testing
    const now = new Date();
    const subscriptionEndsAt = new Date(now);
    subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + 1);

    await prisma.user.update({
      where: { id: userId },
      data: {
        role: 'PRO',
        lessonsLimit: 999999,
        subscriptionEndsAt: subscriptionEndsAt,
        lessonsUsed: 0,
        lastResetAt: now
      }
    });

    res.json({
      success: true,
      message: '✅ Mock upgrade successful! You are now a Pro user.',
      role: 'PRO',
      subscriptionEndsAt: subscriptionEndsAt
    });
  } catch (error) {
    console.error('❌ Test mock error:', error);
    res.status(500).json({ error: 'Failed to upgrade user' });
  }
});

module.exports = router;
