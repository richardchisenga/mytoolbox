const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// ============================================
// CONFIGURATION
// ============================================

// Mock mode - set to true for testing without API key
const USE_MOCK = true; // ← Change to false when you have the API key

// Lipila API endpoints (update with actual Lipila URLs when available)
const LIPILA_API = {
  sandbox: 'https://sandbox.lipila.com/api/v1',
  production: 'https://api.lipila.com/api/v1',
};

const getApiKey = () => process.env.LIPILA_API_KEY;
const getEnvironment = () => process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
const getBaseUrl = () => LIPILA_API[getEnvironment()];

// ============================================
// MIDDLEWARE
// ============================================

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
// PAYMENT INITIATION
// ============================================

router.post('/initiate', authenticate, async (req, res) => {
  try {
    const { amount, phoneNumber, provider } = req.body;
    const userId = req.userId;

    // Validate input
    if (!amount || !phoneNumber || !provider) {
      return res.status(400).json({
        error: 'Amount, phone number, and provider are required',
      });
    }

    const validProviders = ['mtn', 'airtel', 'zamtel'];
    if (!validProviders.includes(provider.toLowerCase())) {
      return res.status(400).json({
        error: 'Provider must be mtn, airtel, or zamtel',
      });
    }

    // Generate unique reference ID
    const referenceId = `mytoolbox-${uuidv4()}`;
    const transactionId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Store transaction
    const transaction = {
      id: transactionId,
      userId,
      referenceId,
      amount: parseFloat(amount),
      phoneNumber,
      provider: provider.toLowerCase(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    if (!global.transactions) {
      global.transactions = [];
    }
    global.transactions.push(transaction);

    // ============================================
    // MOCK MODE - Test without real API
    // ============================================
    if (USE_MOCK) {
      console.log('📝 MOCK MODE: Payment initiated for user:', userId);
      console.log('📝 Transaction:', transaction);

      // Auto-complete after 5 seconds
      setTimeout(() => {
        transaction.status = 'completed';
        transaction.completedAt = new Date().toISOString();
        console.log('✅ MOCK: Payment completed for user:', userId);
      }, 5000);

      return res.status(201).json({
        success: true,
        message: 'Payment initiated (MOCK MODE)',
        transactionId: transactionId,
        referenceId: referenceId,
        amount: amount,
        provider: provider,
        status: 'pending',
        mockMode: true,
        instructions: 'In mock mode, payment will auto-complete in 5 seconds.',
      });
    }

    // ============================================
    // REAL LIPILA API CALL
    // ============================================
    try {
      const collectionData = {
        referenceId: referenceId,
        amount: parseFloat(amount),
        accountNumber: phoneNumber,
        currency: 'ZMW',
        callbackUrl: `${process.env.BACKEND_URL || 'https://mytoolbox-production.up.railway.app'}/api/payments/webhook`,
        description: `mytoolbox Pro Plan Subscription - ${referenceId}`,
      };

      console.log('📝 Creating Lipila collection:', collectionData);

      const response = await axios.post(
        `${getBaseUrl()}/collections`,
        collectionData,
        {
          headers: {
            'Authorization': `Bearer ${getApiKey()}`,
            'Content-Type': 'application/json',
          },
        }
      );

      transaction.externalId = response.data.identifier;
      global.transactions = global.transactions.map(t =>
        t.id === transaction.id ? transaction : t
      );

      console.log('✅ Collection created:', response.data);

      return res.status(201).json({
        success: true,
        message: 'Payment initiated successfully',
        transactionId: transactionId,
        referenceId: referenceId,
        amount: amount,
        provider: provider,
        status: 'pending',
        instructions: `Please complete the payment on your phone. A prompt will appear on ${provider.toUpperCase()} Money.`,
      });

    } catch (error) {
      console.error('❌ Lipila API Error:', error.response?.data || error.message);

      transaction.status = 'failed';
      global.transactions = global.transactions.map(t =>
        t.id === transaction.id ? transaction : t
      );

      return res.status(500).json({
        error: 'Failed to initiate payment with Lipila',
        details: error.response?.data?.message || error.message,
      });
    }

  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    res.status(500).json({
      error: 'Failed to initiate payment',
      details: error.message,
    });
  }
});

// ============================================
// WEBHOOK HANDLER
// ============================================

router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('📞 Webhook received:', payload);

    const { referenceId, status, amount, accountNumber, identifier } = payload;

    if (!referenceId) {
      console.warn('⚠️ Webhook missing referenceId');
      return res.status(400).json({ error: 'Missing referenceId' });
    }

    if (!global.transactions) {
      global.transactions = [];
    }
    const transaction = global.transactions.find(t => t.referenceId === referenceId);

    if (!transaction) {
      console.warn('⚠️ Transaction not found for referenceId:', referenceId);
      return res.status(200).json({ received: true });
    }

    if (status === 'SUCCESS' || status === 'COMPLETED') {
      transaction.status = 'completed';
      transaction.completedAt = new Date().toISOString();
      console.log('✅ Payment successful for:', referenceId);
      console.log(`🔄 User ${transaction.userId} upgraded to PRO`);
    } else if (status === 'FAILED' || status === 'CANCELLED') {
      transaction.status = 'failed';
      console.log('❌ Payment failed for:', referenceId);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================
// CHECK TRANSACTION STATUS
// ============================================

router.get('/status/:transactionId', authenticate, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.userId;

    if (!global.transactions) {
      global.transactions = [];
    }
    const transaction = global.transactions.find(t => t.id === transactionId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({
      transactionId: transaction.id,
      referenceId: transaction.referenceId,
      status: transaction.status,
      amount: transaction.amount,
      provider: transaction.provider,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt || null,
    });

  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({ error: 'Failed to get transaction status' });
  }
});

// ============================================
// GET USER TRANSACTIONS
// ============================================

router.get('/my-transactions', authenticate, async (req, res) => {
  try {
    const userId = req.userId;

    if (!global.transactions) {
      global.transactions = [];
    }
    const userTransactions = global.transactions
      .filter(t => t.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      transactions: userTransactions,
    });

  } catch (error) {
    console.error('❌ Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

module.exports = router;
