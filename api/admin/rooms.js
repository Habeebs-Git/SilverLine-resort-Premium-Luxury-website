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
      const roomTypes = await getRoomTypes();
      const today    = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      // Check today's availability for each room type in parallel
      const result = await Promise.all(
        roomTypes.map(async rt => {
          const avail = await checkRoomTypeAvailability(rt, today, tomorrow);
          return { ...rt, todayAvailability: avail };
        })
      );

      return res.status(200).json({ roomTypes: result });
    } catch (err) {
      console.error('[admin/rooms] Error:', err.message);
      return res.status(500).json({ error: 'Unable to load rooms.' });
    }
  }

  if (req.method === 'PATCH') {
    // Staff and admins can change room config/pricing/images
    const user = requireStaff(req, res);
    if (!user) return;

    try {
      const { id, basePrice, inventory, active, name, image, shortDescription, bedConfiguration, roomSize, view } = req.body || {};

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

      const setStringField = (field, val, fieldName) => {
        if (val === undefined) return null;
        if (typeof val !== 'string') return `${fieldName} must be a string.`;
        updates[field] = val.trim();
        return null;
      };

      if (active !== undefined) updates.active = Boolean(active);

      let err;
      if ((err = setStringField('name', name, 'Name'))) return res.status(400).json({ error: err });
      if ((err = setStringField('image', image, 'Image'))) return res.status(400).json({ error: err });
      if ((err = setStringField('shortDescription', shortDescription, 'Short Description'))) return res.status(400).json({ error: err });
      if ((err = setStringField('bedConfiguration', bedConfiguration, 'Bed Configuration'))) return res.status(400).json({ error: err });
      if ((err = setStringField('roomSize', roomSize, 'Room Size'))) return res.status(400).json({ error: err });
      if ((err = setStringField('view', view, 'View'))) return res.status(400).json({ error: err });

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
      }

      const updated = await updateRoomType(id, updates);
      if (!updated) return res.status(404).json({ error: 'Room type not found.' });

      if (updates.basePrice !== undefined) {
        syncPricing(id, updates.basePrice);
      }

      await appendAuditLog({
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

  if (req.method === 'POST') {
    const user = requireStaff(req, res);
    if (!user) return;
    try {
      const { createRoomType } = require('../_lib/db');
      const body = req.body || {};

      const stringFields = ['name', 'image', 'shortDescription', 'bedConfiguration', 'roomSize', 'view'];
      for (const field of stringFields) {
        if (body[field] !== undefined && typeof body[field] !== 'string') {
          return res.status(400).json({ error: `${field} must be a string.` });
        }
      }

      const newRoom = await createRoomType({
        name: body.name ? body.name.trim() : 'New Room',
        slug: body.name ? body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'new-room-' + Date.now(),
        image: body.image ? body.image.trim() : '/images/room-placeholder.jpg',
        basePrice: parseInt(body.basePrice, 10) || 3000,
        inventory: parseInt(body.inventory, 10) || 1,
        active: body.active !== undefined ? Boolean(body.active) : true,
        shortDescription: body.shortDescription ? body.shortDescription.trim() : '',
        bedConfiguration: body.bedConfiguration ? body.bedConfiguration.trim() : '',
        roomSize: body.roomSize ? body.roomSize.trim() : '',
        view: body.view ? body.view.trim() : ''
      });
      
      await appendAuditLog({
        userId: user.id, action: 'ROOM_TYPE_CREATED', resource: 'room_type', resourceId: newRoom.id, meta: { changedBy: user.email }
      });
      return res.status(201).json({ success: true, roomType: newRoom });
    } catch (err) {
      console.error('[admin/rooms] POST Error:', err.message);
      return res.status(500).json({ error: 'Unable to create room.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};
