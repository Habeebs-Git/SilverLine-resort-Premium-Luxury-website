/**
 * SILVERLINE RESORT — Admin Reservations API
 * GET  /api/admin/reservations  — List/search reservations
 * Requires: admin or staff role
 */

'use strict';

const { requireStaff }     = require('../_lib/auth');
const { getReservations, updateReservation, appendAuditLog } = require('../_lib/db');
const { sendCancellationEmail } = require('../_lib/email-mock');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireStaff(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      let reservations = getReservations();

      // ── Filters
      const { status, search, checkIn, checkOut, page = '1', limit = '20' } = req.query;

      if (status && status !== 'all') {
        reservations = reservations.filter(r => r.status === status);
      }
      if (search) {
        const q = search.toLowerCase();
        reservations = reservations.filter(r =>
          r.bookingReference?.toLowerCase().includes(q) ||
          r.guestName?.toLowerCase().includes(q) ||
          r.guestEmail?.toLowerCase().includes(q) ||
          r.roomTypeName?.toLowerCase().includes(q)
        );
      }
      if (checkIn) {
        reservations = reservations.filter(r => r.checkIn >= checkIn);
      }
      if (checkOut) {
        reservations = reservations.filter(r => r.checkOut <= checkOut);
      }

      // ── Sort by created date descending
      reservations = reservations
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // ── Pagination
      const pageNum  = Math.max(1, parseInt(page, 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const total    = reservations.length;
      const paged    = reservations.slice((pageNum - 1) * pageSize, pageNum * pageSize);

      return res.status(200).json({
        reservations: paged.map(r => ({
          id:               r.id,
          bookingReference: r.bookingReference,
          guestName:        r.guestName,
          guestEmail:       r.guestEmail,
          guestPhone:       r.guestPhone,
          roomTypeName:     r.roomTypeName,
          checkIn:          r.checkIn,
          checkOut:         r.checkOut,
          nights:           r.nights,
          adults:           r.adults,
          children:         r.children,
          total:            r.total,
          status:           r.status,
          paymentStatus:    r.paymentStatus,
          createdAt:        r.createdAt,
          updatedAt:        r.updatedAt
        })),
        pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) }
      });
    }

    if (req.method === 'PATCH') {
      // Bulk status update (e.g., check-in multiple)
      const { ids, status } = req.body || {};
      const ALLOWED_STATUSES = ['confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show', 'pending'];

      if (!Array.isArray(ids) || !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid bulk update parameters.' });
      }

      const results = ids.map(id => {
        const updated = updateReservation(id, { status, updatedBy: user.id });
        if (updated) {
          appendAuditLog({
            userId:     user.id,
            action:     `RESERVATION_STATUS_CHANGED`,
            resource:   'reservation',
            resourceId: id,
            meta:       { newStatus: status, changedBy: user.email }
          });
        }
        return { id, ok: !!updated };
      });

      return res.status(200).json({ updated: results });
    }

    return res.status(405).json({ error: 'Method not allowed.' });

  } catch (err) {
    console.error('[admin/reservations] Error:', err.message);
    return res.status(500).json({ error: 'Unable to load reservations.' });
  }
};
