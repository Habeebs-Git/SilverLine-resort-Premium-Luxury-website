/**
 * SILVERLINE RESORT — Orders API
 * POST /api/orders — Create a Razorpay Order
 *
 * Security:
 * - All inputs validated server-side
 * - Price recalculated server-side (never trusts client price)
 * - Availability checked before creating the order
 */

'use strict';

const { validateReservationInput } = require('./_lib/validation');
const { validateFinalAvailability, calculatePricing } = require('./_lib/availability');
const { getSettings, getRoomTypeById } = require('./_lib/db');
const { createOrder } = require('./_lib/payment');

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const body = req.body || {};

    // Get settings (tax rate, etc.)
    const settings = await getSettings();
    const taxRate = settings?.pricing?.taxRate || 0.12;

    // Validate inputs
    const roomType = await getRoomTypeById(body.roomTypeId);
    const validation = validateReservationInput(body, roomType);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed. Please check your information.',
        fields: validation.errors
      });
    }

    const { checkIn, checkOut, nights, adults, children, roomTypeId } = validation.sanitized;

    // Verify availability
    const availCheck = await validateFinalAvailability(roomTypeId, checkIn, checkOut, adults, children);
    if (!availCheck.ok) {
      return res.status(409).json({ error: availCheck.reason });
    }

    const rt = availCheck.roomType;

    // Calculate pricing
    const pricing = calculatePricing(rt.basePrice, nights, taxRate);
    
    // Amount must be in paise for INR
    const amountPaise = Math.round(pricing.total * 100);

    // Use a temporary receipt ID (since booking reference is generated after payment)
    const receiptId = 'rcpt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // Create Razorpay order
    const order = await createOrder(amountPaise, receiptId);

    return res.status(201).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.PAYMENT_RAZORPAY_KEY_ID
    });

  } catch (err) {
    console.error('[orders] Error:', err.message, err.stack);
    return res.status(500).json({ error: 'Could not generate payment order. Please try again.' });
  }
};
