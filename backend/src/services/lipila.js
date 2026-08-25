// src/services/lipila.js
const axios = require('axios');

class LipilaService {
  constructor() {
    this.apiKey = process.env.LIPILA_API_KEY;
    // Use sandbox or production URL based on your key
    const isSandbox = this.apiKey?.startsWith('lsk_');
    this.baseURL = isSandbox 
      ? 'https://sandbox-api.lipila.com' 
      : 'https://api.lipila.com';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Create a mobile money collection (payment request)
   * @param {Object} params - Payment parameters
   * @param {string} params.referenceId - Unique reference for this payment
   * @param {number} params.amount - Amount in ZMW
   * @param {string} params.accountNumber - Customer's mobile number (e.g., 260977123456)
   * @param {string} params.currency - Currency (default: ZMW)
   * @param {string} params.callbackUrl - Webhook URL for payment confirmation
   */
  async createCollection({ referenceId, amount, accountNumber, currency = 'ZMW', callbackUrl }) {
    try {
      const response = await this.client.post('/api/v1/collections', {
        referenceId,
        amount,
        accountNumber,
        currency,
        callbackUrl,
      });
      return response.data;
    } catch (error) {
      console.error('Lipila collection error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Payment initiation failed');
    }
  }

  /**
   * Check transaction status
   * @param {string} referenceId - The reference ID of the transaction
   */
  async getTransactionStatus(referenceId) {
    try {
      const response = await this.client.get(`/api/v1/transactions/${referenceId}/status`);
      return response.data;
    } catch (error) {
      console.error('Status check error:', error.response?.data || error.message);
      throw new Error('Failed to check transaction status');
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance() {
    try {
      const response = await this.client.get('/api/v1/balance');
      return response.data;
    } catch (error) {
      console.error('Balance check error:', error.response?.data || error.message);
      throw new Error('Failed to get balance');
    }
  }
}

module.exports = new LipilaService();
