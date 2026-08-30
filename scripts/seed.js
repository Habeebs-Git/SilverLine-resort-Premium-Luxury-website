/**
 * SILVERLINE RESORT — Database seed script
 * Generates demo users with proper bcrypt hashes and sample reservation data.
 * Run: node scripts/seed.js
 *
 * ⚠ DEVELOPMENT ONLY — Never use these credentials in production.
 */

'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function writeJson(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✓ Written: data/${filename}`);
}

async function seed() {
  console.log('\n🌿 Silverline Resort — Seeding demo data...\n');

  // ─── Users (admin + staff) ────────────────────────────────────────────────
  const SALT_ROUNDS = 12;
  const adminHash = await bcrypt.hash('SilverlineAdmin2026!', SALT_ROUNDS);
  const staffHash = await bcrypt.hash('SilverlineStaff2026!', SALT_ROUNDS);

  const users = [
    {
      id: uuidv4(),
      name: 'Resort Administrator',
      email: 'admin@silverlineresort.in',
      role: 'admin',
      passwordHash: adminHash,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: 'Front Desk Staff',
      email: 'staff@silverlineresort.in',
      role: 'staff',
      passwordHash: staffHash,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  writeJson('users.json', users);

  // ─── Sample Guests ────────────────────────────────────────────────────────
  const guestIds = [uuidv4(), uuidv4(), uuidv4()];
  const guests = [
    {
      id: guestIds[0],
      name: 'Arjun Mehta',
      email: 'arjun.mehta@example.com',
      phone: '+919876543210',
      address: 'Mumbai, Maharashtra',
      notes: 'Prefers high floor. Anniversary trip.',
      createdAt: new Date(Date.now() - 86400000 * 15).toISOString()
    },
    {
      id: guestIds[1],
      name: 'Priya Krishnamurthy',
      email: 'priya.k@example.com',
      phone: '+919988776655',
      address: 'Bangalore, Karnataka',
      notes: '',
      createdAt: new Date(Date.now() - 86400000 * 8).toISOString()
    },
    {
      id: guestIds[2],
      name: 'Rajesh Nair',
      email: 'rajesh.nair@example.com',
      phone: '+917788990011',
      address: 'Chennai, Tamil Nadu',
      notes: 'Family of 4. Extra blankets requested.',
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
    }
  ];
  writeJson('guests.json', guests);

  // ─── Sample Reservations ──────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toISOString().split('T')[0];
  }

  function makeRef() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    return `SLR-${ymd}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  }

  const TAX_RATE = 0.12;

  function calcPricing(price, nights) {
    const subtotal = price * nights;
    const taxes = Math.round(subtotal * TAX_RATE);
    const total = subtotal + taxes;
    return { subtotal, taxes, total };
  }

  const reservations = [
    // Currently checked-in
    {
      id: uuidv4(),
      bookingReference: makeRef(),
      guestId: guestIds[0],
      guestName: 'Arjun Mehta',
      guestEmail: 'arjun.mehta@example.com',
      guestPhone: '+919876543210',
      roomTypeId: 'suite-with-balcony',
      roomTypeName: 'Suite with Balcony',
      checkIn: addDays(today, -1),
      checkOut: addDays(today, 2),
      nights: 3,
      adults: 2,
      children: 0,
      specialRequests: 'Anniversary trip. Flowers in room if possible.',
      basePrice: 4000,
      ...calcPricing(4000, 3),
      currency: 'INR',
      status: 'checked-in',
      paymentStatus: 'paid',
      paymentProvider: 'mock',
      paymentReference: 'MOCK-PAY-' + Math.random().toString(36).slice(2,10).toUpperCase(),
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString()
    },
    // Arriving today
    {
      id: uuidv4(),
      bookingReference: makeRef(),
      guestId: guestIds[1],
      guestName: 'Priya Krishnamurthy',
      guestEmail: 'priya.k@example.com',
      guestPhone: '+919988776655',
      roomTypeId: 'deluxe-room',
      roomTypeName: 'Deluxe Room',
      checkIn: addDays(today, 0),
      checkOut: addDays(today, 3),
      nights: 3,
      adults: 2,
      children: 0,
      specialRequests: '',
      basePrice: 3500,
      ...calcPricing(3500, 3),
      currency: 'INR',
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentProvider: 'mock',
      paymentReference: 'MOCK-PAY-' + Math.random().toString(36).slice(2,10).toUpperCase(),
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 3).toISOString()
    },
    // Future booking
    {
      id: uuidv4(),
      bookingReference: makeRef(),
      guestId: guestIds[2],
      guestName: 'Rajesh Nair',
      guestEmail: 'rajesh.nair@example.com',
      guestPhone: '+917788990011',
      roomTypeId: 'two-bedroom-deluxe-suite',
      roomTypeName: '2 Bedroom Deluxe Suite',
      checkIn: addDays(today, 4),
      checkOut: addDays(today, 7),
      nights: 3,
      adults: 4,
      children: 0,
      specialRequests: 'Family of 4. Extra blankets please.',
      basePrice: 5500,
      ...calcPricing(5500, 3),
      currency: 'INR',
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentProvider: 'mock',
      paymentReference: 'MOCK-PAY-' + Math.random().toString(36).slice(2,10).toUpperCase(),
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString()
    }
  ];
  writeJson('reservations.json', reservations);
  writeJson('payments.json', []);
  writeJson('audit-logs.json', []);

  console.log('\n✅ Seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠  DEMO CREDENTIALS — DEVELOPMENT ONLY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Admin:  admin@silverlineresort.in');
  console.log('        SilverlineAdmin2026!');
  console.log('Staff:  staff@silverlineresort.in');
  console.log('        SilverlineStaff2026!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Next: set AUTH_JWT_SECRET in .env then run: vercel dev\n');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
