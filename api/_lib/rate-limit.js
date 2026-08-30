/**
 * SILVERLINE RESORT — Simple Rate Limiter
 * In-memory rate limiting for the login endpoint.
 * Resets on serverless cold start — acceptable for prototype.
 *
 * Production upgrade: use Redis-based rate limiting (e.g., @upstash/ratelimit).
 */

'use strict';

// Map: ip -> { attempts: number, windowStart: timestamp }
const store = new Map();

const MAX_ATTEMPTS   = 5;
const WINDOW_MS      = 15 * 60 * 1000; // 15 minutes

/**
 * Check if an IP is rate limited.
 * @param {string} ip
 * @returns {{ limited: boolean, remaining: number, resetInSeconds: number }}
 */
function checkRateLimit(ip) {
  const now  = Date.now();
  const key  = String(ip || 'unknown').slice(0, 64);
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // Fresh window
    return { limited: false, remaining: MAX_ATTEMPTS, resetInSeconds: Math.ceil(WINDOW_MS / 1000) };
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - entry.attempts);
  const resetInSeconds = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);

  return {
    limited: entry.attempts >= MAX_ATTEMPTS,
    remaining,
    resetInSeconds
  };
}

/**
 * Record a failed login attempt for an IP.
 * @param {string} ip
 */
function recordAttempt(ip) {
  const now  = Date.now();
  const key  = String(ip || 'unknown').slice(0, 64);
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(key, { attempts: 1, windowStart: now });
  } else {
    entry.attempts++;
    store.set(key, entry);
  }
}

/**
 * Clear rate limit for an IP (on successful login).
 * @param {string} ip
 */
function clearAttempts(ip) {
  store.delete(String(ip || 'unknown').slice(0, 64));
}

/**
 * Get the client IP from a Vercel/Node.js request.
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

module.exports = { checkRateLimit, recordAttempt, clearAttempts, getClientIp };
