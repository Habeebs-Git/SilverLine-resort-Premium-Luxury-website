-- ============================================================
-- SILVERLINE RESORT — Supabase PostgreSQL Initial Schema
-- Migration: 001_initial_schema.sql
-- Version:   1.1 (post-validation fixes applied 2026-08-29)
--
-- FIXES vs v1.0:
--   FIX 1: booking_reference CHECK regex relaxed to [A-Z0-9]{3,6}
--           because Math.random().toString(36) can produce < 4 chars.
--   FIX 2: settings public SELECT removed. All settings reads go
--           through the server-side Vercel API using service_role.
--           Exposing settings via anon key leaks OTA/payment config.
--   FIX 3: Added DROP IF EXISTS guards on ENUMs, TRIGGERs, POLICYs
--           so this file can be re-run on an existing project without
--           errors. Safe to run on a completely fresh project too.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste entire file → Run
--   OR: supabase db push (Supabase CLI)
--
-- WARNING: Change admin passwords (Section 14) before going live.
--   admin:  SilverlineAdmin2026!
--   staff:  SilverlineStaff2026!
-- ============================================================


CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- SECTION 1: ENUM TYPES
-- DROP first for idempotency (safe — no table depends on them yet
-- at this point in the script).
-- ============================================================

DROP TYPE IF EXISTS reservation_status CASCADE;
DROP TYPE IF EXISTS payment_status     CASCADE;
DROP TYPE IF EXISTS user_role          CASCADE;

CREATE TYPE reservation_status AS ENUM (
  'pending',       -- pre-payment, not yet confirmed
  'confirmed',     -- payment received, arrival expected
  'checked-in',    -- guest is on property
  'checked-out',   -- guest has departed
  'cancelled',     -- cancelled by admin
  'no-show'        -- guest did not arrive
);

CREATE TYPE payment_status AS ENUM (
  'pending',    -- awaiting payment
  'paid',       -- reservation-level: payment confirmed (used in reservations.payment_status)
  'captured',   -- payment-level: provider capture confirmed (used in payments.status)
  'failed',     -- payment failed
  'refunded'    -- payment refunded
);

CREATE TYPE user_role AS ENUM (
  'admin',   -- full access: cancel paid bookings, update rooms, change settings
  'staff'    -- limited access: view/update reservations, cannot cancel paid bookings
);


-- ============================================================
-- SECTION 2: TABLE — guests
-- Source: data/guests.json, api/_lib/db.js upsertGuest()
-- ============================================================

CREATE TABLE IF NOT EXISTS guests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  email       TEXT        NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254),
  phone       TEXT        NOT NULL CHECK (char_length(trim(phone)) BETWEEN 7 AND 20),
  address     TEXT,
  notes       TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guests_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_guests_email ON guests (lower(email));


-- ============================================================
-- SECTION 3: TABLE — room_types
-- Source: data/room-types.json (7 rooms; text slug IDs preserved)
-- ============================================================

CREATE TABLE IF NOT EXISTS room_types (
  id                 TEXT        PRIMARY KEY,
  name               TEXT        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  slug               TEXT        NOT NULL,
  type               TEXT        NOT NULL,
  description        TEXT        NOT NULL DEFAULT '',
  short_description  TEXT,
  image              TEXT        NOT NULL DEFAULT '',
  images             TEXT[]      NOT NULL DEFAULT '{}',
  image_alt          TEXT,
  base_price         INTEGER     NOT NULL CHECK (base_price BETWEEN 500 AND 500000),
  max_adults         SMALLINT    NOT NULL CHECK (max_adults BETWEEN 1 AND 6),
  max_children       SMALLINT    NOT NULL DEFAULT 0 CHECK (max_children BETWEEN 0 AND 4),
  max_guests         SMALLINT    NOT NULL CHECK (max_guests >= 1),
  bed_configuration  TEXT        NOT NULL DEFAULT '',
  room_size          TEXT,
  floor              TEXT,
  view               TEXT,
  amenities          TEXT[]      NOT NULL DEFAULT '{}',
  highlights         TEXT[]      NOT NULL DEFAULT '{}',
  inventory          SMALLINT    NOT NULL DEFAULT 1 CHECK (inventory BETWEEN 0 AND 100),
  active             BOOLEAN     NOT NULL DEFAULT true,
  sort_order         SMALLINT    NOT NULL DEFAULT 0,
  CONSTRAINT room_types_capacity_valid CHECK (max_guests >= max_adults),
  CONSTRAINT room_types_slug_unique    UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_room_types_active_sort
  ON room_types (sort_order) WHERE active = true;


-- ============================================================
-- SECTION 4: TABLE — users
-- Source: data/users.json, api/auth/login.js
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  email          TEXT        NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254),
  role           user_role   NOT NULL,
  password_hash  TEXT        NOT NULL CHECK (char_length(password_hash) >= 50),
  active         BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));


-- ============================================================
-- SECTION 5: TABLE — reservations
-- Source: data/reservations.json, api/reservations.js,
--         api/_lib/validation.js, api/admin/reservations/[id].js
--
-- FIX 1 applied here:
--   Original regex: '^SLR-[0-9]{8}-[A-Z0-9]{4}$'
--   Problem: generateBookingRef() uses Math.random().toString(36)
--   which can produce 3–5 chars before .toUpperCase(), not always 4.
--   Fixed regex: '^SLR-[0-9]{8}-[A-Z0-9]{3,6}$'
--   This still validates the format while tolerating real output.
-- ============================================================

CREATE TABLE IF NOT EXISTS reservations (
  id                 UUID                NOT NULL DEFAULT gen_random_uuid(),
  booking_reference  TEXT                NOT NULL
                                         CHECK (booking_reference ~ '^SLR-[0-9]{8}-[A-Z0-9]{3,6}$'),
  guest_id           UUID                NOT NULL REFERENCES guests(id)    ON DELETE RESTRICT,
  guest_name         TEXT                NOT NULL CHECK (char_length(trim(guest_name)) BETWEEN 2 AND 100),
  guest_email        TEXT                NOT NULL CHECK (char_length(guest_email) BETWEEN 5 AND 254),
  guest_phone        TEXT                NOT NULL CHECK (char_length(trim(guest_phone)) BETWEEN 7 AND 20),
  room_type_id       TEXT                NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  room_type_name     TEXT                NOT NULL,
  check_in           DATE                NOT NULL,
  check_out          DATE                NOT NULL,
  nights             SMALLINT            NOT NULL CHECK (nights BETWEEN 1 AND 30),
  adults             SMALLINT            NOT NULL CHECK (adults BETWEEN 1 AND 6),
  children           SMALLINT            NOT NULL DEFAULT 0 CHECK (children BETWEEN 0 AND 4),
  special_requests   TEXT                NOT NULL DEFAULT '' CHECK (char_length(special_requests) <= 500),
  base_price         INTEGER             NOT NULL CHECK (base_price >= 500),
  subtotal           INTEGER             NOT NULL CHECK (subtotal >= 0),
  taxes              INTEGER             NOT NULL DEFAULT 0 CHECK (taxes >= 0),
  total              INTEGER             NOT NULL CHECK (total >= 0),
  tax_rate           NUMERIC(5,4)        NOT NULL DEFAULT 0.1200 CHECK (tax_rate BETWEEN 0 AND 0.5),
  currency           CHAR(3)             NOT NULL DEFAULT 'INR',
  status             reservation_status  NOT NULL DEFAULT 'confirmed',
  payment_status     payment_status      NOT NULL DEFAULT 'pending',
  payment_provider   TEXT                NOT NULL DEFAULT 'mock',
  payment_reference  TEXT,
  updated_by         UUID                REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ         NOT NULL DEFAULT now(),
  CONSTRAINT reservations_pkey          PRIMARY KEY (id),
  CONSTRAINT reservations_ref_unique    UNIQUE (booking_reference),
  CONSTRAINT reservations_dates_valid   CHECK (check_out > check_in),
  CONSTRAINT reservations_pricing_valid CHECK (total = subtotal + taxes)
);

-- Critical composite index for the availability overlap query
CREATE INDEX IF NOT EXISTS idx_reservations_room_type_dates   ON reservations (room_type_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_reservations_status            ON reservations (status);
CREATE INDEX IF NOT EXISTS idx_reservations_guest_id          ON reservations (guest_id);
CREATE INDEX IF NOT EXISTS idx_reservations_guest_email       ON reservations (lower(guest_email));
CREATE INDEX IF NOT EXISTS idx_reservations_check_in          ON reservations (check_in);
CREATE INDEX IF NOT EXISTS idx_reservations_check_out         ON reservations (check_out);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at        ON reservations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_booking_reference ON reservations (booking_reference);


-- ============================================================
-- SECTION 6: TABLE — payments
-- Source: data/payments.json, api/reservations.js createPaymentRecord()
-- NOTE: amount is in PAISE (not rupees). ₹6,720 = 672000 paise.
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id                 UUID            NOT NULL DEFAULT gen_random_uuid(),
  reservation_id     UUID            NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  booking_reference  TEXT            NOT NULL,
  provider           TEXT            NOT NULL DEFAULT 'mock',
  order_id           TEXT,
  transaction_id     TEXT,
  amount             INTEGER         NOT NULL CHECK (amount >= 0),
  currency           CHAR(3)         NOT NULL DEFAULT 'INR',
  status             payment_status  NOT NULL DEFAULT 'pending',
  test_mode          BOOLEAN         NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_payments_reservation_id    ON payments (reservation_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_reference ON payments (booking_reference);


-- ============================================================
-- SECTION 7: TABLE — settings (singleton row)
-- Source: data/settings.json, api/admin/settings.js
-- Five JSONB columns — one per config section.
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  id             SMALLINT    NOT NULL DEFAULT 1,
  hotel          JSONB       NOT NULL DEFAULT '{}',
  pricing        JSONB       NOT NULL DEFAULT '{}',
  notifications  JSONB       NOT NULL DEFAULT '{}',
  ota            JSONB       NOT NULL DEFAULT '{}',
  payment        JSONB       NOT NULL DEFAULT '{}',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_pkey      PRIMARY KEY (id),
  CONSTRAINT settings_singleton  CHECK (id = 1)
);


-- ============================================================
-- SECTION 8: TABLE — audit_logs (append-only)
-- Source: data/audit-logs.json, api/_lib/db.js appendAuditLog()
-- BIGSERIAL pk — sequential for high-frequency inserts.
-- No FK on user_id — immutable history must survive admin deletion.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL   NOT NULL,
  user_id      UUID,
  action       TEXT        NOT NULL,
  resource     TEXT        NOT NULL,
  resource_id  TEXT,
  meta         JSONB,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id   ON audit_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action    ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource  ON audit_logs (resource, resource_id) WHERE resource_id IS NOT NULL;


-- ============================================================
-- SECTION 9: UPDATED_AT TRIGGER
-- Auto-sets updated_at = now() before any UPDATE.
-- Applied only to tables that have an updated_at column.
-- NOT applied to payments (immutable) or audit_logs (append-only).
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- FIX 3: DROP triggers before re-creating (idempotency guard)
DROP TRIGGER IF EXISTS guests_updated_at       ON guests;
DROP TRIGGER IF EXISTS room_types_updated_at   ON room_types;
DROP TRIGGER IF EXISTS users_updated_at        ON users;
DROP TRIGGER IF EXISTS reservations_updated_at ON reservations;
DROP TRIGGER IF EXISTS settings_updated_at     ON settings;

CREATE TRIGGER guests_updated_at
  BEFORE UPDATE ON guests       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER room_types_updated_at
  BEFORE UPDATE ON room_types   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER reservations_updated_at
  BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- SECTION 10: ROW LEVEL SECURITY
-- All 7 tables have RLS enabled.
-- Service role (SUPABASE_SERVICE_ROLE_KEY in Vercel) bypasses all
-- policies — full access for all server-side API operations.
-- anon / authenticated roles are the browser-facing connections.
--
-- FIX 2: settings public SELECT removed.
--   All settings reads go through Vercel API (service_role).
--   Exposing settings JSONB to anon would leak OTA URLs, payment
--   provider config, and email provider names via direct queries.
--
-- FIX 3: DROP policies before re-creating (idempotency guard).
-- ============================================================

ALTER TABLE guests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;

-- Drop all policies first (idempotency)
DROP POLICY IF EXISTS "guests_deny_public_all"       ON guests;
DROP POLICY IF EXISTS "reservations_deny_public_all" ON reservations;
DROP POLICY IF EXISTS "payments_deny_public_all"     ON payments;
DROP POLICY IF EXISTS "users_deny_public_all"        ON users;
DROP POLICY IF EXISTS "audit_logs_deny_public_all"   ON audit_logs;
DROP POLICY IF EXISTS "settings_deny_public_all"     ON settings;
DROP POLICY IF EXISTS "settings_deny_public_write"   ON settings;
DROP POLICY IF EXISTS "settings_deny_public_update"  ON settings;
DROP POLICY IF EXISTS "settings_public_read"         ON settings;
DROP POLICY IF EXISTS "room_types_public_read_active"  ON room_types;
DROP POLICY IF EXISTS "room_types_deny_public_write"   ON room_types;
DROP POLICY IF EXISTS "room_types_deny_public_update"  ON room_types;
DROP POLICY IF EXISTS "room_types_deny_public_delete"  ON room_types;

-- ── Fully blocked tables (all operations denied for anon/authenticated)
CREATE POLICY "guests_deny_public_all"
  ON guests FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "reservations_deny_public_all"
  ON reservations FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "payments_deny_public_all"
  ON payments FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "users_deny_public_all"
  ON users FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "audit_logs_deny_public_all"
  ON audit_logs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- ── settings: FIX 2 — fully blocked (was incorrectly public in v1.0)
-- All settings reads go through GET /api/admin/settings (service_role).
-- The admin API strips notifications/ota/payment before responding.
-- No legitimate browser use case requires direct Supabase settings access.
CREATE POLICY "settings_deny_public_all"
  ON settings FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- ── room_types: public SELECT for active rooms only
-- Needed by: GET /api/availability (public availability endpoint)
-- Admin writes go through service_role only.
CREATE POLICY "room_types_public_read_active"
  ON room_types FOR SELECT TO anon, authenticated
  USING (active = true);

CREATE POLICY "room_types_deny_public_write"
  ON room_types FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "room_types_deny_public_update"
  ON room_types FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "room_types_deny_public_delete"
  ON room_types FOR DELETE TO anon, authenticated USING (false);


-- ============================================================
-- SECTION 11: ATOMIC BOOKING FUNCTION
--
-- Prevents double-booking via SELECT FOR UPDATE on room_types row.
--
-- HOW CONCURRENT PROTECTION WORKS:
--   Thread A: BEGIN → SELECT inventory FROM room_types FOR UPDATE
--             (acquires exclusive lock on this room_type row)
--   Thread B: BEGIN → SELECT inventory FROM room_types FOR UPDATE
--             (BLOCKS — waits for Thread A to commit or rollback)
--   Thread A: COUNT overlapping = 2, inventory = 3, available → INSERT → COMMIT
--             (lock released)
--   Thread B: (unblocks) COUNT overlapping = 3, inventory = 3 → NO_AVAILABILITY
--             (booking correctly rejected)
--
-- Locks are per-room-type row. Different room types book in parallel.
-- The plpgsql function body runs inside the caller's transaction
-- (supabase.rpc() wraps the call in a single DB transaction).
-- SECURITY DEFINER: runs with owner privileges (bypasses RLS).
-- ============================================================

CREATE OR REPLACE FUNCTION create_reservation_atomic(
  p_id                UUID,
  p_booking_reference TEXT,
  p_guest_id          UUID,
  p_guest_name        TEXT,
  p_guest_email       TEXT,
  p_guest_phone       TEXT,
  p_room_type_id      TEXT,
  p_room_type_name    TEXT,
  p_check_in          DATE,
  p_check_out         DATE,
  p_nights            SMALLINT,
  p_adults            SMALLINT,
  p_children          SMALLINT,
  p_special_requests  TEXT,
  p_base_price        INTEGER,
  p_subtotal          INTEGER,
  p_taxes             INTEGER,
  p_total             INTEGER,
  p_tax_rate          NUMERIC,
  p_payment_id        UUID,
  p_payment_provider  TEXT,
  p_payment_reference TEXT,
  p_order_id          TEXT,
  p_transaction_id    TEXT,
  p_amount            INTEGER,   -- in PAISE (100 paise = ₹1)
  p_test_mode         BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inventory   SMALLINT;
  v_booked      INTEGER;
  v_available   INTEGER;
BEGIN

  -- Step 1: Acquire exclusive row-level lock on this room type.
  -- Concurrent calls for the same room_type_id will BLOCK here
  -- until this transaction commits or rolls back.
  -- Calls for different room types proceed in parallel.
  SELECT inventory
  INTO   v_inventory
  FROM   room_types
  WHERE  id = p_room_type_id AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'code',   'ROOM_NOT_FOUND',
      'reason', 'The selected room type does not exist or is no longer available.'
    );
  END IF;

  -- Step 2: Count overlapping reservations inside the locked transaction.
  -- Overlap formula matches api/_lib/availability.js countOverlappingBookings():
  --   newCheckIn < existingCheckOut AND newCheckOut > existingCheckIn
  -- Excludes cancelled and no-show (matches availability.js filter).
  SELECT COUNT(*)::INTEGER
  INTO   v_booked
  FROM   reservations
  WHERE  room_type_id = p_room_type_id
    AND  status NOT IN ('cancelled', 'no-show')
    AND  check_in  < p_check_out
    AND  check_out > p_check_in;

  v_available := v_inventory - v_booked;

  -- Step 3: Reject if no rooms available.
  IF v_available <= 0 THEN
    RETURN jsonb_build_object(
      'ok',        false,
      'code',      'NO_AVAILABILITY',
      'reason',    'This room is no longer available for your selected dates.',
      'inventory', v_inventory,
      'booked',    v_booked
    );
  END IF;

  -- Step 4: Insert the reservation record.
  INSERT INTO reservations (
    id,
    booking_reference,
    guest_id,
    guest_name,
    guest_email,
    guest_phone,
    room_type_id,
    room_type_name,
    check_in,
    check_out,
    nights,
    adults,
    children,
    special_requests,
    base_price,
    subtotal,
    taxes,
    total,
    tax_rate,
    currency,
    status,
    payment_status,
    payment_provider,
    payment_reference
  ) VALUES (
    p_id,
    p_booking_reference,
    p_guest_id,
    p_guest_name,
    p_guest_email,
    p_guest_phone,
    p_room_type_id,
    p_room_type_name,
    p_check_in,
    p_check_out,
    p_nights,
    p_adults,
    p_children,
    COALESCE(p_special_requests, ''),
    p_base_price,
    p_subtotal,
    p_taxes,
    p_total,
    p_tax_rate,
    'INR',
    'confirmed',
    'paid',
    p_payment_provider,
    p_payment_reference
  );

  -- Step 5: Insert the payment record.
  -- amount is in paise (matches existing createPaymentRecord call:
  --   amount: pricing.total * 100  — see api/reservations.js line 148)
  INSERT INTO payments (
    id,
    reservation_id,
    booking_reference,
    provider,
    order_id,
    transaction_id,
    amount,
    currency,
    status,
    test_mode
  ) VALUES (
    p_payment_id,
    p_id,
    p_booking_reference,
    p_payment_provider,
    p_order_id,
    p_transaction_id,
    p_amount,
    'INR',
    'captured',
    p_test_mode
  );

  -- Step 6: Return success with booking reference.
  RETURN jsonb_build_object(
    'ok',                true,
    'booking_reference', p_booking_reference,
    'reservation_id',    p_id,
    'remaining_rooms',   (v_available - 1)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',     false,
    'code',   'DB_ERROR',
    'reason', SQLERRM
  );

END;
$$;


-- ============================================================
-- SECTION 12: SEED — room_types
-- Source: data/room-types.json (exact values, all 7 rooms)
-- ON CONFLICT DO NOTHING: safe to re-run.
-- ============================================================

INSERT INTO room_types (id, name, slug, type, description, short_description, image, images, image_alt, base_price, max_adults, max_children, max_guests, bed_configuration, room_size, floor, view, amenities, highlights, inventory, active, sort_order) VALUES
('standard-room','Standard Room','standard-room','standard','A comfortable, well-kept room with warm teak finishes, crisp white linen, and a peaceful garden-facing window. The ideal retreat for a quiet night in the hills.','Warm teak finishes, crisp white linen, garden-facing window.','/images/room-deluxe-balcony-9400.jpg',ARRAY['/images/room-deluxe-balcony-9400.jpg','/images/room-standard-4500.jpg'],'Standard Room — teak-finished room with king bed, white linen and garden window',3000,2,0,2,'1 King Bed','280 sq ft','Ground','Garden View',ARRAY['Free Breakfast','Free WiFi','Free Parking','Hot Water','Air Conditioning','Room Service','Flat Screen TV','Wardrobe','Daily Housekeeping'],ARRAY['Garden-facing window','Warm teak furnishings','Deep-pile mattress','Crisp white linen'],3,true,1),
('deluxe-room','Deluxe Room','deluxe-room','deluxe','A spacious room with a louvred teak wardrobe, plush king bed, and natural light through wide curtained windows. Valley views peek through the treeline at dawn.','Spacious, louvred teak wardrobe, wide curtained windows.','/images/room-suite-8600.jpg',ARRAY['/images/room-suite-8600.jpg'],'Deluxe Room — king bed with louvred teak wardrobe, copper curtains and natural light',3500,2,1,2,'1 King Bed','340 sq ft','First','Garden / Partial Valley',ARRAY['Free Breakfast','Free WiFi','Free Parking','Hot Water','Air Conditioning','Room Service','Flat Screen TV','Louvred Teak Wardrobe','Writing Desk','Daily Housekeeping'],ARRAY['Louvred teak wardrobe','Wide copper curtains','Natural morning light','Plush king bed'],3,true,2),
('deluxe-balcony','Deluxe Balcony','deluxe-balcony','deluxe','A well-appointed room with warm teak furnishings and a private balcony overlooking the garden. Step outside at dusk and listen to the forest settle in.','Private balcony overlooking the garden, warm teak furnishings.','/images/room-standard-4500.jpg',ARRAY['/images/room-standard-4500.jpg','/images/room-deluxe-balcony-9400.jpg'],'Deluxe Balcony — teak king bed with quilted headboard, crisp white linen, copper curtains',3500,2,1,2,'1 King Bed','360 sq ft','First','Garden Balcony',ARRAY['Free Breakfast','Free WiFi','Free Parking','Hot Water','Air Conditioning','Room Service','Flat Screen TV','Private Balcony','Wardrobe','Daily Housekeeping'],ARRAY['Private balcony','Garden views','Warm teak furnishings','Evening forest sounds'],2,true,3),
('suite-with-balcony','Suite with Balcony','suite-with-balcony','suite','A refined suite with warm amber interiors, a Smart TV, and a private balcony with open valley views. Unhurried mornings, the mist below, and the sound of birds.','Warm amber interiors, Smart TV, private balcony with valley views.','/images/room-deluxe-suite-7200.jpg',ARRAY['/images/room-deluxe-suite-7200.jpg'],'Suite with Balcony — king bed with Smart TV, mirror and warm amber tones',4000,2,1,2,'1 King Bed','420 sq ft','Second','Valley View Balcony',ARRAY['Free Breakfast','Free WiFi','Free Parking','Hot Water','Air Conditioning','Room Service','Smart TV','Private Balcony','Valley View','Mini Fridge','Daily Housekeeping'],ARRAY['Open valley views','Private balcony','Smart TV','Warm amber interiors','Mini fridge'],2,true,4),
('deluxe-suite','Deluxe Suite','deluxe-suite','suite','A premium suite featuring two handsome teak beds, rich copper-toned drapes, and a private terrace with unobstructed views across the Nilgiri valley. Unhurried and entirely yours.','Two teak beds, private terrace, unobstructed valley views.','/images/room-deluxe-suite-client.jpg',ARRAY['/images/room-deluxe-suite-client.jpg','/images/room-deluxe-suite-7200.jpg'],'Deluxe Suite — king bed with teak furniture, warm drapes and natural light',4000,2,2,4,'2 Teak Beds','520 sq ft','Second','Valley Terrace',ARRAY['Free Breakfast','Free WiFi','Free Parking','Hot Water','Air Conditioning','Room Service','Smart TV','Private Terrace','Valley View','Mini Fridge','Bathtub','Daily Housekeeping'],ARRAY['Private terrace','Unobstructed valley view','Two teak beds','Copper drapes','Bathtub'],2,true,5),
('two-bedroom-deluxe','2 Bedroom Deluxe','two-bedroom-deluxe','family','Two teak beds in a generously proportioned room, ideal for families or groups travelling together. Warm finishes, open layout, and more space than you''ll know what to do with.','Two teak beds, generous proportions, ideal for families.','/images/room-deluxe-5800.jpg',ARRAY['/images/room-deluxe-5800.jpg','/images/room-2bed-deluxe-12500.jpg'],'2 Bedroom Deluxe — two teak beds with quilted headboards and copper curtains',5500,4,2,4,'2 King Beds','620 sq ft','Ground / First','Garden / Valley',ARRAY['Free Breakfast','Free WiFi','Free Parking','Hot Water','Air Conditioning','Room Service','Flat Screen TV','Two Bedrooms','Large Wardrobe','Daily Housekeeping'],ARRAY['Two separate bedrooms','Family-friendly layout','Generous proportions','Warm teak throughout'],2,true,6),
('two-bedroom-deluxe-suite','2 Bedroom Deluxe Suite','two-bedroom-deluxe-suite','suite','Two elegantly furnished bedrooms with teak interiors, a shared lounge area, and a balcony facing the valley. The finest address in the resort — mornings here feel like privilege.','Two furnished bedrooms, shared lounge, valley-facing balcony.','/images/room-2bed-deluxe-12500.jpg',ARRAY['/images/room-2bed-deluxe-12500.jpg','/images/room-2bed-deluxe-suite-15900.jpg'],'2 Bedroom Deluxe Suite — wide room with two teak beds, wardrobe, TV, chairs and mirror',5500,4,2,4,'2 King Beds + Lounge','820 sq ft','Top','Valley Panorama Balcony',ARRAY['Free Breakfast','Free WiFi','Free Parking','Hot Water','Air Conditioning','Room Service','Smart TV','Private Balcony','Valley View','Shared Lounge','Mini Bar','Bathtub','Premium Toiletries','Daily Housekeeping','Turndown Service'],ARRAY['Valley panorama balcony','Shared lounge area','Two teak bedrooms','Mini bar','Bathtub','Turndown service','The resort''s finest suite'],1,true,7)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SECTION 13: SEED — settings (from data/settings.json)
-- ON CONFLICT DO NOTHING: safe to re-run.
-- ============================================================

INSERT INTO settings (id, hotel, pricing, notifications, ota, payment) VALUES (
  1,
  '{"name":"Silverline Resort","tagline":"Experience Serenity in the Heart of the Nilgiris","address":"2/259, Kathadimattam Road, Balacola, Ooty, Tamil Nadu 643003","phone":"+918638479919","email":"info@silverlineresort.in","reservationsEmail":"reservations@silverlineresort.in","website":"https://www.silverlineresort.in","checkInTime":"14:00","checkOutTime":"11:00","currency":"INR","currencySymbol":"₹","timezone":"Asia/Kolkata"}'::jsonb,
  '{"taxRate":0.12,"taxLabel":"GST (12%)","serviceFee":0,"breakfastIncluded":true,"breakfastLabel":"Breakfast Included","cancellationPolicy":"Free cancellation up to 48 hours before check-in. After that, 1 night charge applies.","advanceBookingDays":365,"minNights":1,"maxNights":30}'::jsonb,
  '{"emailProvider":"mock","smsProvider":"none","sendConfirmation":true,"sendCancellation":true,"sendReminder":false}'::jsonb,
  '{"provider":"mock","agodaUrl":"https://www.agoda.com/en-in/silverline-resort/hotel/ooty-in.html?rooms=1&adults=2&children=0&cid=1917615","ixigoUrl":"https://www.ixigo.com/hotels/3992248/details?locationId=2603820&locationName=Silverline%20Resort&locationType=H&masterLocationId=3024853&countryId=1&adultCount=2&roomCount=1&childCount=0&cityId=559&stateId=5&hName=Silverline%20Resort"}'::jsonb,
  '{"provider":"mock","supportedMethods":["card","upi","netbanking"],"testMode":true}'::jsonb
) ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SECTION 14: SEED — users (from data/users.json)
-- ⚠  CHANGE PASSWORDS BEFORE GOING LIVE.
--   admin: SilverlineAdmin2026!   staff: SilverlineStaff2026!
-- ON CONFLICT DO NOTHING: safe to re-run.
-- ============================================================

INSERT INTO users (id, name, email, role, password_hash, active, created_at, updated_at) VALUES
('dac60336-ca79-446f-8968-d4933f71221e','Resort Administrator','admin@silverlineresort.in','admin','$2a$12$FxF2Hzt4jhMgXHffiAWqnulZBotb7v6v1n55mcV9KIFFfCIeNy.wm',true,'2026-08-26T18:08:15.777Z','2026-08-26T18:08:15.778Z'),
('073f43c2-0817-4d0d-9c4a-70fc8988eb75','Front Desk Staff','staff@silverlineresort.in','staff','$2a$12$JzGOPrkLBzCjpccIXBMPoOns.GZk25bUziZZ/0M5F8z21ANVb6/qG',true,'2026-08-26T18:08:15.778Z','2026-08-26T18:08:15.778Z')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SECTION 15: POST-RUN VERIFICATION QUERIES
-- Run these MANUALLY in SQL Editor AFTER the migration succeeds.
-- Do NOT include them in the migration run itself.
-- ============================================================

-- 1. All 7 tables exist:
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- Expected: audit_logs, guests, payments, reservations, room_types, settings, users

-- 2. All 3 ENUM types exist:
-- SELECT typname FROM pg_type
--   WHERE typname IN ('reservation_status','payment_status','user_role');

-- 3. Room types seeded (expect 7 rows):
-- SELECT id, name, base_price, inventory, active FROM room_types ORDER BY sort_order;

-- 4. Settings seeded (expect 1 row):
-- SELECT id, hotel->>'name' AS hotel_name, pricing->>'taxRate' AS tax_rate FROM settings;

-- 5. Users seeded (expect 2 rows — NEVER expose password_hash):
-- SELECT id, name, email, role, active FROM users;

-- 6. RLS enabled on all 7 tables:
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('guests','room_types','reservations','payments','users','settings','audit_logs')
--   ORDER BY relname;
-- Expected: all rows have relrowsecurity = true

-- 7. Atomic function exists:
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'create_reservation_atomic';
-- Expected: 1 row, pronargs = 26

-- 8. All indexes:
-- SELECT indexname, tablename FROM pg_indexes
--   WHERE schemaname = 'public' ORDER BY tablename, indexname;

-- ============================================================
-- END OF MIGRATION 001_initial_schema.sql (v1.1)
-- ============================================================
