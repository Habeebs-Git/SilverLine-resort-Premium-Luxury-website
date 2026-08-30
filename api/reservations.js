/**
 * SILVERLINE RESORT — Reservations API
 * POST /api/reservations — Create a new reservation
 *
 * Security:
 * - All inputs validated server-side
 * - Price recalculated server-side (never trusts client price)
 * - Availability re-verified at booking time (prevents race conditions)
 * - Booking reference generated server-side
 */

'use strict';

const { v4: uuidv4 }                = require('uuid');
const { validateReservationInput }  = require('./_lib/validation');
const { validateFinalAvailability, calculatePricing } = require('./_lib/availability');
const { createReservation, upsertGuest, createPaymentRecord, getSettings, appendAuditLog } = require('./_lib/db');
const { createPayment, verifyPayment }                = require('./_lib/payment-mock');
const { sendBookingConfirmation, sendAdminNotification } = require('./_lib/email-mock');
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

    // ── Get settings (tax rate, etc.)
    const settings = getSettings();
    const taxRate   = settings?.pricing?.taxRate || 0.12;

    // ── Step 1: Validate all inputs server-side
    // validateReservationInput also fetches roomType for capacity check
    const { getRoomTypeById } = require('./_lib/db');
    const roomType = getRoomTypeById(body.roomTypeId);

    const validation = validateReservationInput(body, roomType);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed. Please check your information.',
        fields: validation.errors
      });
    }

    const { checkIn, checkOut, nights, adults, children,
            guestName, guestEmail, guestPhone, specialRequests, roomTypeId } = validation.sanitized;

    // ── Step 2: Re-verify availability (race condition protection)
    const availCheck = validateFinalAvailability(roomTypeId, checkIn, checkOut, adults, children);
    if (!availCheck.ok) {
      return res.status(409).json({ error: availCheck.reason });
    }

    const rt = availCheck.roomType;

    // ── Step 3: Calculate pricing SERVER-SIDE (never trust client)
    const pricing = calculatePricing(rt.basePrice, nights, taxRate);

    // ── Step 4: Create/upsert guest record
    const guestId = uuidv4();
    const guest = upsertGuest({
      id: guestId,
      name: guestName,
      email: guestEmail,
      phone: guestPhone,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // ── Step 5: Create payment intent (mock in prototype)
    const paymentIntent = createPayment({
      amount: pricing.total * 100, // smallest unit (paise)
      currency: 'INR',
      bookingRef: '[pending]',
      guestEmail
    });

    // ── Step 6: Verify payment (mock: auto-verifies in prototype)
    const paymentVerify = verifyPayment({
      orderId:   paymentIntent.orderId,
      paymentId: paymentIntent.clientToken,
      signature: 'MOCK_SIGNATURE'
    });

    if (!paymentVerify.verified) {
      return res.status(402).json({ error: 'Payment verification failed. Please try again.' });
    }

    // ── Step 7: Create reservation
    const bookingReference = generateBookingRef();
    const reservationId    = uuidv4();
    const now              = new Date().toISOString();

    const reservation = createReservation({
      id: reservationId,
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
      paymentProvider:  'mock',
      paymentReference: paymentVerify.transactionId,
      createdAt: now,
      updatedAt: now
    });

    // ── Step 8: Record payment
    createPaymentRecord({
      id:            uuidv4(),
      reservationId,
      bookingReference,
      provider:       'mock',
      orderId:        paymentIntent.orderId,
      transactionId:  paymentVerify.transactionId,
      amount:         pricing.total * 100,
      currency:       'INR',
      status:         'captured',
      testMode:       true,
      createdAt: now
    });

    // ── Step 9: Sync availability to OTA channels (mock)
    syncAvailability(rt.id, checkIn, checkOut, -1);

    // ── Step 10: Send confirmation email (mock)
    sendBookingConfirmation(reservation);
    sendAdminNotification(
      `New Booking: ${bookingReference}`,
      `${guestName} — ${rt.name} | ${checkIn} → ${checkOut} | ₹${pricing.total}`
    );

    // ── Step 11: Audit log
    appendAuditLog({
      userId:   null, // Guest action, no admin user
      action:   'RESERVATION_CREATED',
      resource: 'reservation',
      resourceId: reservationId,
      meta:     { bookingReference, guestEmail, roomTypeId, checkIn, checkOut }
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
        paymentMode:   'TEST — Mock Payment (No real charge)',
        createdAt:     now
      }
    });


  } catch (err) {
    console.error('[reservations] Error:', err.message, err.stack);
    return res.status(500).json({ error: 'Your reservation could not be completed. Please try again or call us.' });
  }
};
