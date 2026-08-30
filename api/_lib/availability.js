/**
 * SILVERLINE RESORT — Core Availability Engine
 *
 * The single source of truth for room availability.
 * This logic MUST run server-side — never trust client-provided availability.
 *
 * Overlap detection (unchanged from JSON version):
 *   A booking occupies dates [checkIn, checkOut).
 *   Check-out day is NOT occupied (a new guest can check in on that day).
 *   Two bookings overlap if:  newCheckIn < existingCheckOut && newCheckOut > existingCheckIn
 *
 * All functions are now async because they call the Supabase db layer.
 * calculatePricing() is pure math and remains synchronous.
 */

'use strict';

const { parseDate } = require('./validation');
const { getReservations, getRoomTypes } = require('./db');

/**
 * Count how many rooms of a given type are booked (not cancelled) for a date range.
 *
 * @param {string} roomTypeId
 * @param {string} checkIn   YYYY-MM-DD
 * @param {string} checkOut  YYYY-MM-DD
 * @returns {Promise<number>} overlapping confirmed bookings
 */
async function countOverlappingBookings(roomTypeId, checkIn, checkOut) {
  const ci = parseDate(checkIn);
  const co = parseDate(checkOut);
  if (!ci || !co) return 0;

  const reservations = await getReservations();
  return reservations.filter(r => {
    if (r.roomTypeId !== roomTypeId) return false;
    // Cancelled bookings free up inventory
    if (['cancelled', 'no-show'].includes(r.status)) return false;
    const ri = parseDate(r.checkIn);
    const ro = parseDate(r.checkOut);
    if (!ri || !ro) return false;
    // Overlap: the intervals [ci, co) and [ri, ro) intersect
    return ci < ro && co > ri;
  }).length;
}

/**
 * Check if a room type has availability for the given date range.
 *
 * @param {Object} roomType  Full room type object from db
 * @param {string} checkIn
 * @param {string} checkOut
 * @returns {Promise<{ available: boolean, remainingRooms: number }>}
 */
async function checkRoomTypeAvailability(roomType, checkIn, checkOut) {
  const booked = await countOverlappingBookings(roomType.id, checkIn, checkOut);
  const remaining = roomType.inventory - booked;
  return {
    available:      remaining > 0,
    remainingRooms: Math.max(0, remaining),
    bookedRooms:    booked,
    totalInventory: roomType.inventory
  };
}

/**
 * Get all available room types for a date range and guest count.
 *
 * @param {string} checkIn
 * @param {string} checkOut
 * @param {number} adults
 * @param {number} children
 * @returns {Promise<Array>} Available room types with availability metadata
 */
async function getAvailableRooms(checkIn, checkOut, adults = 1, children = 0) {
  const allRoomTypes = await getRoomTypes();
  const roomTypes = allRoomTypes.filter(rt => rt.active);

  // Run all availability checks in parallel (one DB call each would be
  // expensive; we already fetched all reservations above via
  // countOverlappingBookings → getReservations).
  // Note: getReservations() is called once per countOverlappingBookings().
  // For a future optimisation, pass reservations as a param.
  // For now: correctness matches the original JSON version exactly.
  const results = await Promise.all(
    roomTypes.map(async rt => {
      const avail = await checkRoomTypeAvailability(rt, checkIn, checkOut);
      return {
        ...rt,
        availability: avail,
        fitsGuests: (adults <= rt.maxAdults) && ((adults + children) <= rt.maxGuests)
      };
    })
  );

  return results
    .filter(rt => rt.availability.available && rt.fitsGuests)
    .sort((a, b) => a.basePrice - b.basePrice);
}

/**
 * Validate that a specific room type is still available just before booking.
 * This is the "final check" to prevent race conditions (the true atomic
 * protection is inside create_reservation_atomic() on the DB side).
 *
 * @returns {Promise<{ ok: boolean, reason?: string, roomType?: Object }>}
 */
async function validateFinalAvailability(roomTypeId, checkIn, checkOut, adults, children) {
  const roomTypes = await getRoomTypes();
  const rt = roomTypes.find(r => r.id === roomTypeId);

  if (!rt) return { ok: false, reason: 'Room type not found.' };
  if (!rt.active) return { ok: false, reason: 'This room type is not currently available.' };

  const avail = await checkRoomTypeAvailability(rt, checkIn, checkOut);
  if (!avail.available) {
    return {
      ok:     false,
      reason: 'This room is no longer available for your selected dates. Please choose different dates or another room.'
    };
  }

  if (adults > rt.maxAdults || (adults + children) > rt.maxGuests) {
    return {
      ok:     false,
      reason: `This room accommodates a maximum of ${rt.maxAdults} adults and ${rt.maxGuests} guests total.`
    };
  }

  return { ok: true, roomType: rt };
}

/**
 * Calculate pricing for a reservation.
 * ALWAYS calculated server-side — never trust client-provided prices.
 * Remains synchronous (pure math — no DB calls).
 *
 * @param {number} basePrice   Per-night price from room type
 * @param {number} nights      Number of nights
 * @param {number} taxRate     Decimal e.g. 0.12 for 12%
 * @returns {{ subtotal, taxes, total, nights, basePrice }}
 */
function calculatePricing(basePrice, nights, taxRate = 0.12) {
  const subtotal = basePrice * nights;
  const taxes    = Math.round(subtotal * taxRate);
  const total    = subtotal + taxes;
  return { basePrice, nights, subtotal, taxes, total, taxRate };
}

/**
 * Get occupancy statistics for the admin dashboard.
 * @returns {Promise<{ totalRooms, occupiedToday, availableToday, arrivalsToday, departuresToday, ... }>}
 */
async function getOccupancyStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const [reservations, roomTypes] = await Promise.all([
    getReservations(),
    getRoomTypes()
  ]);

  const totalRooms = roomTypes.reduce((sum, rt) => sum + (rt.active ? rt.inventory : 0), 0);

  const activeToday = reservations.filter(r => {
    if (['cancelled', 'no-show'].includes(r.status)) return false;
    const ci = parseDate(r.checkIn);
    const co = parseDate(r.checkOut);
    return ci <= today && co > today;
  });

  const arrivalsToday = reservations.filter(r => {
    if (['cancelled', 'no-show'].includes(r.status)) return false;
    return r.checkIn === todayStr;
  });

  const departuresToday = reservations.filter(r => {
    if (['cancelled', 'no-show'].includes(r.status)) return false;
    return r.checkOut === todayStr;
  });

  const pendingReservations   = reservations.filter(r => r.status === 'pending');
  const confirmedReservations = reservations.filter(r => r.status === 'confirmed');

  return {
    totalRooms,
    occupiedToday:    activeToday.length,
    availableToday:   Math.max(0, totalRooms - activeToday.length),
    occupancyRate:    totalRooms > 0 ? Math.round((activeToday.length / totalRooms) * 100) : 0,
    arrivalsToday:    arrivalsToday.length,
    departuresToday:  departuresToday.length,
    pendingCount:     pendingReservations.length,
    confirmedCount:   confirmedReservations.length,
    activeReservations: activeToday
  };
}

module.exports = {
  countOverlappingBookings, checkRoomTypeAvailability,
  getAvailableRooms, validateFinalAvailability,
  calculatePricing, getOccupancyStats
};
