/**
 * SILVERLINE RESORT — Auth Me API
 * GET /api/auth/me
 * Returns current session user for admin UI auth check.
 * Returns 401 if not authenticated.
 */

'use strict';

const { requireAuth } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const user = requireAuth(req, res);
  if (!user) return; // requireAuth already sent 401

  return res.status(200).json({
    user: {
      name:  user.name,
      email: user.email,
      role:  user.role
    }
  });
};
