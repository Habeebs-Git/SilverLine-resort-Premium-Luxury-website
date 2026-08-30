/**
 * SILVERLINE RESORT — Admin Settings API
 * GET   /api/admin/settings  — Get current settings (admin only)
 * PATCH /api/admin/settings  — Update settings (admin only)
 */

'use strict';

const { requireAdmin }         = require('../_lib/auth');
const { getSettings, updateSettings, appendAuditLog } = require('../_lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAdmin(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const settings = getSettings();
      // Return hotel, pricing, notifications — omit OTA keys and payment secrets
      return res.status(200).json({ settings: {
        hotel:         settings.hotel         || {},
        pricing:       settings.pricing       || {},
        notifications: settings.notifications || {}
      }});
    }

    // Accept both PATCH and PUT for compatibility
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const { hotel, pricing } = req.body || {};
      const current = getSettings();
      const updates = {};

      if (hotel && typeof hotel === 'object') {
        const currentHotel = current.hotel || {};
        const newHotel = { ...currentHotel };

        if (hotel.name     && typeof hotel.name === 'string')     newHotel.name         = hotel.name.trim().slice(0, 100);
        if (hotel.phone    && typeof hotel.phone === 'string')     newHotel.phone        = hotel.phone.trim().slice(0, 30);
        if (hotel.email    && typeof hotel.email === 'string')     newHotel.email        = hotel.email.trim().slice(0, 200);
        if (hotel.address  && typeof hotel.address === 'string')   newHotel.address      = hotel.address.trim().slice(0, 300);
        if (hotel.checkInTime  && /^\d{2}:\d{2}$/.test(hotel.checkInTime))  newHotel.checkInTime  = hotel.checkInTime;
        if (hotel.checkOutTime && /^\d{2}:\d{2}$/.test(hotel.checkOutTime)) newHotel.checkOutTime = hotel.checkOutTime;

        updates.hotel = newHotel;
      }

      if (pricing && typeof pricing === 'object') {
        const currentPricing = current.pricing || {};
        const newPricing = { ...currentPricing };

        if (pricing.taxRate !== undefined) {
          const tr = parseFloat(pricing.taxRate);
          if (isNaN(tr) || tr < 0 || tr > 0.5) {
            return res.status(400).json({ error: 'Tax rate must be between 0 and 50%.' });
          }
          newPricing.taxRate = tr;
        }
        if (pricing.taxLabel && typeof pricing.taxLabel === 'string') {
          newPricing.taxLabel = pricing.taxLabel.trim().slice(0, 50);
        }
        if (pricing.minNights !== undefined) {
          const mn = parseInt(pricing.minNights, 10);
          if (!isNaN(mn) && mn >= 1 && mn <= 30) newPricing.minNights = mn;
        }
        if (pricing.advanceBookingDays !== undefined) {
          const abd = parseInt(pricing.advanceBookingDays, 10);
          if (!isNaN(abd) && abd >= 1 && abd <= 730) newPricing.advanceBookingDays = abd;
        }

        updates.pricing = newPricing;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
      }

      const updated = updateSettings(updates);

      appendAuditLog({
        userId:   user.id,
        action:   'SETTINGS_UPDATED',
        resource: 'settings',
        meta:     { changedBy: user.email, keys: Object.keys(updates) }
      });

      return res.status(200).json({ success: true, settings: {
        hotel:   updated.hotel   || {},
        pricing: updated.pricing || {}
      }});
    }

    return res.status(405).json({ error: 'Method not allowed.' });

  } catch (err) {
    console.error('[admin/settings] Error:', err.message);
    return res.status(500).json({ error: 'Unable to update settings.' });
  }
};
