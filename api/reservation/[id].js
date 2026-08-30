/**
 * SILVERLINE RESORT — Reservation Lookup API (Guest-facing)
 * GET /api/reservation/[id]?ref=SLR-XXXXXXXX
 *
 * Allows a guest to look up their reservation by booking reference.
 * No authentication required, but requires bookingReference query param.
 */

'use strict';

const { getReservationByRef } = require('../_lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const { ref } = req.query;

    if (!ref || typeof ref !== 'string' || ref.length > 24) {
      return res.status(400).json({ error: 'Invalid booking reference.' });
    }

    const sanitizedRef = ref.trim().toUpperCase();

    // Validate reference format
    if (!/^SLR-\d{8}-[A-Z0-9]{4}$/.test(sanitizedRef)) {
      return res.status(400).json({ error: 'Invalid booking reference format.' });
    }

    const reservation = getReservationByRef(sanitizedRef);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found. Please check your booking reference.' });
    }

    // Return only guest-safe fields — never expose internal IDs, payment hashes, etc.
    return res.status(200).json({
      bookingReference: reservation.bookingReference,
      guestName:        reservation.guestName,
      roomTypeName:     reservation.roomTypeName,
      checkIn:          reservation.checkIn,
      checkOut:         reservation.checkOut,
      nights:           reservation.nights,
      adults:           reservation.adults,
      children:         reservation.children,
      specialRequests:  reservation.specialRequests,
      pricing: {
        basePrice:  reservation.basePrice,
        nights:     reservation.nights,
        subtotal:   reservation.subtotal,
        taxes:      reservation.taxes,
        total:      reservation.total,
        currency:   reservation.currency || 'INR'
      },
      status:           reservation.status,
      paymentStatus:    reservation.paymentStatus,
      createdAt:        reservation.createdAt
    });

  } catch (err) {
    console.error('[reservation/[id]] Error:', err.message);
    return res.status(500).json({ error: 'Unable to retrieve reservation. Please try again.' });
  }
};
