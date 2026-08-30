/**
 * SILVERLINE RESORT — Admin Rooms API
 * GET   /api/admin/rooms           — List all room types
 * PATCH /api/admin/rooms           — Update room type (admin only)
 */

'use strict';

const { requireStaff, requireAdmin } = require('../_lib/auth');
const { getRoomTypes, updateRoomType, getReservations, appendAuditLog } = require('../_lib/db');
const { checkRoomTypeAvailability } = require('../_lib/availability');
const { syncPricing } = require('../_lib/ota-adapters');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const user = requireStaff(req, res);
    if (!user) return;

    try {
      const roomTypes = getRoomTypes();
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const result = roomTypes.map(rt => {
        const avail = checkRoomTypeAvailability(rt, today, tomorrow);
        return {
          ...rt,
          todayAvailability: avail
        };
      });

      return res.status(200).json({ roomTypes: result });
    } catch (err) {
      return res.status(500).json({ error: 'Unable to load rooms.' });
    }
  }

  if (req.method === 'PATCH') {
    // Only admins can change room config/pricing
    const user = requireAdmin(req, res);
    if (!user) return;

    try {
      const { id, basePrice, inventory, active } = req.body || {};

      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Room type ID required.' });
      }

      const updates = {};

      if (basePrice !== undefined) {
        const p = parseInt(basePrice, 10);
        if (isNaN(p) || p < 500 || p > 500000) {
          return res.status(400).json({ error: 'Price must be between ₹500 and ₹5,00,000.' });
        }
        updates.basePrice = p;
      }

      if (inventory !== undefined) {
        const inv = parseInt(inventory, 10);
        if (isNaN(inv) || inv < 0 || inv > 100) {
          return res.status(400).json({ error: 'Inventory must be between 0 and 100.' });
        }
        updates.inventory = inv;
      }

      if (active !== undefined) {
        updates.active = Boolean(active);
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
      }

      const updated = updateRoomType(id, updates);
      if (!updated) return res.status(404).json({ error: 'Room type not found.' });

      if (updates.basePrice !== undefined) {
        syncPricing(id, updates.basePrice);
      }

      appendAuditLog({
        userId:     user.id,
        action:     'ROOM_TYPE_UPDATED',
        resource:   'room_type',
        resourceId: id,
        meta:       { updates, changedBy: user.email }
      });

      return res.status(200).json({ success: true, roomType: updated });
    } catch (err) {
      console.error('[admin/rooms] Error:', err.message);
      return res.status(500).json({ error: 'Unable to update room.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};
