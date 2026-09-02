/**
 * SILVERLINE RESORT — Razorpay Payment Layer
 * Handles order creation and signature verification.
 */

'use strict';

const Razorpay = require('razorpay');
const crypto = require('crypto');

function getRazorpayInstance() {
  const key_id = process.env.PAYMENT_RAZORPAY_KEY_ID;
  const key_secret = process.env.PAYMENT_RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error('Razorpay keys not configured in environment variables.');
  }

  return new Razorpay({ key_id, key_secret });
}

/**
 * Create a Razorpay order
 * @param {number} amount Amount in paise
 * @param {string} receipt Booking reference or unique ID
 */
async function createOrder(amount, receipt) {
  const rzp = getRazorpayInstance();
  
  const options = {
    amount: amount,
    currency: 'INR',
    receipt: receipt
  };

  return await rzp.orders.create(options);
}

/**
 * Verify Razorpay payment signature
 * @param {string} orderId Razorpay order ID
 * @param {string} paymentId Razorpay payment ID
 * @param {string} signature Razorpay signature
 */
function verifySignature(orderId, paymentId, signature) {
  const secret = process.env.PAYMENT_RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new Error('PAYMENT_RAZORPAY_KEY_SECRET not configured.');
  }

  const generatedSignature = crypto
    .createHmac('sha256', secret)
    .update(orderId + '|' + paymentId)
    .digest('hex');

  return generatedSignature === signature;
}

/**
 * Refund a captured payment
 * @param {string} paymentId Razorpay payment ID
 * @param {number} amount Amount to refund in paise
 */
async function refundPayment(paymentId, amount) {
  const rzp = getRazorpayInstance();
  return await rzp.payments.refund(paymentId, { amount });
}

module.exports = {
  createOrder,
  verifySignature,
  refundPayment
};
