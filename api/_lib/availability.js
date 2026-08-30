/**
 * SILVERLINE RESORT — Core Availability Engine
 *
 * The single source of truth for room availability.
 * This logic MUST run server-side — never trust client-provided availability.
 *
 * Overlap detection:
 *   A booking occupies dates [checkIn, checkOut).
 *   Check-out day is NOT occupied (a new guest can check in on that day).
 *   Two bookings overlap if:  newCheckIn < existingCheckOut && newCheckOut > existingCheckIn
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
 * @returns {number} overlapping confirmed bookings
 */
function countOverlappingBookings(roomTypeId, checkIn, checkOut) {
  const ci = parseDate(checkIn);
  const co = parseDate(checkOut);
  if (!ci || !co) return 0;

  const reservations = getReservations();
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
 * @param {Object} roomType  Full room type object from data
 * @param {string} checkIn
 * @param {string} checkOut
 * @returns {{ available: boolean, remainingRooms: number }}
 */
function checkRoomTypeAvailability(roomType, checkIn, checkOut) {
  const booked = countOverlappingBookings(roomType.id, checkIn, checkOut);
  const remaining = roomType.inventory - booked;
  return {
    available: remaining > 0,
    remainingRooms: Math.max(0, remaining),
    bookedRooms: booked,
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
 * @returns {Array} Available room types with availability metadata
 */
function getAvailableRooms(checkIn, checkOut, adults = 1, children = 0) {
  const roomTypes = getRoomTypes().filter(rt => rt.active);

  return roomTypes
    .map(rt => {
      const avail = checkRoomTypeAvailability(rt, checkIn, checkOut);
      return {
        ...rt,
        availability: avail,
        fitsGuests: (adults <= rt.maxAdults) && ((adults + children) <= rt.maxGuests)
      };
    })
    .filter(rt => rt.availability.available && rt.fitsGuests)
    .sort((a, b) => a.basePrice - b.basePrice);
}

/**
 * Validate that a specific room type is still available just before booking.
 * This is the "final check" to prevent race conditions.
 * Called at reservation creation time with the exact same inputs.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateFinalAvailability(roomTypeId, checkIn, checkOut, adults, children) {
  const roomTypes = getRoomTypes();
  const rt = roomTypes.find(r => r.id === roomTypeId);

  if (!rt) return { ok: false, reason: 'Room type not found.' };
  if (!rt.active) return { ok: false, reason: 'This room type is not currently available.' };

  const avail = checkRoomTypeAvailability(rt, checkIn, checkOut);
  if (!avail.available) {
    return { ok: false, reason: 'This room is no longer available for your selected dates. Please choose different dates or another room.' };
  }

  if (adults > rt.maxAdults || (adults + children) > rt.maxGuests) {
    return { ok: false, reason: `This room accommodates a maximum of ${rt.maxAdults} adults and ${rt.maxGuests} guests total.` };
  }

  return { ok: true, roomType: rt };
}

/**
 * Calculate pricing for a reservation.
 * ALWAYS calculated server-side — never trust client-provided prices.
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
 * @returns {{ totalRooms, occupiedToday, availableToday, arrivalsToday, departuresToday }}
 */
function getOccupancyStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const reservations = getReservations();
  const roomTypes    = getRoomTypes();

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

  const pendingReservations = reservations.filter(r => r.status === 'pending');
  const confirmedReservations = reservations.filter(r => r.status === 'confirmed');

  return {
    totalRooms,
    occupiedToday: activeToday.length,
    availableToday: Math.max(0, totalRooms - activeToday.length),
    occupancyRate: totalRooms > 0 ? Math.round((activeToday.length / totalRooms) * 100) : 0,
    arrivalsToday: arrivalsToday.length,
    departuresToday: departuresToday.length,
    pendingCount: pendingReservations.length,
    confirmedCount: confirmedReservations.length,
    activeReservations: activeToday
  };
}

module.exports = {
  countOverlappingBookings, checkRoomTypeAvailability,
  getAvailableRooms, validateFinalAvailability,
  calculatePricing, getOccupancyStats
};
