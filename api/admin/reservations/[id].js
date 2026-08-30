/**
 * SILVERLINE RESORT — Admin Single Reservation API
 * GET   /api/admin/reservations/[id]  — Get reservation detail
 * PATCH /api/admin/reservations/[id]  — Update reservation status
 * Requires: admin or staff role
 */

'use strict';

const { requireStaff, requireAdmin } = require('../../_lib/auth');
const { getReservationById, updateReservation, appendAuditLog } = require('../../_lib/db');
const { sendCancellationEmail } = require('../../_lib/email-mock');

const ALLOWED_STATUSES = ['confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show', 'pending'];

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireStaff(req, res);
  if (!user) return;

  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string' || id.length > 64) {
      return res.status(400).json({ error: 'Invalid reservation ID.' });
    }

    const reservation = getReservationById(id);
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    if (req.method === 'GET') {
      return res.status(200).json({ reservation });
    }

    if (req.method === 'PATCH') {
      const { status, specialRequests } = req.body || {};

      const updates = {};

      if (status !== undefined) {
        if (!ALLOWED_STATUSES.includes(status)) {
          return res.status(400).json({ error: 'Invalid status value.' });
        }
        // Cancellation requires admin or staff
        if (status === 'cancelled' && reservation.status !== 'cancelled') {
          // Only admin can cancel paid reservations
          if (reservation.paymentStatus === 'paid' && user.role !== 'admin') {
            return res.status(403).json({ error: 'Only an administrator can cancel a paid reservation.' });
          }
          // Send cancellation email
          sendCancellationEmail(reservation);
        }
        updates.status = status;
      }

      if (specialRequests !== undefined) {
        if (typeof specialRequests !== 'string' || specialRequests.length > 500) {
          return res.status(400).json({ error: 'Special requests must be under 500 characters.' });
        }
        updates.specialRequests = specialRequests.trim();
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
      }

      const updated = updateReservation(id, { ...updates, updatedBy: user.id });

      appendAuditLog({
        userId:     user.id,
        action:     'RESERVATION_UPDATED',
        resource:   'reservation',
        resourceId: id,
        meta:       { updates, changedBy: user.email }
      });

      return res.status(200).json({ success: true, reservation: updated });
    }

    return res.status(405).json({ error: 'Method not allowed.' });

  } catch (err) {
    console.error('[admin/reservations/[id]] Error:', err.message);
    return res.status(500).json({ error: 'Unable to update reservation.' });
  }
};
