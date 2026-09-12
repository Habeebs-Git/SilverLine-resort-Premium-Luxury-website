/**
 * SILVERLINE RESORT — Orders API
 * POST /api/orders — Create a Razorpay Order
 *
 * Supports both single-room (legacy) and multi-room bookings.
 *
 * Single-room body:  { roomTypeId, checkIn, checkOut, adults, children, guestName, guestEmail, guestPhone }
 * Multi-room body:   { rooms: [{roomTypeId, quantity}], checkIn, checkOut, adults, children, guestName, guestEmail, guestPhone }
 *
 * Security:
 * - All inputs validated server-side
 * - Price recalculated server-side (never trusts client price)
 * - Availability checked before creating the order
 */

'use strict';

const { validateDateRange, validateGuestCounts, validateName, validateEmail, validatePhone } = require('./_lib/validation');
const { checkRoomTypeAvailability, calculatePricing } = require('./_lib/availability');
const { getSettings, getRoomTypeById } = require('./_lib/db');
const { createOrder } = require('./_lib/payment');

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Normalize the room selection input to an array of { roomTypeId, quantity }.
 * Supports both legacy single-room ({ roomTypeId }) and multi-room ({ rooms: [...] }).
 */
function normalizeRooms(body) {
  if (Array.isArray(body.rooms) && body.rooms.length > 0) {
    return body.rooms;
  }
  if (body.roomTypeId && typeof body.roomTypeId === 'string') {
    return [{ roomTypeId: body.roomTypeId, quantity: 1 }];
  }
  return null;
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

    // ── Normalize rooms input
    const rooms = normalizeRooms(body);
    if (!rooms) {
      return res.status(400).json({ error: 'Room selection is required.' });
    }

    // ── Validate dates
    const dateCheck = validateDateRange(body.checkIn, body.checkOut);
    if (!dateCheck.valid) {
      return res.status(400).json({ error: dateCheck.error, field: 'dates' });
    }

    // ── Validate guest counts (general, not per-room)
    const guestCheck = validateGuestCounts(body.adults, body.children);
    if (!guestCheck.valid) {
      return res.status(400).json({ error: guestCheck.error, field: 'guests' });
    }

    // ── Validate guest details
    const nameCheck = validateName(body.guestName, 'Full name');
    if (!nameCheck.valid) return res.status(400).json({ error: nameCheck.error });

    const emailCheck = validateEmail(body.guestEmail);
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.error });

    const phoneCheck = validatePhone(body.guestPhone);
    if (!phoneCheck.valid) return res.status(400).json({ error: phoneCheck.error });

    // ── Validate each room item and calculate combined pricing
    let totalAmountPaise = 0;
    let combinedMaxAdults = 0;
    let combinedMaxGuests = 0;

    for (const item of rooms) {
      if (!item.roomTypeId || typeof item.roomTypeId !== 'string') {
        return res.status(400).json({ error: 'Invalid room selection.' });
      }
      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty < 1 || qty > 10) {
        return res.status(400).json({ error: 'Room quantity must be between 1 and 10.' });
      }

      const rt = await getRoomTypeById(item.roomTypeId);
      if (!rt || !rt.active) {
        return res.status(400).json({ error: `Room type "${item.roomTypeId}" is not available.` });
      }

      // Check availability against requested quantity
      const avail = await checkRoomTypeAvailability(rt, body.checkIn, body.checkOut);
      if (!avail.available || avail.remainingRooms < qty) {
        return res.status(409).json({
          error: `Not enough ${rt.name} rooms available. Only ${avail.remainingRooms} remaining.`
        });
      }

      // Accumulate combined capacity across all selected rooms
      combinedMaxAdults += rt.maxAdults * qty;
      combinedMaxGuests += rt.maxGuests * qty;

      // Calculate pricing for this room type × quantity
      const pricing = calculatePricing(rt.basePrice, dateCheck.nights, taxRate);
      totalAmountPaise += Math.round(pricing.total * qty * 100);
    }

    // Check guest capacity against COMBINED room capacity (not per-room)
    if (guestCheck.adults > combinedMaxAdults || (guestCheck.adults + guestCheck.children) > combinedMaxGuests) {
      return res.status(400).json({
        error: `Selected rooms can accommodate up to ${combinedMaxAdults} adults and ${combinedMaxGuests} guests total. Please add more rooms.`
      });
    }

    // ── Create Razorpay order for combined total
    const receiptId = 'rcpt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const order = await createOrder(totalAmountPaise, receiptId);

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
