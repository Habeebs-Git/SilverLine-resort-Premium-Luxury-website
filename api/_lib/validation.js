/**
 * SILVERLINE RESORT — Input Validation & Sanitization
 * All API inputs pass through here before being trusted.
 */

'use strict';

// ─── Date Helpers ──────────────────────────────────────────────────────────

/**
 * Parse a date string (YYYY-MM-DD) into a Date object at midnight local.
 * Returns null if invalid.
 */
function parseDate(str) {
  if (typeof str !== 'string') return null;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Get today's date at midnight (IST-aware via UTC offset).
 */
function today() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Validate a check-in / check-out date pair.
 * Returns { valid: true } or { valid: false, error: '...' }
 */
function validateDateRange(checkIn, checkOut) {
  const ci = parseDate(checkIn);
  if (!ci) return { valid: false, error: 'Invalid check-in date.' };

  const co = parseDate(checkOut);
  if (!co) return { valid: false, error: 'Invalid check-out date.' };

  const t = today();
  if (ci < t) return { valid: false, error: 'Check-in date cannot be in the past.' };
  if (co <= ci) return { valid: false, error: 'Check-out must be after check-in.' };

  const nights = Math.round((co - ci) / 86400000);
  if (nights < 1) return { valid: false, error: 'Minimum stay is 1 night.' };
  if (nights > 30) return { valid: false, error: 'Maximum stay is 30 nights. Call us for extended stays.' };

  const daysOut = Math.round((ci - t) / 86400000);
  if (daysOut > 365) return { valid: false, error: 'Advance booking is limited to 365 days.' };

  return { valid: true, nights };
}

// ─── Guest Count Validation ────────────────────────────────────────────────

function validateGuestCounts(adults, children, roomType) {
  const a = parseInt(adults, 10);
  const c = parseInt(children, 10);

  if (isNaN(a) || a < 1 || a > 6) {
    return { valid: false, error: 'Adults must be between 1 and 6.' };
  }
  if (isNaN(c) || c < 0 || c > 4) {
    return { valid: false, error: 'Children must be between 0 and 4.' };
  }
  if (roomType && (a > roomType.maxAdults)) {
    return { valid: false, error: `This room accommodates a maximum of ${roomType.maxAdults} adult(s).` };
  }
  if (roomType && (a + c > roomType.maxGuests)) {
    return { valid: false, error: `This room accommodates a maximum of ${roomType.maxGuests} guest(s) in total.` };
  }

  return { valid: true, adults: a, children: c };
}

// ─── Text Field Validation ─────────────────────────────────────────────────

function validateName(name, field = 'Name') {
  if (typeof name !== 'string') return { valid: false, error: `${field} is required.` };
  const trimmed = name.trim();
  if (trimmed.length < 2) return { valid: false, error: `${field} must be at least 2 characters.` };
  if (trimmed.length > 100) return { valid: false, error: `${field} must be under 100 characters.` };
  // Only letters, spaces, hyphens, apostrophes
  if (!/^[\p{L}\s'\-\.]+$/u.test(trimmed)) {
    return { valid: false, error: `${field} contains invalid characters.` };
  }
  return { valid: true, value: trimmed };
}

function validateEmail(email) {
  if (typeof email !== 'string') return { valid: false, error: 'Email is required.' };
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254) return { valid: false, error: 'Email address is too long.' };
  // RFC 5322 simplified
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  return { valid: true, value: trimmed };
}

function validatePhone(phone) {
  if (typeof phone !== 'string') return { valid: false, error: 'Phone number is required.' };
  const trimmed = phone.trim().replace(/\s+/g, '');
  if (trimmed.length < 7 || trimmed.length > 20) {
    return { valid: false, error: 'Please enter a valid phone number.' };
  }
  if (!/^[+\d\-()]+$/.test(trimmed)) {
    return { valid: false, error: 'Phone number contains invalid characters.' };
  }
  return { valid: true, value: trimmed };
}

function validateSpecialRequests(text) {
  if (!text) return { valid: true, value: '' };
  const trimmed = String(text).trim();
  if (trimmed.length > 500) {
    return { valid: false, error: 'Special requests must be under 500 characters.' };
  }
  return { valid: true, value: trimmed };
}

// ─── Sanitization ──────────────────────────────────────────────────────────

/**
 * Strip HTML tags and dangerous characters from a string.
 * This is an output-safe encoding for logging/display, not a full XSS sanitizer.
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ─── Booking Validation ────────────────────────────────────────────────────

function validateReservationInput(body, roomType) {
  const errors = {};

  const dateCheck = validateDateRange(body.checkIn, body.checkOut);
  if (!dateCheck.valid) errors.dates = dateCheck.error;

  const guestCheck = validateGuestCounts(body.adults, body.children, roomType);
  if (!guestCheck.valid) errors.guests = guestCheck.error;

  const nameCheck = validateName(body.guestName, 'Full name');
  if (!nameCheck.valid) errors.guestName = nameCheck.error;

  const emailCheck = validateEmail(body.guestEmail);
  if (!emailCheck.valid) errors.guestEmail = emailCheck.error;

  const phoneCheck = validatePhone(body.guestPhone);
  if (!phoneCheck.valid) errors.guestPhone = phoneCheck.error;

  const reqCheck = validateSpecialRequests(body.specialRequests);
  if (!reqCheck.valid) errors.specialRequests = reqCheck.error;

  if (!body.roomTypeId || typeof body.roomTypeId !== 'string') {
    errors.roomTypeId = 'Room selection is required.';
  }

  const hasErrors = Object.keys(errors).length > 0;
  return {
    valid: !hasErrors,
    errors,
    sanitized: hasErrors ? null : {
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      nights: dateCheck.nights,
      adults: guestCheck.adults,
      children: guestCheck.children,
      guestName: nameCheck.value,
      guestEmail: emailCheck.value,
      guestPhone: phoneCheck.value,
      specialRequests: reqCheck.value,
      roomTypeId: body.roomTypeId.trim()
    }
  };
}

module.exports = {
  parseDate, today, validateDateRange, validateGuestCounts,
  validateName, validateEmail, validatePhone, validateSpecialRequests,
  sanitizeString, validateReservationInput
};
