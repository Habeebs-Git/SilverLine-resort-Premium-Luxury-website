/**
 * SILVERLINE RESORT — Auth Login API
 * POST /api/auth/login
 *
 * Security:
 * - bcrypt password verification (no plaintext comparison)
 * - Rate limiting per IP (5 attempts / 15 min)
 * - Generic error messages (no user enumeration)
 * - JWT in httpOnly, Secure, SameSite=Strict cookie
 * - Audit logging for all attempts
 */

'use strict';

const bcrypt   = require('bcryptjs');
const { signToken, buildSessionCookie } = require('../_lib/auth');
const { getUserByEmail, appendAuditLog } = require('../_lib/db');
const { checkRateLimit, recordAttempt, clearAttempts, getClientIp } = require('../_lib/rate-limit');
const { validateEmail } = require('../_lib/validation');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const ip = getClientIp(req);

  try {
    // ── Rate limit check
    const rl = checkRateLimit(ip);
    if (rl.limited) {
      await appendAuditLog({
        action: 'LOGIN_RATE_LIMITED',
        resource: 'auth',
        meta: { ip }
      });
      return res.status(429).json({
        error: `Too many login attempts. Please try again in ${Math.ceil(rl.resetInSeconds / 60)} minute(s).`
      });
    }

    const { email, password } = req.body || {};

    // ── Basic input validation
    if (!email || !password) {
      recordAttempt(ip);
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      recordAttempt(ip);
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      recordAttempt(ip);
      // Use timing-safe delay to avoid enumeration
      await new Promise(r => setTimeout(r, 400));
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // ── Look up user
    const user = await getUserByEmail(emailCheck.value);

    // ── Constant-time comparison (prevents timing attacks)
    // Always run bcrypt.compare even if user not found (prevents timing enumeration)
    const DUMMY_HASH = '$2b$12$invalidhashfortimingnormalization.abcdefghij';
    const passwordHash = user ? user.passwordHash : DUMMY_HASH;

    const isValid = await bcrypt.compare(password, passwordHash);

    if (!user || !isValid || !user.active) {
      recordAttempt(ip);
      await appendAuditLog({
        action: 'LOGIN_FAILED',
        resource: 'auth',
        meta: { email: emailCheck.value, ip, reason: !user ? 'user_not_found' : !isValid ? 'wrong_password' : 'inactive' }
      });
      // Generic message — never reveal whether email exists
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // ── Successful login
    clearAttempts(ip);

    const token = signToken({
      id:    user.id,
      email: user.email,
      role:  user.role,
      name:  user.name
    });

    await appendAuditLog({
      userId:   user.id,
      action:   'LOGIN_SUCCESS',
      resource: 'auth',
      meta:     { email: user.email, role: user.role, ip }
    });

    res.setHeader('Set-Cookie', buildSessionCookie(token));
    return res.status(200).json({
      success: true,
      user: {
        name:  user.name,
        email: user.email,
        role:  user.role
      }
    });

  } catch (err) {
    console.error('[auth/login] Error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};
