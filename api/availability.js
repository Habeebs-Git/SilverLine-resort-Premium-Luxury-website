/**
 * SILVERLINE RESORT — Availability API
 * GET /api/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&adults=2&children=0
 *
 * Returns room types available for the given date range and guest count.
 * All availability logic is server-side — never trusted from client.
 */

'use strict';

const { validateDateRange, validateGuestCounts } = require('./_lib/validation');
const { getAvailableRooms, calculatePricing }    = require('./_lib/availability');
const { getSettings }                             = require('./_lib/db');

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const { checkIn, checkOut, adults = '2', children = '0' } = req.query;

    // ── Validate dates
    const dateCheck = validateDateRange(checkIn, checkOut);
    if (!dateCheck.valid) {
      return res.status(400).json({ error: dateCheck.error, field: 'dates' });
    }

    // ── Validate guest counts (without room type constraint)
    const guestCheck = validateGuestCounts(adults, children);
    if (!guestCheck.valid) {
      return res.status(400).json({ error: guestCheck.error, field: 'guests' });
    }

    // ── Get settings for tax rate
    const settings = await getSettings();
    const taxRate   = settings?.pricing?.taxRate || 0.12;

    // ── Get available rooms (server-side availability check)
    const rooms = await getAvailableRooms(checkIn, checkOut, guestCheck.adults, guestCheck.children);

    // ── Attach pricing to each room
    const result = rooms.map(room => ({
      id:               room.id,
      name:             room.name,
      slug:             room.slug,
      type:             room.type,
      description:      room.description,
      shortDescription: room.shortDescription,
      image:            room.image,
      images:           room.images,
      imageAlt:         room.imageAlt,
      basePrice:        room.basePrice,
      maxAdults:        room.maxAdults,
      maxChildren:      room.maxChildren,
      maxGuests:        room.maxGuests,
      bedConfiguration: room.bedConfiguration,
      roomSize:         room.roomSize,
      view:             room.view,
      amenities:        room.amenities,
      highlights:       room.highlights,
      pricing: calculatePricing(room.basePrice, dateCheck.nights, taxRate),
      availability: {
        available:      room.availability.available,
        remainingRooms: room.availability.remainingRooms
      }
    }));

    return res.status(200).json({
      checkIn,
      checkOut,
      nights: dateCheck.nights,
      adults: guestCheck.adults,
      children: guestCheck.children,
      taxRate,
      rooms: result,
      totalAvailable: result.length
    });

  } catch (err) {
    console.error('[availability] Error:', err.message);
    return res.status(500).json({ error: 'Unable to check availability. Please try again.' });
  }
};
