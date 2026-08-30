# Silverline Resort — Booking System Production Readiness Audit
**Date:** 2026-08-29 | **Auditor:** Antigravity (Read-Only Inspection)

---

## 24-Question Answers

### 1. What file receives a booking request?
`js/booking-engine.js` — specifically the `submitReservation()` function (line 689). The browser sends a `POST /api/reservations` fetch request from this function.

### 2. What API endpoint creates a reservation?
`POST /api/reservations` — handled by `api/reservations.js`.

### 3. Where is the reservation actually stored?
In `data/reservations.json` — a flat JSON file on disk. The database layer in `api/_lib/db.js` performs an atomic write-then-rename (`fs.writeFileSync` + `fs.renameSync`).

### 4. Is there a real persistent database?
**No.**

### 5. If yes, which database/service?
Not applicable. `DATABASE_URL` in `.env.example` is blank. The code never references a database driver (Prisma, pg, mongoose, etc.). The `db.js` comment explicitly calls itself *"Prototype persistence using JSON files in /data/."*

### 6. If no, explain exactly where the reservation currently goes.
The reservation object is pushed into a JavaScript array loaded from `data/reservations.json`, then that array is serialised back to the same file atomically. It is **local filesystem storage only**. On Vercel (serverless), the filesystem is read-only — writes will fail or be lost immediately.

### 7. Does restarting the server erase reservations?
- **Local (`http-server` / `vercel dev`):** No — JSON files on disk persist across restarts.
- **Deployed on Vercel Serverless:** **YES, effectively.** Vercel serverless functions run in an ephemeral, read-only filesystem. Any write to `data/reservations.json` either fails with a permissions error or disappears when the Lambda cold-starts. Reservations made on production Vercel are **not persisted**.

### 8. Is availability based on real stored reservations?
**Yes, locally.** The availability engine in `api/_lib/availability.js` reads from `data/reservations.json` and computes overlapping bookings against each room type's `inventory` count. The logic is correct in principle — but only as reliable as the storage layer beneath it.

### 9. Are there hardcoded/dummy occupied dates or reservations?
**Yes.** `data/reservations.json` currently contains **7 seeded reservations**:
- 3 demo records: Arjun Mehta, Priya Krishnamurthy, Rajesh Nair (dates: Aug 24 – Sep 1)
- 4 test bookings: "Test Guest Local", "CSS Fix Test", "John Doe" x2
All have `paymentReference: MOCK-*` and count against availability.

### 10. Why can dates currently show "already registered"?
Because of those **7 existing reservations**. The availability engine checks overlapping bookings against each room type's inventory. For example:
- `standard-room` has inventory 3. Currently has 2 confirmed test bookings for overlapping dates.
- `suite-with-balcony` has inventory 2. The seeded "Arjun Mehta" booking (Aug 24–27) consumes 1 slot.
These demo entries make rooms appear booked — a data artefact from development seeding, not a code bug.

### 11. Can two customers currently book the same room for overlapping dates?
**Race condition risk exists but is partially mitigated.** The server re-validates availability at booking time. However, because the database is a flat JSON file with synchronous reads and writes, two simultaneous POST requests could both read the same pre-write state and both pass the availability check before either writes. Low risk at low volume, but **not safe for production**.

### 12. Is there server-side duplicate/overlap protection?
**Yes, partially.** `validateFinalAvailability()` runs server-side on every booking request, re-reading the reservations file and using the formula `newCheckIn < existingCheckOut && newCheckOut > existingCheckIn`. The logic is correct. However, without a real database with atomic transactions, it is not truly race-condition-proof at scale.

### 13. Are environment variables required?
**Yes — one is critically required for production.** `AUTH_JWT_SECRET` will throw a fatal error if not set when `NODE_ENV=production` (see `api/_lib/auth.js` lines 13–17). The admin panel will be completely broken without it.

### 14. Which environment variables are required for production?

| Variable | Required? | Notes |
|---|---|---|
| `AUTH_JWT_SECRET` | 🔴 CRITICAL | Admin panel crashes without it in production |
| `DATABASE_URL` | 🔴 CRITICAL | No real DB = all data lost on Vercel |
| `PAYMENT_PROVIDER` | 🔴 CRITICAL | Currently `mock` — real payments need `razorpay` |
| `PAYMENT_RAZORPAY_KEY_ID` | 🔴 If Razorpay | Required for real payments |
| `PAYMENT_RAZORPAY_KEY_SECRET` | 🔴 If Razorpay | Required for real payments |
| `EMAIL_PROVIDER` | 🟠 Mock now | Needs `resend` or `sendgrid` for real emails |
| `EMAIL_API_KEY` | 🟠 Required if real | Depends on provider |
| `EMAIL_FROM` | Optional | Defaults to `reservations@silverlineresort.in` |
| `AUTH_SESSION_DURATION` | Optional | Defaults to `8h` |
| `HOTEL_NAME` | Optional | Defaults to `Silverline Resort` |
| `HOTEL_PHONE` | Optional | Defaults to `+91 86384 79919` |
| `NODE_ENV` | Auto | Vercel sets this to `production` automatically |

### 15. Are those variables currently configured in Vercel?
**Unknown from code inspection alone.** Environment variables live in the Vercel Dashboard, not in the repo. The `.env.example` shows all values blank. There is no `.env` committed (correctly — it is gitignored). You must verify in Vercel Dashboard → Project → Settings → Environment Variables.

### 16. Does the booking API work under Vercel (deployed)?
**No — not for persisting real data.** Vercel's serverless runtime has a **read-only filesystem**. The `fs.writeFileSync` calls in `db.js` will fail on deployed Vercel. The full booking flow will return a 500 error or silently discard writes.

### 17. Does it work under `vercel dev`?
**Yes, technically.** `vercel dev` runs serverless functions locally with Node.js on a writable filesystem. The flow works end-to-end. This is confirmed by the 4 test bookings in `data/reservations.json` with `createdAt: 2026-08-28`.

> ⚠️ `vercel dev` requires a Vercel account login (`vercel login`). You are currently using `http-server` which **cannot run the API endpoints at all** — only static files are served.

### 18. Is payment real, mocked, or absent?
🟠 **MOCKED.** `api/_lib/payment-mock.js` always returns `verified: true` with a `MOCK-*` transaction ID. No real money moves. The API response explicitly states: `"paymentMode": "TEST — Mock Payment (No real charge)"`.

### 19. Is confirmation email real, mocked, or absent?
🟠 **MOCKED.** `api/_lib/email-mock.js` calls `console.log('[MOCK EMAIL] Booking confirmation would be sent:')` only. No email SDK is integrated. No guest ever receives a confirmation email.

### 20. Is the admin reservation management system real or mocked?
🟡 **REAL BUT INCOMPLETE.** The admin API endpoints are fully coded with JWT authentication, bcrypt-hashed passwords, role-based access control, filtering, pagination, and audit logs. The system works correctly under `vercel dev`. It breaks on deployed Vercel for the same filesystem reason.

### 21. Is the calendar using real availability or only frontend validation?
**Real availability from the server.** Step 1 (date picker) has only basic frontend validation (no past dates, checkout after checkin). Step 2 calls `GET /api/availability` which runs the full server-side overlap calculation. The frontend renders only what the server returns — it does not independently calculate or cache availability.

### 22. What happens if the customer refreshes the page during booking?
- **During Steps 1–4:** All state lives in the JS `state` object in memory. A page refresh **wipes all progress** — the customer starts over at Step 1.
- **After confirmation:** Booking data is stored in `sessionStorage` under key `slr_booking`. Refreshing within the same browser session shows the confirmation correctly. Closing the tab and returning via URL shows the **error state** — sessionStorage is cleared on tab close.
- There is no URL-based confirmation lookup — no `GET /api/reservation/:ref` for the public-facing confirmation page.

### 23. What happens if two customers submit the same room simultaneously?
Both read `data/reservations.json` (both see room available), both pass `validateFinalAvailability()`, then both write to `data/reservations.json`. The second write **overwrites the first** — there is no file locking or transaction. **Both bookings could be confirmed for the same room on the same dates**, exceeding inventory. This is the most critical correctness risk for a real-world launch.

### 24. Are reservations permanently identifiable with a booking/reference number?
**Yes.** Each reservation gets a server-generated UUID (`id`) and a human-readable reference in format `SLR-YYYYMMDD-XXXX` (e.g. `SLR-20260826-AH57`). These are returned to the client and displayed on the confirmation page. However, **there is no public API endpoint to look up a booking by reference** — the confirmation page relies solely on `sessionStorage`, so the reference cannot be used for retrieval after the session ends.

---

## Feature Classification Table

| Feature | Status |
|---|---|
| Booking flow UI (4 steps) | ✅ PRODUCTION READY |
| Server-side input validation | ✅ PRODUCTION READY |
| Server-side pricing calculation | ✅ PRODUCTION READY |
| Availability overlap algorithm | ✅ PRODUCTION READY |
| Booking reference generation (SLR-) | ✅ PRODUCTION READY |
| Admin authentication (JWT + bcrypt) | ✅ PRODUCTION READY |
| Admin role-based access control | ✅ PRODUCTION READY |
| Audit logging | ✅ PRODUCTION READY |
| Security HTTP headers (vercel.json) | ✅ PRODUCTION READY |
| URL rewrites (vercel.json) | ✅ PRODUCTION READY |
| Deep-link pre-fill (?checkIn=...) | ✅ PRODUCTION READY |
| Rate limiting (login) | 🟡 NEEDS TESTING — in-memory, resets on cold start |
| Admin CRUD reservations | 🟡 NEEDS TESTING |
| Admin dashboard stats | 🟡 NEEDS TESTING |
| Confirmation page (sessionStorage) | 🟡 NEEDS TESTING — breaks on tab close |
| Payment processing | 🟠 MOCK/DEMO — no real money |
| Confirmation email | 🟠 MOCK/DEMO — console.log only |
| OTA channel sync (Agoda, ixigo) | 🟠 MOCK/DEMO — logs only |
| Database / data persistence | 🔴 NOT IMPLEMENTED — JSON file only |
| Deployed Vercel data persistence | 🔴 NOT IMPLEMENTED — FS is read-only |
| Razorpay/Stripe integration | 🔴 NOT IMPLEMENTED |
| Real email service (Resend/SendGrid) | 🔴 NOT IMPLEMENTED |
| Booking lookup by reference (public) | 🔴 NOT IMPLEMENTED |
| Race-condition double-booking | ⚠️ SECURITY/RISK |
| AUTH_JWT_SECRET missing | ⚠️ SECURITY/RISK — crashes admin in production |
| Demo reservations polluting availability | ⚠️ SECURITY/RISK |
| Default admin credentials not rotated | ⚠️ SECURITY/RISK |

---

## A. CURRENT ARCHITECTURE

```
Browser (booking.html)
  └── js/booking-engine.js  (4-step flow, pure frontend orchestration)
        │
        ├── GET  /api/availability   ← api/availability.js
        │         └── api/_lib/availability.js  (overlap calc)
        │               └── api/_lib/db.js  (readJson: data/reservations.json)
        │
        └── POST /api/reservations  ← api/reservations.js
                  ├── api/_lib/validation.js
                  ├── api/_lib/availability.js  (final check before write)
                  ├── api/_lib/db.js            (writeJson: data/reservations.json)
                  ├── api/_lib/payment-mock.js  ← MOCK (always succeeds)
                  ├── api/_lib/email-mock.js    ← MOCK (console.log only)
                  └── api/_lib/ota-adapters.js  ← MOCK (console.log only)

Admin Panel (pages/admin/*.html)
  └── js/admin/*.js  →  api/admin/*.js  (auth-protected)
        └── api/_lib/auth.js  (JWT verify from httpOnly cookie)
              └── api/auth/login.js  (bcrypt verify → sign JWT → set cookie)

Storage: data/*.json  (flat JSON files, local filesystem only)
  ├── reservations.json   7 entries: 3 seeded demo + 4 test
  ├── guests.json
  ├── payments.json
  ├── room-types.json     7 room types with inventory counts
  ├── users.json          2 admin users (bcrypt-hashed passwords)
  ├── settings.json
  └── audit-logs.json
```

---

## B. WHAT IS ALREADY WORKING

1. **Complete 4-step booking UI** — step navigation, progress bar, mobile summary, real-time validation
2. **Server-side availability engine** — correctly counts overlapping bookings vs. per-type inventory
3. **Server-side pricing** — never trusts client-supplied prices; recalculates from room-types.json
4. **Server-side input validation** — all fields sanitised and validated in `api/_lib/validation.js`
5. **Race-condition partial guard** — `validateFinalAvailability()` re-checks just before writing
6. **UUID + SLR-YYYYMMDD-XXXX booking references** generated server-side
7. **Confirmation page** — renders from sessionStorage after successful booking
8. **Admin authentication** — JWT + httpOnly cookie + bcrypt-hashed passwords
9. **Admin role access control** — `requireAdmin` / `requireStaff` middleware on all admin endpoints
10. **Admin reservation list** — search, filters, pagination, status update, audit log
11. **Security HTTP headers** — CSP, X-Frame-Options, Referrer-Policy in vercel.json
12. **URL rewrites** — clean URLs: `/booking`, `/admin/dashboard`, `/booking-confirmation` etc.
13. **Deep-link pre-fill** — `?checkIn=&checkOut=&adults=` URL params pre-populate Step 1
14. **Local persistence** works under `vercel dev` — JSON files survive server restarts

---

## C. WHAT IS FAKE / MOCK

| System | File | Reality |
|---|---|---|
| **Payment** | `api/_lib/payment-mock.js` | Always returns `verified: true`. No real charge. MOCK-ORDER-* IDs. |
| **Email** | `api/_lib/email-mock.js` | `console.log()` only. Zero emails sent to guests or admins. |
| **OTA Sync** | `api/_lib/ota-adapters.js` | `console.log()` only. No Agoda/ixigo/Booking.com API calls. |
| **Database** | `api/_lib/db.js` | JSON files. Breaks on deployed Vercel (read-only filesystem). |
| **Rate limiting** | `api/_lib/rate-limit.js` | In-memory `Map()`. Resets on every serverless cold start. |
| **Demo data** | `data/reservations.json` | 7 fake bookings polluting real availability counts. |

---

## D. WHAT MUST BE BUILT

1. **Real database** (Supabase / Vercel Postgres / PlanetScale / MongoDB Atlas) — replace `db.js` file I/O with ORM/SQL queries and transactions
2. **Atomic booking transaction** — database row-level lock or `SELECT FOR UPDATE` to prevent double-booking
3. **Real payment gateway** — Razorpay (recommended for INR): create order → Razorpay checkout widget → server-side webhook signature verify → then write reservation
4. **Real email service** — Resend or SendGrid: confirmation email on booking, cancellation email on cancel
5. **Public booking lookup endpoint** — `GET /api/reservation?ref=SLR-xxxx` so confirmation page works after tab close
6. **Confirmation page durability** — fall back to API call if sessionStorage is empty
7. **OTA channel manager** — SiteMinder or Cloudbeds (or manage manually for small property)
8. **Admin password change UI** — no current way to update passwords without running seed script
9. **Persistent rate limiting** — Redis/Upstash instead of in-memory Map

---

## E. WHAT MUST BE CONFIGURED IN VERCEL

**Vercel Dashboard → Your Project → Settings → Environment Variables**

| Variable | Value |
|---|---|
| `AUTH_JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `DATABASE_URL` | PostgreSQL/Supabase connection string |
| `PAYMENT_PROVIDER` | `razorpay` |
| `PAYMENT_RAZORPAY_KEY_ID` | From Razorpay dashboard |
| `PAYMENT_RAZORPAY_KEY_SECRET` | From Razorpay dashboard |
| `EMAIL_PROVIDER` | `resend` or `sendgrid` |
| `EMAIL_API_KEY` | From your email provider |
| `EMAIL_FROM` | `reservations@silverlineresort.in` |
| `HOTEL_NAME` | `Silverline Resort` |
| `HOTEL_PHONE` | `+91 86384 79919` |

> [!CAUTION]
> `AUTH_JWT_SECRET` is **FATAL** if missing — the admin panel throws an error on every request in production and becomes completely inaccessible.

---

## F. EXACT STEPS REQUIRED TO MAKE REAL BOOKINGS LIVE

### Step 1 — Vercel Login (Current Blocker)
Right now `http-server` is serving only static files — **API endpoints do not work at all** in your current local setup. The booking form will fail at Step 2 (availability check) and Step 4 (submit).

```bash
npx vercel login
```
Authenticate with your Vercel account. Then use `npx vercel dev` instead of `http-server` to run locally with working APIs.

---

### Step 2 — Set Up a Real Database
1. Create a free [Supabase](https://supabase.com) project → copy the connection string
2. Rewrite `api/_lib/db.js` to use `@supabase/supabase-js` or `pg`/Prisma instead of `fs.readFileSync`
3. Create tables: `reservations`, `guests`, `payments`, `room_types`, `users`, `settings`, `audit_logs`
4. Add `DATABASE_URL` to Vercel Environment Variables
5. All `readJson`/`writeJson` calls become SQL queries with transactions (eliminates the race condition)

---

### Step 3 — Add Real Payment (Razorpay)
1. Create a [Razorpay](https://razorpay.com) account → get Key ID and Key Secret
2. Replace `api/_lib/payment-mock.js` with Razorpay SDK (`npm install razorpay`)
3. Flow: server creates Razorpay order → returns `orderId` to frontend → frontend renders Razorpay checkout widget → customer pays → server verifies HMAC signature → write reservation only on verified payment
4. Set `PAYMENT_PROVIDER=razorpay`, `PAYMENT_RAZORPAY_KEY_ID`, `PAYMENT_RAZORPAY_KEY_SECRET` in Vercel

---

### Step 4 — Add Real Email (Resend)
1. Create a [Resend](https://resend.com) account → get API key (`re_...`)
2. Verify your sending domain `silverlineresort.in` in Resend DNS settings
3. Replace `api/_lib/email-mock.js` with Resend SDK (`npm install resend`)
4. Set `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY=re_...` in Vercel

---

### Step 5 — Fix Confirmation Page Durability
1. Add public endpoint: `GET /api/reservation?ref=SLR-xxxx` that returns booking details (no auth required, ref is unguessable enough)
2. Update `js/booking-confirmation.js` to call this API if `sessionStorage.getItem('slr_booking')` is empty
3. Guests can now share or revisit their confirmation URL

---

### Step 6 — Generate JWT Secret and Set All Env Vars
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the output → Vercel Dashboard → Environment Variables → `AUTH_JWT_SECRET`

Then add all other variables from Section E.

---

### Step 7 — Change Admin Credentials
1. Open `scripts/seed.js` → update email and password for the admin account
2. Run `node scripts/seed.js` to regenerate `data/users.json` (or insert directly into your database)
3. **Do not ship default credentials** — the current `admin@silverlineresort.in` password is known

---

### Step 8 — Clear Demo Data
```bash
# Set reservations.json to empty array before going live
echo "[]" > data/reservations.json
```
This removes the 7 seeded/test reservations so availability is clean from day 1.

---

### Step 9 — Deploy to Production
```bash
npx vercel --prod
```
Then test the full booking flow end-to-end:
- Customer books → Razorpay checkout → payment confirmed → confirmation email received
- Admin logs in → sees the reservation in the dashboard
- Refresh confirmation page after closing tab → still shows booking details (via API lookup)

---

> **Bottom line:** The booking system is a well-architected prototype. The frontend UX, server-side validation, availability logic, pricing engine, admin panel, and authentication are all production-quality code. The **three hard blockers** before real customers can book are:
> 1. 🔴 No real database — data is lost on every Vercel deployment
> 2. 🔴 No real payment — no money is collected from customers
> 3. 🔴 No real email — guests receive zero confirmation after booking
