/**
 * SILVERLINE RESORT — JSON File Database Layer
 * Prototype persistence using JSON files in /data/.
 * All reads/writes are synchronous to avoid race conditions in serverless.
 *
 * Production upgrade path: Replace read/write functions with
 * your ORM (Prisma + PostgreSQL, Mongoose + MongoDB, etc.)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Resolve /data relative to the project root (two levels up from api/_lib/)
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');

/**
 * Read a JSON data file.
 * @param {string} filename  e.g. 'reservations.json'
 * @returns {Array|Object}
 */
function readJson(filename) {
  const fp = path.join(DATA_DIR, filename);
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(`DB read error (${filename}): ${err.message}`);
  }
}

/**
 * Write a JSON data file atomically (write-then-rename pattern).
 * @param {string} filename
 * @param {Array|Object} data
 */
function writeJson(filename, data) {
  const fp    = path.join(DATA_DIR, filename);
  const tmpFp = fp + '.tmp';
  fs.writeFileSync(tmpFp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFp, fp);
}

// ─── Reservations ──────────────────────────────────────────────────────────

function getReservations() {
  return readJson('reservations.json') || [];
}

function saveReservations(reservations) {
  writeJson('reservations.json', reservations);
}

function getReservationById(id) {
  return getReservations().find(r => r.id === id) || null;
}

function getReservationByRef(ref) {
  return getReservations().find(r => r.bookingReference === ref) || null;
}

function createReservation(reservation) {
  const all = getReservations();
  all.push(reservation);
  saveReservations(all);
  return reservation;
}

function updateReservation(id, updates) {
  const all = getReservations();
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  saveReservations(all);
  return all[idx];
}

// ─── Guests ────────────────────────────────────────────────────────────────

function getGuests() {
  return readJson('guests.json') || [];
}

function saveGuests(guests) {
  writeJson('guests.json', guests);
}

function getGuestById(id) {
  return getGuests().find(g => g.id === id) || null;
}

function getGuestByEmail(email) {
  return getGuests().find(g => g.email.toLowerCase() === email.toLowerCase()) || null;
}

function upsertGuest(guestData) {
  const all = getGuests();
  const idx = all.findIndex(g => g.email.toLowerCase() === guestData.email.toLowerCase());
  if (idx === -1) {
    all.push(guestData);
    saveGuests(all);
    return guestData;
  }
  all[idx] = { ...all[idx], ...guestData, updatedAt: new Date().toISOString() };
  saveGuests(all);
  return all[idx];
}

// ─── Users (Admin) ─────────────────────────────────────────────────────────

function getUsers() {
  return readJson('users.json') || [];
}

function getUserByEmail(email) {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

function getUserById(id) {
  return getUsers().find(u => u.id === id) || null;
}

// ─── Payments ──────────────────────────────────────────────────────────────

function getPayments() {
  return readJson('payments.json') || [];
}

function createPaymentRecord(payment) {
  const all = getPayments();
  all.push(payment);
  writeJson('payments.json', all);
  return payment;
}

// ─── Room Types ────────────────────────────────────────────────────────────

function getRoomTypes() {
  return readJson('room-types.json') || [];
}

function getRoomTypeById(id) {
  return getRoomTypes().find(r => r.id === id) || null;
}

function updateRoomType(id, updates) {
  const all = getRoomTypes();
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...updates };
  writeJson('room-types.json', all);
  return all[idx];
}

// ─── Settings ──────────────────────────────────────────────────────────────

function getSettings() {
  return readJson('settings.json') || {};
}

function updateSettings(updates) {
  const current = getSettings();
  // Deep merge (one level)
  const merged = Object.keys(updates).reduce((acc, key) => {
    if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
      acc[key] = { ...(current[key] || {}), ...updates[key] };
    } else {
      acc[key] = updates[key];
    }
    return acc;
  }, { ...current });
  writeJson('settings.json', merged);
  return merged;
}

// ─── Audit Logs ────────────────────────────────────────────────────────────

function appendAuditLog(entry) {
  const all = readJson('audit-logs.json') || [];
  all.push({ ...entry, timestamp: new Date().toISOString() });
  // Keep last 10,000 entries to prevent unbounded growth
  const trimmed = all.slice(-10000);
  writeJson('audit-logs.json', trimmed);
}

module.exports = {
  getReservations, saveReservations, getReservationById, getReservationByRef,
  createReservation, updateReservation,
  getGuests, getGuestById, getGuestByEmail, upsertGuest,
  getUsers, getUserByEmail, getUserById,
  getPayments, createPaymentRecord,
  getRoomTypes, getRoomTypeById, updateRoomType,
  getSettings, updateSettings,
  appendAuditLog
};
