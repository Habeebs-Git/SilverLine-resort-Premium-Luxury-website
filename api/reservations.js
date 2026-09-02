/**
 * SILVERLINE RESORT — Reservations API
 * POST /api/reservations — Create a new reservation
 *
 * Security:
 * - All inputs validated server-side
 * - Price recalculated server-side (never trusts client price)
 * - Availability re-verified at booking time (prevents race conditions)
 * - Final atomic double-booking protection inside PostgreSQL RPC
 * - Booking reference generated server-side
 * - Razorpay signature verification
 */

'use strict';

const { v4: uuidv4 }                = require('uuid');
const { validateReservationInput }  = require('./_lib/validation');
const { validateFinalAvailability, calculatePricing } = require('./_lib/availability');
const { createReservation, upsertGuest, createPaymentRecord, getSettings, getRoomTypeById, appendAuditLog } = require('./_lib/db');
const { verifySignature }           = require('./_lib/payment');
const { sendBookingConfirmation, sendAdminNotification } = require('./_lib/email');
const { syncAvailability }          = require('./_lib/ota-adapters');

function generateBookingRef() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = Math.random().toString(36).slice(2,6).toUpperCase();
  return `SLR-${ymd}-${rand}`;
}

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

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    // ── Step 0: Verify Razorpay Signature FIRST
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed. Missing signature data.' });
    }

    const isSignatureValid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isSignatureValid) {
      return res.status(402).json({ error: 'Payment verification failed. Invalid signature.' });
    }

    // ── Get settings (tax rate, etc.)
    const settings = await getSettings();
    const taxRate   = settings?.pricing?.taxRate || 0.12;

    // ── Step 1: Validate all inputs server-side
    const roomType = await getRoomTypeById(body.roomTypeId);

    const validation = validateReservationInput(body, roomType);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed. Please check your information.',
        fields: validation.errors
      });
    }

    const { checkIn, checkOut, nights, adults, children,
            guestName, guestEmail, guestPhone, specialRequests, roomTypeId } = validation.sanitized;

    // ── Step 2: Re-verify availability (early rejection before RPC)
    const availCheck = await validateFinalAvailability(roomTypeId, checkIn, checkOut, adults, children);
    if (!availCheck.ok) {
      return res.status(409).json({ error: availCheck.reason });
    }

    const rt = availCheck.roomType;

    // ── Step 3: Calculate pricing SERVER-SIDE (never trust client)
    const pricing = calculatePricing(rt.basePrice, nights, taxRate);

    // ── Step 4: Create/upsert guest record
    const guest = await upsertGuest({
      name:  guestName,
      email: guestEmail,
      phone: guestPhone
    });

    // ── Step 7: Create reservation atomically via PostgreSQL RPC
    // The RPC handles: row-lock → overlap-count → INSERT reservation → INSERT payment
    // in a single transaction. This is the true double-booking protection.
    const bookingReference = generateBookingRef();
    const reservationId    = uuidv4();
    const paymentId        = uuidv4();
    const now              = new Date().toISOString();

    let reservation;
    try {
      reservation = await createReservation({
        id:               reservationId,
        bookingReference,
        guestId:          guest.id,
        guestName,
        guestEmail,
        guestPhone,
        roomTypeId:       rt.id,
        roomTypeName:     rt.name,
        checkIn,
        checkOut,
        nights,
        adults,
        children,
        specialRequests,
        basePrice:        pricing.basePrice,
        subtotal:         pricing.subtotal,
        taxes:            pricing.taxes,
        total:            pricing.total,
        taxRate:          pricing.taxRate,
        currency:         'INR',
        status:           'confirmed',
        paymentStatus:    'paid',
        paymentProvider:  'razorpay',
        paymentReference: razorpay_payment_id,
        createdAt: now,
        updatedAt: now,
        // Extra fields passed to the RPC (not stored on the reservation object itself)
        _paymentId:      paymentId,
        _orderId:        razorpay_order_id,
        _transactionId:  razorpay_payment_id,
        _amountPaise:    pricing.total * 100
      });
    } catch (rpcErr) {
      // RPC returned ok:false (e.g., NO_AVAILABILITY race condition)
      if (rpcErr.rpcResult) {
        return res.status(409).json({ error: rpcErr.message || 'Room no longer available.' });
      }
      throw rpcErr; // Re-throw real DB errors
    }

    // ── Step 8: Record payment (no-op stub — RPC already inserted it)
    await createPaymentRecord({
      id:            paymentId,
      reservationId,
      bookingReference,
      provider:       'razorpay',
      orderId:        razorpay_order_id,
      transactionId:  razorpay_payment_id,
      amount:         pricing.total * 100,
      currency:       'INR',
      status:         'captured',
      testMode:       true,
      createdAt: now
    });

    // ── Step 9: Sync availability to OTA channels (mock)
    syncAvailability(rt.id, checkIn, checkOut, -1);

    // ── Step 10: Send confirmation email (mock)
    sendBookingConfirmation({
      bookingReference,
      guestName,
      guestEmail,
      roomTypeName: rt.name,
      checkIn,
      checkOut,
      nights,
      adults,
      children,
      total:    pricing.total,
      currency: 'INR'
    });
    sendAdminNotification(
      `New Booking: ${bookingReference}`,
      `${guestName} — ${rt.name} | ${checkIn} → ${checkOut} | ₹${pricing.total}`
    );

    // ── Step 11: Audit log
    await appendAuditLog({
      userId:     null, // Guest action, no admin user
      action:     'RESERVATION_CREATED',
      resource:   'reservation',
      resourceId: reservationId,
      meta:       { bookingReference, guestEmail, roomTypeId, checkIn, checkOut }
    });

    // ── Return success (never expose internal IDs or sensitive data)
    return res.status(201).json({
      success: true,
      bookingReference,
      reservation: {
        bookingReference,
        guestName,
        guestEmail,
        guestPhone,
        roomTypeName:  rt.name,
        roomImage:     rt.image,
        checkIn,
        checkOut,
        nights,
        adults,
        children,
        specialRequests,
        pricing: {
          basePrice:  pricing.basePrice,
          nights:     pricing.nights,
          subtotal:   pricing.subtotal,
          taxes:      pricing.taxes,
          total:      pricing.total,
          taxLabel:   settings?.pricing?.taxLabel || 'GST (12%)',
          currency:   'INR'
        },
        status:        'confirmed',
        paymentStatus: 'paid',
        paymentMode:   'Razorpay (TEST MODE)',
        createdAt:     now
      }
    });


  } catch (err) {
    console.error('[reservations] Error:', err.message, err.stack);
    return res.status(500).json({ error: 'Your reservation could not be completed. Please try again or call us.' });
  }
};
