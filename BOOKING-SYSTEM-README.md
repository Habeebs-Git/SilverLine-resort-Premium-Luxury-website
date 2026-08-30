# Silverline Resort — Direct Booking System

> **Status: Prototype / Development** — JSON-file persistence, mock payment provider, mock email. Not production-ready as-is.

---

## Overview

A full-stack direct booking system built as an extension to the Silverline Resort website (Ooty, Tamil Nadu). Guests can search availability, select a room, enter details, complete a demo payment, and receive a booking reference — all without leaving the resort's own site.

An administration panel is included for managing reservations, viewing occupancy, and maintaining settings.

---

## Architecture

```
silverline-resort-ooty-homepage/
├── api/                        # Vercel serverless functions
│   ├── _lib/                   # Shared libraries
│   │   ├── db.js               # JSON file persistence layer
│   │   ├── auth.js             # JWT authentication (httpOnly cookies)
│   │   ├── availability.js     # Availability engine + pricing
│   │   ├── validation.js       # Server-side input validation
│   │   ├── payment-mock.js     # Mock payment provider (never real charges)
│   │   ├── email-mock.js       # Mock email confirmations
│   │   ├── ota-adapters.js     # Mock OTA channel stubs
│   │   ├── rate-limit.js       # In-memory auth rate limiting
│   │   └── availability.test.js # Unit test suite
│   ├── admin/                  # Admin-only endpoints (auth-gated)
│   │   ├── dashboard.js        # Occupancy + revenue stats
│   │   ├── reservations.js     # List all reservations
│   │   ├── reservations/[id].js # Update reservation status
│   │   ├── rooms.js            # Room inventory
│   │   ├── guests.js           # Guest list
│   │   └── settings.js         # Resort settings CRUD
│   ├── auth/
│   │   ├── login.js            # POST /api/auth/login
│   │   ├── logout.js           # POST /api/auth/logout
│   │   └── me.js               # GET /api/auth/me (session check)
│   ├── availability.js         # GET /api/availability
│   ├── reservations.js         # POST /api/reservations (create booking)
│   └── reservation/[id].js     # GET /api/reservation/:id (lookup)
│
├── css/
│   ├── theme.css               # Global design tokens + existing site styles
│   ├── booking.css             # Booking flow styles
│   └── admin.css               # Admin panel styles
│
├── js/
│   ├── booking-engine.js       # Multi-step booking flow orchestration
│   ├── booking-confirmation.js # Confirmation page rendering
│   └── admin/
│       ├── auth.js             # Login + session guard + logout
│       ├── dashboard.js        # Dashboard stats rendering
│       ├── reservations.js     # Reservation list + detail modal
│       ├── rooms.js            # Room inventory display
│       ├── guests.js           # Guest list + search
│       ├── calendar.js         # Monthly availability calendar
│       └── settings.js         # Settings form CRUD
│
├── pages/
│   ├── booking.html            # Guest-facing booking flow
│   ├── booking-confirmation.html # Booking confirmation page
│   └── admin/
│       ├── login.html          # Admin login
│       ├── dashboard.html      # Overview + KPIs
│       ├── reservations.html   # Reservations table + filter + modal
│       ├── rooms.html          # Room inventory cards
│       ├── guests.html         # Guest directory
│       ├── calendar.html       # Monthly booking calendar
│       └── settings.html       # Resort configuration
│
├── data/                       # JSON file "database" (dev only)
│   ├── room-types.json         # 7 room types + pricing
│   ├── reservations.json       # Booking records
│   ├── guests.json             # Guest profiles
│   ├── payments.json           # Payment records (mock)
│   ├── audit-logs.json         # Admin action log
│   ├── settings.json           # Resort settings
│   └── users.json              # Admin/staff accounts (bcrypt hashed)
│
├── scripts/
│   ├── seed.js                 # Initial demo data + user creation
│   ├── full-audit.js           # Full project audit / CI check script
│   ├── check-urls.js           # URL consistency checker
│   ├── check-homepage.js       # Homepage booking link checker
│   └── fix-urls.js             # One-time URL migration helper
│
├── vercel.json                 # Route rewrites + security headers
└── .env.example                # Environment variable template
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set AUTH_JWT_SECRET to a long random string
```

### 3. Seed demo data

```bash
node scripts/seed.js
```

This creates hashed admin/staff users in `data/users.json` plus sample reservations.

### 4. Start local dev server

```bash
vercel dev
```

Or using the Vercel CLI:
```bash
npm install -g vercel
vercel dev
```

The site will be available at `http://localhost:3000`.

---

## Demo Credentials (created by seed.js)

| Role  | Email | Password |
|-------|-------|----------|
| Admin | admin@silverlineresort.in | SilverlineAdmin2026! |
| Staff | staff@silverlineresort.in | SilverlineStaff2026! |

> ⚠️ Change these before any staging or production deployment.

---

## Room Types & Pricing

| Room | Rate/Night | Max Guests |
|------|-----------|------------|
| Standard Room | ₹3,000 | 2 |
| Deluxe Room | ₹3,500 | 2 |
| Deluxe Balcony | ₹3,500 | 2 |
| Suite with Balcony | ₹4,000 | 2 |
| Deluxe Suite | ₹4,000 | 4 |
| 2 Bedroom Deluxe | ₹5,500 | 4 |
| 2 Bedroom Deluxe Suite | ₹5,500 | 4 |

All prices are per room per night, excluding GST (12%).

---

## Booking Flow

```
Guest visits /booking  (or /booking?room=ROOM_ID for deep link)
    ↓
Step 1 — Dates & Guests (check-in, check-out, adults, children)
    ↓
GET /api/availability → available rooms + pricing
    ↓
Step 2 — Select Room (room cards with pricing, urgency badges)
    ↓
Step 3 — Guest Details (name, email, phone, special requests)
    ↓
Step 4 — Review & Confirm (server-calculated total shown)
    ↓
POST /api/reservations → creates booking (DEMO payment auto-verified)
    ↓
Redirect to /booking-confirmation
    ↓
Confirmation page — booking reference, room, dates, pricing
```

---

## Admin Flow

```
/admin → redirects to /admin/login
    ↓
POST /api/auth/login → JWT issued in httpOnly cookie
    ↓
/admin/dashboard — occupancy, revenue, arrivals/departures
    ↓
/admin/reservations — list, filter, status update
    ↓
/admin/rooms — room inventory
    ↓
/admin/guests — guest directory
    ↓
/admin/calendar — monthly occupancy view
    ↓
/admin/settings — tax rate, booking rules, contact info
```

---

## Security Design

| Control | Implementation |
|---------|---------------|
| Authentication | JWT in httpOnly, SameSite=Strict cookie |
| Admin authorization | Server-side role check on every admin endpoint |
| Price calculation | Always server-side — client cannot submit price |
| Availability check | Server-side re-check before reservation creation |
| Input validation | All inputs sanitised and validated server-side |
| Rate limiting | Max 10 login attempts per 15 minutes per IP |
| Login error messages | Generic (never reveals whether account exists) |
| IDOR prevention | Reservations served only to owner or admin |
| XSS protection | Content-Security-Policy headers in vercel.json |
| Clickjacking | X-Frame-Options DENY |
| MIME sniffing | X-Content-Type-Options nosniff |

---

## Running Tests

```bash
node api/_lib/availability.test.js
```

26 tests covering:
- Date range validation (past dates, 0-night stays, reversed dates)
- Guest count validation
- Pricing and GST calculation
- Availability engine (overlap detection, capacity, cancellation)
- Input validation (email, phone, required fields, capacity limits)

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AUTH_JWT_SECRET` | Secret key for JWT signing (min 32 chars) | ✅ |
| `AUTH_COOKIE_NAME` | Cookie name (default: `slr_session`) | Optional |
| `NODE_ENV` | `development` or `production` | Optional |

---

## Known Limitations (Prototype)

1. **JSON file storage** — Not suitable for concurrent writes in production. Use PostgreSQL, MongoDB, or similar.
2. **Mock payment** — All payments are simulated. No real money is ever charged or transferred. Clearly marked as DEMO.
3. **Mock email** — Confirmation emails are logged to console, not actually sent. Integrate SendGrid/SES for production.
4. **No real OTA sync** — OTA channel adapters return mock data. Real PMS/channel manager integration is required for live inventory.
5. **In-memory rate limiting** — Resets on serverless cold starts. Use Redis for persistent rate limiting.
6. **No image upload** — Room images are static files. A production system would need a media upload/CDN pipeline.
7. **No multi-property support** — Designed for a single resort.
8. **Vercel serverless** — State is not shared between function invocations for in-memory data (rate limiter only). Data is persisted via JSON files to the mounted filesystem (development only — use a proper DB for production Vercel deployment).

---

## Deployment Checklist

Before deploying to any environment other than local:

- [ ] Set `AUTH_JWT_SECRET` to a secure random value (minimum 32 characters)
- [ ] Remove or rotate seed credentials
- [ ] Replace JSON file storage with a real database
- [ ] Configure a real payment provider (Razorpay / Stripe)
- [ ] Configure a real email provider (SendGrid / SES / Nodemailer)
- [ ] Review and tighten CSP headers in `vercel.json`
- [ ] Enable HTTPS (automatic on Vercel)
- [ ] Set `NODE_ENV=production`
- [ ] Consider Redis for rate limiting in production
- [ ] Test all booking flows end-to-end in staging

---

## Design Philosophy

The booking system is intentionally designed to feel like a natural extension of the Silverline Resort brand:

- **Typography**: Cormorant Garamond (display) + Jost (body) — matching the existing site
- **Palette**: charcoal / forest / pine / teak / ivory — from `css/theme.css`
- **Motion**: Restrained, cinematic transitions. No gratuitous animation.
- **Admin**: Dense and functional but still visually consistent with the resort's luxury aesthetic
- **No generic SaaS look** — no Bootstrap, no Tailwind, no template components

---

*Last updated: August 2026 · Branch: booking-system-development*
