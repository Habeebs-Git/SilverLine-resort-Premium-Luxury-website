/**
 * SILVERLINE RESORT — Admin Dashboard API
 * GET /api/admin/dashboard
 * Requires: admin or staff role
 */

'use strict';

const { requireStaff }   = require('../_lib/auth');
const { getReservations, getRoomTypes, getGuests, getSettings } = require('../_lib/db');
const { getOccupancyStats, calculatePricing } = require('../_lib/availability');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const user = requireStaff(req, res);
  if (!user) return;

  try {
    const reservations = getReservations();
    const roomTypes    = getRoomTypes();
    const guests       = getGuests();
    const settings     = getSettings();

    // ── Occupancy stats
    const occupancy = getOccupancyStats();

    // ── Revenue calculations
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    function revenueFor(since) {
      return reservations
        .filter(r => !['cancelled', 'pending'].includes(r.status) && r.paymentStatus === 'paid')
        .filter(r => new Date(r.createdAt) >= since)
        .reduce((sum, r) => sum + (r.total || 0), 0);
    }

    // ── Recent bookings (last 10)
    const recentBookings = reservations
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10)
      .map(r => ({
        bookingReference: r.bookingReference,
        guestName:        r.guestName,
        roomTypeName:     r.roomTypeName,
        checkIn:          r.checkIn,
        checkOut:         r.checkOut,
        nights:           r.nights,
        total:            r.total,
        status:           r.status,
        paymentStatus:    r.paymentStatus,
        createdAt:        r.createdAt
      }));

    // ── Room type summary
    const roomSummary = roomTypes
      .filter(rt => rt.active)
      .map(rt => {
        const activeBookings = reservations.filter(r =>
          r.roomTypeId === rt.id && !['cancelled', 'no-show'].includes(r.status)
        );
        return {
          id:          rt.id,
          name:        rt.name,
          inventory:   rt.inventory,
          basePrice:   rt.basePrice,
          activeBookings: activeBookings.length
        };
      });

    return res.status(200).json({
      occupancy: {
        total:        occupancy.totalRooms,
        occupied:     occupancy.occupiedToday,
        available:    occupancy.availableToday,
        rate:         occupancy.occupancyRate,
        arrivalsToday: occupancy.arrivalsToday,
        departuresToday: occupancy.departuresToday,
        pendingCount: occupancy.pendingCount,
        confirmedCount: occupancy.confirmedCount
      },
      revenue: {
        today:   revenueFor(today),
        week:    revenueFor(startOfWeek),
        month:   revenueFor(startOfMonth),
        allTime: reservations
          .filter(r => !['cancelled', 'pending'].includes(r.status) && r.paymentStatus === 'paid')
          .reduce((sum, r) => sum + (r.total || 0), 0)
      },
      recentBookings,
      roomSummary,
      totals: {
        reservations: reservations.length,
        guests:       guests.length,
        roomTypes:    roomTypes.filter(rt => rt.active).length
      },
      hotelName: settings?.hotel?.name || 'Silverline Resort'
    });

  } catch (err) {
    console.error('[admin/dashboard] Error:', err.message);
    return res.status(500).json({ error: 'Unable to load dashboard data.' });
  }
};
