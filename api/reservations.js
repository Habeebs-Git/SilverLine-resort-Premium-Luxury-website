/**
 * SILVERLINE RESORT — Reservations API
 * POST /api/reservations — Create a new reservation
 *
 * Supports both single-room (legacy) and multi-room bookings.
 *
 * Single-room body:  { roomTypeId, checkIn, checkOut, adults, children, guestName, guestEmail, guestPhone, razorpay_* }
 * Multi-room body:   { rooms: [{roomTypeId, quantity}], checkIn, checkOut, adults, children, guestName, guestEmail, guestPhone, razorpay_* }
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
const { validateDateRange, validateGuestCounts, validateName, validateEmail, validatePhone, validateSpecialRequests } = require('./_lib/validation');
const { checkRoomTypeAvailability, calculatePricing } = require('./_lib/availability');
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

    // ── Normalize rooms input (backward compatible)
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

    const { nights } = dateCheck;
    const { adults, children } = guestCheck;

    // ── Validate guest details
    const nameCheck = validateName(body.guestName, 'Full name');
    if (!nameCheck.valid) return res.status(400).json({ error: nameCheck.error });

    const emailCheck = validateEmail(body.guestEmail);
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.error });

    const phoneCheck = validatePhone(body.guestPhone);
    if (!phoneCheck.valid) return res.status(400).json({ error: phoneCheck.error });

    const srCheck = validateSpecialRequests(body.specialRequests);
    if (!srCheck.valid) return res.status(400).json({ error: srCheck.error });

    const guestName       = nameCheck.value;
    const guestEmail      = emailCheck.value;
    const guestPhone      = phoneCheck.value;
    const specialRequests = srCheck.value;
    const checkIn         = body.checkIn;
    const checkOut        = body.checkOut;

    // ── Validate each room type, check availability, resolve room type objects
    const resolvedRooms = [];
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

      // Re-verify availability at booking time
      const avail = await checkRoomTypeAvailability(rt, checkIn, checkOut);
      if (!avail.available || avail.remainingRooms < qty) {
        return res.status(409).json({
          error: `Not enough ${rt.name} rooms available. Only ${avail.remainingRooms} remaining.`
        });
      }

      combinedMaxAdults += rt.maxAdults * qty;
      combinedMaxGuests += rt.maxGuests * qty;

      resolvedRooms.push({ rt, qty });
    }

    // ── Validate guest capacity against COMBINED room capacity
    if (adults > combinedMaxAdults || (adults + children) > combinedMaxGuests) {
      return res.status(400).json({
        error: `Selected rooms can accommodate up to ${combinedMaxAdults} adults and ${combinedMaxGuests} guests total. Please add more rooms.`
      });
    }

    // ── Create/upsert guest record
    const guest = await upsertGuest({
      name:  guestName,
      email: guestEmail,
      phone: guestPhone
    });

    // ── Generate ONE guest-facing booking reference for the entire booking
    const bookingReference = generateBookingRef();
    const now              = new Date().toISOString();
    const isMultiRoom      = resolvedRooms.length > 1 || resolvedRooms[0].qty > 1;

    // ── Create reservation rows: one per room unit (for inventory correctness via atomic RPC)
    // Each row needs a unique booking_reference that passes the DB CHECK constraint
    // (format: SLR-YYYYMMDD-XXXX where XXXX is 3-6 alphanumeric chars).
    // For multi-room: generate a fresh valid reference per row; the first row uses the
    // guest-facing reference, additional rows get their own unique references.
    // The guest-facing/group reference is always `bookingReference` (returned in API response).
    let isFirstRow = true;
    const createdReservations = [];
    const lineItems = [];
    let grandSubtotal = 0;
    let grandTaxes = 0;
    let grandTotal = 0;

    for (const { rt, qty } of resolvedRooms) {
      const pricing = calculatePricing(rt.basePrice, nights, taxRate);
      const lineSubtotal = pricing.subtotal * qty;
      const lineTaxes    = pricing.taxes * qty;
      const lineTotal    = pricing.total * qty;

      grandSubtotal += lineSubtotal;
      grandTaxes    += lineTaxes;
      grandTotal    += lineTotal;

      lineItems.push({
        roomTypeId:   rt.id,
        roomTypeName: rt.name,
        roomImage:    rt.image,
        basePrice:    rt.basePrice,
        quantity:     qty,
        lineSubtotal,
        lineTaxes,
        lineTotal
      });

      // Create one reservation row per room unit
      for (let i = 0; i < qty; i++) {
        const reservationId = uuidv4();
        const paymentId     = uuidv4();
        // First row uses the guest-facing reference; additional rows get fresh unique refs
        // that satisfy the DB CHECK constraint (SLR-YYYYMMDD-XXXX format).
        const rowRef = isFirstRow ? bookingReference : generateBookingRef();
        isFirstRow = false;

        try {
          await createReservation({
            id:               reservationId,
            bookingReference: rowRef,
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
            _paymentId:      paymentId,
            _orderId:        razorpay_order_id,
            _transactionId:  razorpay_payment_id,
            _amountPaise:    pricing.total * 100
          });
        } catch (rpcErr) {
          if (rpcErr.rpcResult) {
            return res.status(409).json({ error: rpcErr.message || 'Room no longer available.' });
          }
          throw rpcErr;
        }

        // Payment record (no-op stub — RPC already inserted it)
        await createPaymentRecord({
          id:            paymentId,
          reservationId,
          bookingReference: rowRef,
          provider:       'razorpay',
          orderId:        razorpay_order_id,
          transactionId:  razorpay_payment_id,
          amount:         pricing.total * 100,
          currency:       'INR',
          status:         'captured',
          testMode:       true,
          createdAt: now
        });

        createdReservations.push(reservationId);

        // Sync availability to OTA channels (mock)
        syncAvailability(rt.id, checkIn, checkOut, -1);
      }
    }

    // ── Send confirmation email
    const taxLabel = settings?.pricing?.taxLabel || 'GST (12%)';
    sendBookingConfirmation({
      bookingReference,
      guestName,
      guestEmail,
      checkIn,
      checkOut,
      nights,
      adults,
      children,
      total:    grandTotal,
      currency: 'INR',
      // Multi-room fields
      isMultiRoom,
      lineItems,
      subtotal:  grandSubtotal,
      taxes:     grandTaxes,
      taxLabel,
      // Legacy single-room field (for backward compat in email template)
      roomTypeName: isMultiRoom
        ? lineItems.map(li => `${li.roomTypeName}${li.quantity > 1 ? ' ×' + li.quantity : ''}`).join(', ')
        : lineItems[0].roomTypeName
    });

    // Admin notification
    const roomSummary = lineItems.map(li =>
      `${li.roomTypeName}${li.quantity > 1 ? ' ×' + li.quantity : ''}`
    ).join(', ');
    sendAdminNotification(
      `New Booking: ${bookingReference}`,
      `${guestName} — ${roomSummary} | ${checkIn} → ${checkOut} | ₹${grandTotal}`
    );

    // ── Audit log
    await appendAuditLog({
      userId:     null,
      action:     'RESERVATION_CREATED',
      resource:   'reservation',
      resourceId: createdReservations[0],
      meta:       { bookingReference, guestEmail, rooms: lineItems.map(li => ({ roomTypeId: li.roomTypeId, qty: li.quantity })), checkIn, checkOut }
    });

    // ── Build response
    // For single room, preserve exact legacy response shape
    // For multi-room, include lineItems array with breakdown
    const firstRoom = lineItems[0];
    const responseReservation = {
      bookingReference,
      guestName,
      guestEmail,
      guestPhone,
      checkIn,
      checkOut,
      nights,
      adults,
      children,
      specialRequests,
      status:        'confirmed',
      paymentStatus: 'paid',
      paymentMode:   'Razorpay (TEST MODE)',
      createdAt:     now,
      // Legacy single-room fields (backward compat)
      roomTypeName:  firstRoom.roomTypeName,
      roomImage:     firstRoom.roomImage,
      pricing: {
        basePrice:  firstRoom.basePrice,
        nights,
        subtotal:   grandSubtotal,
        taxes:      grandTaxes,
        total:      grandTotal,
        taxLabel,
        currency:   'INR'
      }
    };

    // Add multi-room breakdown when applicable
    if (isMultiRoom) {
      responseReservation.isMultiRoom = true;
      responseReservation.lineItems = lineItems;
    }

    return res.status(201).json({
      success: true,
      bookingReference,
      reservation: responseReservation
    });

  } catch (err) {
    console.error('[reservations] Error:', err.message, err.stack);
    return res.status(500).json({ error: 'Your reservation could not be completed. Please try again or call us.' });
  }
};
