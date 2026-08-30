/**
 * SILVERLINE RESORT — Supabase Database Layer
 *
 * Replaces the JSON-file prototype persistence layer.
 * All exported function names are preserved exactly so callers need
 * minimal changes (adding `await` only).
 *
 * Key design decisions:
 *  - Uses service_role client (see supabase.js) → RLS bypassed server-side.
 *  - All functions are async and return camelCase objects.
 *  - Per-entity mapper functions convert snake_case DB columns → camelCase.
 *  - PGRST116 errors ("not found" from .single()) return null, not a throw.
 *  - createReservation() calls create_reservation_atomic() RPC which atomically
 *    inserts both the reservation AND the payment record in one transaction.
 *  - createPaymentRecord() is a no-op stub — payment is already inserted by
 *    the RPC. Do NOT attempt a second INSERT (would cause PK conflict).
 */

'use strict';

const supabase = require('./supabase');

// ─── Mapper Helpers (snake_case DB → camelCase JS) ─────────────────────────

function mapReservation(row) {
  if (!row) return null;
  return {
    id:               row.id,
    bookingReference: row.booking_reference,
    guestId:          row.guest_id,
    guestName:        row.guest_name,
    guestEmail:       row.guest_email,
    guestPhone:       row.guest_phone,
    roomTypeId:       row.room_type_id,
    roomTypeName:     row.room_type_name,
    checkIn:          row.check_in,
    checkOut:         row.check_out,
    nights:           row.nights,
    adults:           row.adults,
    children:         row.children,
    specialRequests:  row.special_requests,
    basePrice:        row.base_price,
    subtotal:         row.subtotal,
    taxes:            row.taxes,
    total:            row.total,
    taxRate:          row.tax_rate !== undefined ? parseFloat(row.tax_rate) : 0.12,
    currency:         row.currency,
    status:           row.status,
    paymentStatus:    row.payment_status,
    paymentProvider:  row.payment_provider,
    paymentReference: row.payment_reference,
    updatedBy:        row.updated_by,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at
  };
}

function mapGuest(row) {
  if (!row) return null;
  return {
    id:        row.id,
    name:      row.name,
    email:     row.email,
    phone:     row.phone,
    address:   row.address,
    notes:     row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapUser(row) {
  if (!row) return null;
  return {
    id:           row.id,
    name:         row.name,
    email:        row.email,
    role:         row.role,
    passwordHash: row.password_hash,
    active:       row.active,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at
  };
}

function mapRoomType(row) {
  if (!row) return null;
  return {
    id:               row.id,
    name:             row.name,
    slug:             row.slug,
    type:             row.type,
    description:      row.description,
    shortDescription: row.short_description,
    image:            row.image,
    images:           row.images || [],
    imageAlt:         row.image_alt,
    basePrice:        row.base_price,
    maxAdults:        row.max_adults,
    maxChildren:      row.max_children,
    maxGuests:        row.max_guests,
    bedConfiguration: row.bed_configuration,
    roomSize:         row.room_size,
    floor:            row.floor,
    view:             row.view,
    amenities:        row.amenities || [],
    highlights:       row.highlights || [],
    inventory:        row.inventory,
    active:           row.active,
    sortOrder:        row.sort_order
  };
}

function mapPayment(row) {
  if (!row) return null;
  return {
    id:               row.id,
    reservationId:    row.reservation_id,
    bookingReference: row.booking_reference,
    provider:         row.provider,
    orderId:          row.order_id,
    transactionId:    row.transaction_id,
    amount:           row.amount,
    currency:         row.currency,
    status:           row.status,
    testMode:         row.test_mode,
    createdAt:        row.created_at
  };
}

// ─── Reservations ──────────────────────────────────────────────────────────

async function getReservations() {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`[db] getReservations: ${error.message}`);
  return (data || []).map(mapReservation);
}

async function getReservationById(id) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[db] getReservationById: ${error.message}`);
  }
  return mapReservation(data);
}

async function getReservationByRef(ref) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('booking_reference', ref)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[db] getReservationByRef: ${error.message}`);
  }
  return mapReservation(data);
}

/**
 * createReservation — calls create_reservation_atomic() RPC.
 *
 * The RPC atomically:
 *  1. Acquires a row-level lock on the room_type row (prevents double-booking)
 *  2. Counts overlapping bookings inside the lock
 *  3. Inserts the reservation row
 *  4. Inserts the payment row
 *
 * data must include these extra fields beyond the reservation fields:
 *   _paymentId       — UUID for the payments row (from uuidv4() in reservations.js)
 *   _orderId         — payment gateway order ID
 *   _transactionId   — payment gateway transaction ID
 *   _amountPaise     — amount in paise (pricing.total * 100)
 *
 * Returns the data object (caller shape preserved), throws on DB error,
 * throws with rpcResult attached if RPC returns ok:false.
 */
async function createReservation(data) {
  const { data: result, error } = await supabase.rpc('create_reservation_atomic', {
    p_id:                data.id,
    p_booking_reference: data.bookingReference,
    p_guest_id:          data.guestId,
    p_guest_name:        data.guestName,
    p_guest_email:       data.guestEmail,
    p_guest_phone:       data.guestPhone,
    p_room_type_id:      data.roomTypeId,
    p_room_type_name:    data.roomTypeName,
    p_check_in:          data.checkIn,
    p_check_out:         data.checkOut,
    p_nights:            data.nights,
    p_adults:            data.adults,
    p_children:          data.children,
    p_special_requests:  data.specialRequests || '',
    p_base_price:        data.basePrice,
    p_subtotal:          data.subtotal,
    p_taxes:             data.taxes,
    p_total:             data.total,
    p_tax_rate:          data.taxRate,
    p_payment_id:        data._paymentId,
    p_payment_provider:  data.paymentProvider,
    p_payment_reference: data.paymentReference,
    p_order_id:          data._orderId,
    p_transaction_id:    data._transactionId,
    p_amount:            data._amountPaise,
    p_test_mode:         true
  });

  if (error) throw new Error(`[db] createReservation RPC error: ${error.message}`);

  if (!result || !result.ok) {
    const rpcErr = new Error((result && result.reason) || 'Booking failed.');
    rpcErr.rpcResult = result;
    rpcErr.code      = (result && result.code) || 'BOOKING_FAILED';
    throw rpcErr;
  }

  return data; // Return the original object — caller uses it to build response
}

async function updateReservation(id, updates) {
  // Map camelCase updates → snake_case columns
  const dbUpdates = {};
  if (updates.status        !== undefined) dbUpdates.status         = updates.status;
  if (updates.specialRequests !== undefined) dbUpdates.special_requests = updates.specialRequests;
  if (updates.updatedBy     !== undefined) dbUpdates.updated_by      = updates.updatedBy;

  const { data, error } = await supabase
    .from('reservations')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[db] updateReservation: ${error.message}`);
  }
  return mapReservation(data);
}

// ─── Guests ────────────────────────────────────────────────────────────────

async function getGuests() {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`[db] getGuests: ${error.message}`);
  return (data || []).map(mapGuest);
}

async function getGuestById(id) {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[db] getGuestById: ${error.message}`);
  }
  return mapGuest(data);
}

async function getGuestByEmail(email) {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .ilike('email', email)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[db] getGuestByEmail: ${error.message}`);
  }
  return mapGuest(data);
}

async function upsertGuest(guestData) {
  const dbRow = {
    name:  guestData.name,
    email: guestData.email,
    phone: guestData.phone
  };
  // Only include optional fields if provided
  if (guestData.address !== undefined) dbRow.address = guestData.address;
  if (guestData.notes   !== undefined) dbRow.notes   = guestData.notes;

  const { data, error } = await supabase
    .from('guests')
    .upsert(dbRow, { onConflict: 'email' })
    .select()
    .single();

  if (error) throw new Error(`[db] upsertGuest: ${error.message}`);
  return mapGuest(data);
}

// ─── Users (Admin) ─────────────────────────────────────────────────────────

async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*');
  if (error) throw new Error(`[db] getUsers: ${error.message}`);
  return (data || []).map(mapUser);
}

async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', email)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[db] getUserByEmail: ${error.message}`);
  }
  return mapUser(data);
}

async function getUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[db] getUserById: ${error.message}`);
  }
  return mapUser(data);
}

// ─── Payments ──────────────────────────────────────────────────────────────

async function getPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`[db] getPayments: ${error.message}`);
  return (data || []).map(mapPayment);
}

/**
 * createPaymentRecord — NO-OP STUB
 *
 * The payment row is already created atomically inside
 * create_reservation_atomic() RPC. Attempting a second INSERT
 * with the same UUID would cause a primary-key conflict.
 *
 * This stub returns the input object unchanged so api/reservations.js
 * needs zero changes (it still calls createPaymentRecord for audit
 * logging / email purposes).
 */
async function createPaymentRecord(payment) {
  // Payment already inserted by create_reservation_atomic() RPC.
  // DO NOT insert again.
  return payment;
}

// ─── Room Types ────────────────────────────────────────────────────────────

async function getRoomTypes() {
  const { data, error } = await supabase
    .from('room_types')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`[db] getRoomTypes: ${error.message}`);
  return (data || []).map(mapRoomType);
}

async function getRoomTypeById(id) {
  const { data, error } = await supabase
    .from('room_types')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[db] getRoomTypeById: ${error.message}`);
  }
  return mapRoomType(data);
}

async function updateRoomType(id, updates) {
  // Map camelCase updates → snake_case columns
  const dbUpdates = {};
  if (updates.basePrice  !== undefined) dbUpdates.base_price = updates.basePrice;
  if (updates.inventory  !== undefined) dbUpdates.inventory  = updates.inventory;
  if (updates.active     !== undefined) dbUpdates.active      = updates.active;

  const { data, error } = await supabase
    .from('room_types')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[db] updateRoomType: ${error.message}`);
  }
  return mapRoomType(data);
}

// ─── Settings ──────────────────────────────────────────────────────────────

/**
 * getSettings — returns the settings object in the same shape as
 * the old settings.json: { hotel:{...}, pricing:{...}, notifications:{...}, ota:{...}, payment:{...} }
 * The `id` column (singleton guard) is stripped.
 */
async function getSettings() {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) throw new Error(`[db] getSettings: ${error.message}`);
  const { id: _id, updated_at: _ua, ...sections } = data;
  return sections; // { hotel, pricing, notifications, ota, payment }
}

/**
 * updateSettings — fetch-merge-update strategy.
 * One-level deep merge matching the old JSON behaviour.
 */
async function updateSettings(updates) {
  const current = await getSettings();
  // Deep merge (one level) — identical logic to old JSON version
  const merged = Object.keys(updates).reduce((acc, key) => {
    if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
      acc[key] = { ...(current[key] || {}), ...updates[key] };
    } else {
      acc[key] = updates[key];
    }
    return acc;
  }, { ...current });

  const { error } = await supabase
    .from('settings')
    .update(merged)
    .eq('id', 1);

  if (error) throw new Error(`[db] updateSettings: ${error.message}`);
  return merged;
}

// ─── Audit Logs ────────────────────────────────────────────────────────────

async function appendAuditLog(entry) {
  const row = {
    user_id:     entry.userId   || null,
    action:      entry.action,
    resource:    entry.resource,
    resource_id: entry.resourceId ? String(entry.resourceId) : null,
    meta:        entry.meta     || null
    // timestamp defaults to now() in the DB
  };

  const { error } = await supabase
    .from('audit_logs')
    .insert(row);

  if (error) {
    // Audit log failures must NEVER crash the main request
    console.error('[db] appendAuditLog error (non-fatal):', error.message);
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────
// Identical export names to the old JSON db.js so all callers work unchanged.

module.exports = {
  getReservations, getReservationById, getReservationByRef,
  createReservation, updateReservation,
  getGuests, getGuestById, getGuestByEmail, upsertGuest,
  getUsers, getUserByEmail, getUserById,
  getPayments, createPaymentRecord,
  getRoomTypes, getRoomTypeById, updateRoomType,
  getSettings, updateSettings,
  appendAuditLog
};
