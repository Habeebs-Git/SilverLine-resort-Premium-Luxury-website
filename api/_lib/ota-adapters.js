/**
 * SILVERLINE RESORT — OTA Channel Manager Adapter Layer
 *
 * ⚠ DEMO / PROTOTYPE ONLY
 * All OTA integrations are mocked. No real API calls are made.
 *
 * Production upgrade path:
 *   1. Integrate a channel manager (SiteMinder, Cloudbeds, eZee Centrix)
 *   2. Or implement direct OTA APIs (requires commercial agreements)
 *   3. Replace mock methods with real API calls
 *
 * Architecture (maintained across mock and live):
 *
 *   Website Booking Engine
 *         ↓
 *   Reservation Service (api/reservations.js)
 *         ↓
 *   Central Availability Engine (api/_lib/availability.js)
 *         ↓
 *   Channel Manager Adapter (this file)
 *         ↓
 *   OTA integrations (Agoda, ixigo, Booking.com)
 */

'use strict';

/**
 * Sync availability update to all configured OTA channels.
 * Called after a reservation is created, modified, or cancelled.
 *
 * @param {string} roomTypeId
 * @param {string} checkIn    YYYY-MM-DD
 * @param {string} checkOut   YYYY-MM-DD
 * @param {number} delta      Positive = inventory added, Negative = inventory reduced
 */
function syncAvailability(roomTypeId, checkIn, checkOut, delta) {
  console.log(`[MOCK OTA] Availability sync: ${roomTypeId} | ${checkIn} → ${checkOut} | delta: ${delta}`);
  console.log('[MOCK OTA] Would notify: Agoda, ixigo, Booking.com — NOT IMPLEMENTED (mock)');
  return { synced: false, mock: true, channels: ['agoda', 'ixigo'], note: 'Mock — no real OTA call made' };
}

/**
 * Import a reservation from an OTA channel.
 * In production, this would be called by an inbound webhook from the channel manager.
 *
 * @param {Object} otaReservation   The reservation data from the OTA
 * @param {string} channel          e.g. 'agoda', 'ixigo', 'booking.com'
 */
function importOtaReservation(otaReservation, channel) {
  console.log(`[MOCK OTA] Would import reservation from ${channel}:`, otaReservation);
  return {
    imported: false,
    mock: true,
    note: `Mock — OTA import from ${channel} not implemented in prototype`
  };
}

/**
 * Export a reservation to OTA (e.g., when a direct booking is made and
 * inventory needs to be blocked on OTA channels).
 */
function exportReservation(reservation) {
  console.log(`[MOCK OTA] Would export reservation ${reservation.bookingReference} to OTA channels`);
  return { exported: false, mock: true };
}

/**
 * Cancel a reservation on OTA channels.
 */
function cancelOtaReservation(bookingReference, channel) {
  console.log(`[MOCK OTA] Would cancel ${bookingReference} on ${channel || 'all channels'}`);
  return { cancelled: false, mock: true };
}

/**
 * Update pricing on OTA channels.
 * Called when admin changes room pricing.
 */
function syncPricing(roomTypeId, newPrice) {
  console.log(`[MOCK OTA] Would sync new price for ${roomTypeId}: ₹${newPrice}/night to OTA channels`);
  return { synced: false, mock: true };
}

module.exports = {
  syncAvailability, importOtaReservation,
  exportReservation, cancelOtaReservation, syncPricing
};
