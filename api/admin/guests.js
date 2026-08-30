/**
 * SILVERLINE RESORT — Admin Guests API
 * GET /api/admin/guests
 * Requires: admin or staff role
 */

'use strict';

const { requireStaff } = require('../_lib/auth');
const { getGuests, getReservations } = require('../_lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const user = requireStaff(req, res);
  if (!user) return;

  try {
    let guests       = getGuests();
    const reservations = getReservations();

    const { search, page = '1', limit = '20' } = req.query;

    if (search) {
      const q = search.toLowerCase();
      guests = guests.filter(g =>
        g.name?.toLowerCase().includes(q) ||
        g.email?.toLowerCase().includes(q) ||
        g.phone?.includes(q)
      );
    }

    // Attach reservation history to each guest
    const enriched = guests.map(g => {
      const guestReservations = reservations
        .filter(r => r.guestId === g.id || r.guestEmail?.toLowerCase() === g.email?.toLowerCase())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(r => ({
          bookingReference: r.bookingReference,
          roomTypeName:     r.roomTypeName,
          checkIn:          r.checkIn,
          checkOut:         r.checkOut,
          nights:           r.nights,
          total:            r.total,
          status:           r.status
        }));

      return {
        id:          g.id,
        name:        g.name,
        email:       g.email,
        phone:       g.phone,
        address:     g.address,
        notes:       g.notes,
        totalStays:  guestReservations.filter(r => ['confirmed','checked-in','checked-out'].includes(r.status)).length,
        lifetimeValue: guestReservations
          .filter(r => !['cancelled','pending'].includes(r.status))
          .reduce((sum, r) => sum + (r.total || 0), 0),
        reservations: guestReservations,
        createdAt:   g.createdAt
      };
    });

    const pageNum  = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const total    = enriched.length;
    const paged    = enriched.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    return res.status(200).json({
      guests: paged,
      pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) }
    });

  } catch (err) {
    console.error('[admin/guests] Error:', err.message);
    return res.status(500).json({ error: 'Unable to load guests.' });
  }
};
