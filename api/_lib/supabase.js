/**
 * SILVERLINE RESORT — Supabase Client Singleton
 *
 * Uses the SERVICE ROLE key — bypasses all RLS policies.
 * This key is NEVER exposed to the browser or frontend code.
 * It is only used inside Vercel serverless API functions.
 *
 * The module-level singleton is reused across warm invocations
 * within the same Vercel function instance.
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL             = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    '[supabase] FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set ' +
    'as environment variables. Add them to your .env file (local) and to ' +
    'Vercel Dashboard → Settings → Environment Variables (production).'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession:   false
  }
});

module.exports = supabase;
