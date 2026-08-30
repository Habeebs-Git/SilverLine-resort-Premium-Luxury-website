/**
 * SILVERLINE RESORT — Mock Payment Provider
 *
 * ⚠ DEMO / PROTOTYPE ONLY
 * This is a mock payment implementation for development and demonstration.
 * It simulates payment flow without processing real transactions.
 *
 * Production upgrade path:
 *   1. Set PAYMENT_PROVIDER=razorpay in .env
 *   2. Add Razorpay keys: PAYMENT_RAZORPAY_KEY_ID and PAYMENT_RAZORPAY_KEY_SECRET
 *   3. Replace this module with the Razorpay SDK integration
 *
 * Razorpay is recommended for INR payments in India.
 * Stripe is an alternative with strong international support.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Payment Provider Interface
 * All payment providers must implement these methods.
 */

/**
 * Create a payment intent / order.
 * Returns a client-facing token/order ID that the frontend uses to
 * render the payment form (e.g., Razorpay order ID, Stripe client_secret).
 *
 * @param {Object} params
 * @param {number} params.amount        Amount in smallest currency unit (paise for INR)
 * @param {string} params.currency      e.g. 'INR'
 * @param {string} params.bookingRef    Booking reference for metadata
 * @param {string} params.guestEmail    Guest email for receipt
 * @returns {Object} { success, orderId, clientToken, amount, currency, provider, testMode }
 */
function createPayment({ amount, currency = 'INR', bookingRef, guestEmail }) {
  // Mock implementation: always succeeds in test mode
  const orderId = 'MOCK-ORDER-' + uuidv4().replace(/-/g,'').slice(0,16).toUpperCase();

  console.log(`[MOCK PAYMENT] Created order: ${orderId} for ₹${amount/100} (ref: ${bookingRef})`);

  return {
    success: true,
    provider: 'mock',
    testMode: true,
    orderId,
    clientToken: 'MOCK-CLIENT-TOKEN-' + orderId,
    amount,
    currency,
    bookingRef,
    note: 'This is a mock payment for prototype testing. No real transaction occurred.'
  };
}

/**
 * Verify a payment after the frontend confirms it.
 * In production: verifies signature/webhook from the payment provider.
 * Never trust client-side "payment successful" claims.
 *
 * @param {Object} params
 * @param {string} params.orderId
 * @param {string} params.paymentId    Provider's payment ID
 * @param {string} params.signature    Provider's signature for verification
 * @returns {Object} { verified, transactionId, amount, provider, note }
 */
function verifyPayment({ orderId, paymentId, signature }) {
  // Mock: always verifies successfully in test mode
  const transactionId = paymentId || 'MOCK-TXN-' + uuidv4().replace(/-/g,'').slice(0,12).toUpperCase();

  console.log(`[MOCK PAYMENT] Verified payment: ${transactionId} for order: ${orderId}`);

  return {
    verified: true,
    provider: 'mock',
    testMode: true,
    transactionId,
    orderId,
    note: 'Mock payment verified. No real transaction occurred.'
  };
}

/**
 * Issue a refund for a payment.
 * In production: calls the provider's refund API.
 *
 * @param {Object} params
 * @param {string} params.transactionId  Original payment transaction ID
 * @param {number} params.amount         Amount to refund in smallest unit
 * @param {string} params.reason
 * @returns {Object} { success, refundId, amount, provider, note }
 */
function refundPayment({ transactionId, amount, reason = 'Cancellation' }) {
  const refundId = 'MOCK-REFUND-' + uuidv4().replace(/-/g,'').slice(0,12).toUpperCase();

  console.log(`[MOCK PAYMENT] Refund issued: ${refundId} for transaction: ${transactionId}, amount: ₹${amount/100}`);

  return {
    success: true,
    provider: 'mock',
    testMode: true,
    refundId,
    transactionId,
    amount,
    reason,
    note: 'Mock refund issued. No real transaction occurred.'
  };
}

module.exports = { createPayment, verifyPayment, refundPayment };
