/**
 * SILVERLINE RESORT — Auth Logout API
 * POST /api/auth/logout
 * Clears the session cookie.
 */

'use strict';

const { buildSessionCookie, getAuthUser } = require('../_lib/auth');
const { appendAuditLog } = require('../_lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const user = getAuthUser(req);
    if (user) {
      appendAuditLog({
        userId:   user.id,
        action:   'LOGOUT',
        resource: 'auth',
        meta:     { email: user.email }
      });
    }

    res.setHeader('Set-Cookie', buildSessionCookie('', true)); // clear cookie
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Logout failed.' });
  }
};
