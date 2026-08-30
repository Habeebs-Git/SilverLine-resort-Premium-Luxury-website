/**
 * SILVERLINE RESORT — JWT Authentication Helpers
 * Handles token sign/verify and httpOnly cookie session management.
 */

'use strict';

const jwt    = require('jsonwebtoken');
const cookie = require('cookie');

// Fail fast in production if JWT secret is not configured.
// This prevents the insecure fallback from being silently used on Vercel.
if (process.env.NODE_ENV === 'production' && !process.env.AUTH_JWT_SECRET) {
  throw new Error(
    '[auth] FATAL: AUTH_JWT_SECRET environment variable is not set. ' +
    'Set it in Vercel Dashboard → Settings → Environment Variables before deploying.'
  );
}

const JWT_SECRET   = process.env.AUTH_JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION_silverline_dev_secret_2026';
const SESSION_DURATION = process.env.AUTH_SESSION_DURATION || '8h';
const COOKIE_NAME  = 'slr_session';

/**
 * Sign a JWT token for an authenticated user.
 */
function signToken(payload) {
  return jwt.sign(
    { sub: payload.id, email: payload.email, role: payload.role, name: payload.name },
    JWT_SECRET,
    { expiresIn: SESSION_DURATION, algorithm: 'HS256' }
  );
}

/**
 * Verify a JWT token and return its payload, or null if invalid.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

/**
 * Extract session token from the request's Cookie header.
 */
function getTokenFromRequest(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = cookie.parse(cookieHeader);
  return cookies[COOKIE_NAME] || null;
}

/**
 * Get the authenticated user from request headers (JWT in cookie).
 * Returns null if not authenticated or token is invalid.
 */
function getAuthUser(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    name: payload.name
  };
}

/**
 * Build a Set-Cookie header string for the session token.
 * @param {string} token   JWT token
 * @param {boolean} clear  If true, sets maxAge=0 (logout)
 */
function buildSessionCookie(token, clear = false) {
  return cookie.serialize(COOKIE_NAME, clear ? '' : token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: clear ? 0 : 60 * 60 * 8 // 8 hours in seconds
  });
}

/**
 * Middleware helper: require authentication or return 401.
 * Returns the user object if authenticated, or writes a 401 response and returns null.
 */
function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  return user;
}

/**
 * Middleware helper: require admin role or return 403.
 */
function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Insufficient privileges.' });
    return null;
  }
  return user;
}

/**
 * Middleware helper: require admin OR staff role.
 */
function requireStaff(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!['admin', 'staff'].includes(user.role)) {
    res.status(403).json({ error: 'Insufficient privileges.' });
    return null;
  }
  return user;
}

module.exports = {
  signToken, verifyToken, getTokenFromRequest, getAuthUser,
  buildSessionCookie, requireAuth, requireAdmin, requireStaff,
  COOKIE_NAME
};
