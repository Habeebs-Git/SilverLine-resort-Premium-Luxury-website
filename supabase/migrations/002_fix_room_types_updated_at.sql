-- ============================================================
-- SILVERLINE RESORT — Migration 002: Fix room_types updated_at
-- ============================================================
-- Problem: 001_initial_schema.sql creates a trigger
--   `room_types_updated_at` that references NEW.updated_at,
--   but the room_types table has no updated_at column.
--   Any UPDATE on room_types fails with:
--   ERROR: record "new" has no field "updated_at"
--
-- Fix: Add the updated_at column and a default index.
--   The existing trigger will then work correctly.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Back-fill existing rows with now() (already defaulted above, but explicit)
UPDATE room_types SET updated_at = now() WHERE updated_at IS NULL;

-- Index for ordering/filtering by update time
CREATE INDEX IF NOT EXISTS idx_room_types_updated_at
  ON room_types (updated_at DESC);

-- Verify trigger is in place (should already exist from 001):
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'room_types'::regclass;
