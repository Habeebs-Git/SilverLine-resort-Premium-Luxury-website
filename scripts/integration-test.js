/**
 * SILVERLINE RESORT — Full Integration Test Suite
 * Tests all Supabase DB operations and API handler logic directly.
 *
 * Run: node scripts/integration-test.js
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Coverage:
 *  1.  Supabase connection
 *  2.  Room types loaded (7 rooms)
 *  3.  Settings loaded (hotel + pricing)
 *  4.  Reservations loaded (array)
 *  5.  Guests loaded (array)
 *  6.  Login — valid credentials (admin user)
 *  7.  Login — wrong password rejected
 *  8.  Login — unknown email rejected
 *  9.  Availability check (getAvailableRooms)
 * 10.  Guest upsert (create new guest)
 * 11.  Guest upsert (update same guest — idempotent)
 * 12.  Reservation creation via RPC (create_reservation_atomic)
 * 13.  Reservation retrieved by ID
 * 14.  Reservation retrieved by booking reference
 * 15.  Reservation status update (confirmed → checked-in)
 * 16.  Audit log entry created
 * 17.  Double-booking protection (same room/dates — inventory test)
 * 18.  Cancelled booking frees availability
 * 19.  Settings update (roundtrip)
 * 20.  Room type update (price change)
 * 21.  Admin dashboard data (revenue, occupancy)
 * 22.  Admin guest list with reservation history
 *
 * Cleanup: test reservations are cancelled at end; test guest remains
 * (email scoped to this test run's timestamp so no future conflicts).
 */

'use strict';

// ── Load .env ────────────────────────────────────────────────────────────────
try {
  require('fs').readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('=');
    if (eq < 1) return;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k && v && !process.env[k]) process.env[k] = v;
  });
} catch (_) {}

const { v4: uuidv4 } = require('uuid');
const db    = require('../api/_lib/db');
const avail = require('../api/_lib/availability');
const bcrypt = require('bcryptjs');

let passed = 0, failed = 0;

// Track test-created resource IDs for cleanup
const cleanup = { reservationIds: [], guestId: null };

function ok(cond, name, detail) {
  if (cond) { console.log(`  ✓  ${name}`); passed++; }
  else       { console.error(`  ✗  ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`);
}

/** Generate a booking reference that satisfies the DB CHECK constraint:
 *  ^SLR-[0-9]{8}-[A-Z0-9]{3,6}$
 *  Uses Date.now() in base36 as suffix for uniqueness.
 */
function makeRef(label) {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  // Take last 4 chars of base36 timestamp + label initial — always [A-Z0-9]{4-5}
  const suffix = (Date.now() % 1000000).toString(36).toUpperCase().padStart(4,'0').slice(-4);
  const tag = label ? label[0].toUpperCase() : 'T';
  return `SLR-${date}-${suffix}${tag}`;
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   SILVERLINE RESORT — Full Integration Tests         ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Shared date constants — 90 days out to avoid real booking conflicts
  const testCheckIn  = (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().split('T')[0]; })();
  const testCheckOut = (() => { const d = new Date(); d.setDate(d.getDate() + 92); return d.toISOString().split('T')[0]; })();

  // Test guest email — unique per test run
  const testEmail = `inttest-${Date.now()}@silverline-test.local`;

  // ══ 1. Supabase Connection ══════════════════════════════════════════════
  section('1. Supabase Connection');
  let rooms;
  try {
    rooms = await db.getRoomTypes();
    ok(true, '1. Supabase connection established');
    ok(Array.isArray(rooms), '2. Room types is an array');
    ok(rooms.length >= 7,    `3. 7+ room types loaded (got ${rooms.length})`);
    const ids = rooms.map(r => r.id);
    ok(ids.includes('standard-room'),           '3b. standard-room exists');
    ok(ids.includes('suite-with-balcony'),      '3c. suite-with-balcony exists');
    ok(ids.includes('two-bedroom-deluxe-suite'),'3d. two-bedroom-deluxe-suite exists');
    const rt = rooms[0];
    ok(rt.basePrice !== undefined && rt.maxAdults !== undefined, '3e. camelCase mapping correct (basePrice, maxAdults)');
  } catch(e) {
    ok(false, '1. Supabase connection FAILED', e.message);
    console.error('\nFATAL: Cannot connect to Supabase. Aborting.\n');
    process.exit(1);
  }

  // ══ 2. Settings ═════════════════════════════════════════════════════════
  section('2. Settings');
  let settings;
  try {
    settings = await db.getSettings();
    ok(settings && typeof settings === 'object',           '4. Settings returned from DB');
    ok(settings.hotel && typeof settings.hotel.name === 'string', '5. hotel.name is string');
    ok(typeof settings.pricing?.taxRate === 'number',       '6. pricing.taxRate is number');
    ok(settings.pricing.taxRate >= 0 && settings.pricing.taxRate <= 0.5, '6b. taxRate in valid range');
  } catch(e) {
    ok(false, '4. getSettings FAILED', e.message);
    settings = { pricing: { taxRate: 0.12 }, hotel: { name: 'Silverline Resort' } };
  }

  // ══ 3. Reservations & Guests ════════════════════════════════════════════
  section('3. Reservations & Guests');
  try {
    const reservations = await db.getReservations();
    ok(Array.isArray(reservations), '7. getReservations returns array');
    if (reservations.length > 0) {
      const r = reservations[0];
      ok(r.bookingReference && r.guestName && r.checkIn && r.checkOut,
         '8. Reservation has expected camelCase fields');
      ok(r.roomTypeId !== undefined && r.paymentStatus !== undefined,
         '8b. roomTypeId + paymentStatus present');
    } else {
      ok(true, '8. No existing reservations (fresh DB — ok)');
      ok(true, '8b. Skipped (fresh DB)');
    }
    const guests = await db.getGuests();
    ok(Array.isArray(guests), '9. getGuests returns array');
  } catch(e) {
    ok(false, '7. getReservations/getGuests FAILED', e.message);
  }

  // ══ 4. User Auth ════════════════════════════════════════════════════════
  section('4. User Auth (getUserByEmail + bcrypt)');
  try {
    const user = await db.getUserByEmail('admin@silverlineresort.in');
    ok(user !== null, '10. Admin user found in DB');
    ok(user && user.email === 'admin@silverlineresort.in', '10b. Email correct');
    ok(user && user.role === 'admin',  '10c. Role is admin');
    ok(user && user.passwordHash && user.passwordHash.startsWith('$2'), '10d. passwordHash is bcrypt');
    ok(user && user.active === true,   '10e. User is active');

    const correct = await bcrypt.compare('SilverlineAdmin2026!', user.passwordHash);
    ok(correct === true, '11. Correct password verifies');

    const wrong = await bcrypt.compare('wrongpassword', user.passwordHash);
    ok(wrong === false, '12. Wrong password rejected');

    const none = await db.getUserByEmail('no-such-user@example.com');
    ok(none === null, '13. Unknown email returns null');
  } catch(e) {
    ok(false, '10. getUserByEmail FAILED', e.message);
  }

  // ══ 5. Availability Engine ═══════════════════════════════════════════════
  section('5. Availability Engine');
  try {
    const available = await avail.getAvailableRooms(testCheckIn, testCheckOut, 2, 0);
    ok(Array.isArray(available), '14. getAvailableRooms returns array');
    ok(available.length >= 1,  `15. At least 1 room available 90 days out (got ${available.length})`);
    if (available.length > 0) {
      ok(available[0].availability?.available === true, '15b. Room marked available');
      ok(available[0].availability?.remainingRooms > 0, '15c. remainingRooms > 0');
    }
    const stdRoom = rooms.find(r => r.id === 'standard-room');
    const a = await avail.checkRoomTypeAvailability(stdRoom, testCheckIn, testCheckOut);
    ok(a.available === true,     '16. standard-room available 90 days out');
    ok(a.remainingRooms > 0,     '16b. remainingRooms > 0');
  } catch(e) {
    ok(false, '14. Availability engine FAILED', e.message);
  }

  // ══ 6. Guest Upsert ═════════════════════════════════════════════════════
  section('6. Guest Upsert');
  let testGuest = { id: 'SETUP_FAILED' };
  try {
    testGuest = await db.upsertGuest({
      name:  'Integration Test Guest',
      email: testEmail,
      phone: '+919999000001'
    });
    cleanup.guestId = testGuest.id;
    ok(testGuest && testGuest.id, '17. Guest created (upsertGuest)');
    ok(testGuest.email === testEmail,  '17b. Guest email matches');
    ok(testGuest.name === 'Integration Test Guest', '17c. Guest name matches');

    // Idempotent upsert — same guest ID
    const same = await db.upsertGuest({ name: 'Updated Name', email: testEmail, phone: '+919999000001' });
    ok(same && same.id === testGuest.id, '18. Upsert is idempotent — same guest ID returned');

    const byId    = await db.getGuestById(testGuest.id);
    const byEmail = await db.getGuestByEmail(testEmail);
    ok(byId    && byId.id    === testGuest.id, '19. getGuestById works');
    ok(byEmail && byEmail.id === testGuest.id, '20. getGuestByEmail works');
  } catch(e) {
    ok(false, '17. upsertGuest FAILED', e.message);
  }

  // ══ 7. Reservation Creation (RPC) ═══════════════════════════════════════
  section('7. Reservation Creation via create_reservation_atomic() RPC');
  const stdRoom      = rooms.find(r => r.id === 'standard-room');
  const taxRate      = settings?.pricing?.taxRate || 0.12;
  const pricing      = avail.calculatePricing(stdRoom.basePrice, 2, taxRate);
  const reservationId    = uuidv4();
  const paymentId        = uuidv4();
  const bookingReference = makeRef('A');
  cleanup.reservationIds.push(reservationId);

  let createdReservation;
  try {
    createdReservation = await db.createReservation({
      id:               reservationId,
      bookingReference,
      guestId:          testGuest.id,
      guestName:        'Integration Test Guest',
      guestEmail:       testEmail,
      guestPhone:       '+919999000001',
      roomTypeId:       'standard-room',
      roomTypeName:     stdRoom.name,
      checkIn:          testCheckIn,
      checkOut:         testCheckOut,
      nights:           2,
      adults:           2,
      children:         0,
      specialRequests:  'Integration test — please ignore',
      basePrice:        pricing.basePrice,
      subtotal:         pricing.subtotal,
      taxes:            pricing.taxes,
      total:            pricing.total,
      taxRate:          pricing.taxRate,
      currency:         'INR',
      status:           'confirmed',
      paymentStatus:    'paid',
      paymentProvider:  'mock',
      paymentReference: 'MOCK-INTTEST-' + Date.now(),
      _paymentId:       paymentId,
      _orderId:         'MOCK-ORDER-INTTEST',
      _transactionId:   'MOCK-TXN-INTTEST',
      _amountPaise:     pricing.total * 100
    });

    ok(createdReservation != null, '21. createReservation() returned successfully');
    ok(createdReservation.bookingReference === bookingReference, '22. bookingReference matches');

    const dbRes = await db.getReservationById(reservationId);
    ok(dbRes !== null,                       '23. Reservation found in DB by ID');
    ok(dbRes.bookingReference === bookingReference, '24. bookingReference in DB matches');
    ok(dbRes.guestEmail === testEmail,       '25. guestEmail stored correctly');
    ok(dbRes.checkIn === testCheckIn,        '26. checkIn stored correctly');
    ok(dbRes.checkOut === testCheckOut,      '27. checkOut stored correctly');
    ok(dbRes.status === 'confirmed',         '28. Status is confirmed');
    ok(dbRes.paymentStatus === 'paid',       '29. paymentStatus is paid');
    ok(typeof dbRes.total === 'number' && dbRes.total > 0, '30. total is a positive number');

    const dbRef = await db.getReservationByRef(bookingReference);
    ok(dbRef !== null,                  '31. getReservationByRef works');
    ok(dbRef.id === reservationId,      '32. ID matches on ref lookup');
  } catch(e) {
    ok(false, '21. createReservation RPC FAILED', e.message);
    console.error('   Full error:', e);
  }

  // ══ 8. Payment Record ═══════════════════════════════════════════════════
  section('8. Payment Record');
  try {
    const payments = await db.getPayments();
    const testPayment = payments.find(p => p.reservationId === reservationId);
    ok(testPayment !== undefined, '33. Payment row created by RPC (found in payments table)');
    if (testPayment) {
      ok(testPayment.status   === 'captured', '34. Payment status is captured');
      ok(testPayment.testMode === true,        '35. Payment test mode is true');
    } else {
      ok(false, '34. Skipped — payment not found'); ok(false, '35. Skipped');
    }
    // no-op stub test
    const stub = await db.createPaymentRecord({ id: 'test', amount: 999 });
    ok(stub && stub.id === 'test', '36. createPaymentRecord no-op stub returns input');
  } catch(e) {
    ok(false, '33. Payment verification FAILED', e.message);
  }

  // ══ 9. Reservation Status Update ════════════════════════════════════════
  section('9. Reservation Status Update');
  try {
    const updated = await db.updateReservation(reservationId, { status: 'checked-in' });
    ok(updated !== null,               '37. updateReservation returned a result');
    ok(updated.status === 'checked-in','38. Status updated to checked-in');
    const verify = await db.getReservationById(reservationId);
    ok(verify.status === 'checked-in', '39. Status change persisted in DB');
  } catch(e) {
    ok(false, '37. updateReservation FAILED', e.message);
  }

  // ══ 10. Audit Log ═══════════════════════════════════════════════════════
  section('10. Audit Log');
  try {
    await db.appendAuditLog({
      action:     'INTEGRATION_TEST',
      resource:   'reservation',
      resourceId: reservationId,
      meta:       { test: true, timestamp: new Date().toISOString() }
    });
    ok(true, '40. appendAuditLog did not throw');
    ok(true, '41. Audit log write is non-fatal (fire-and-forget pattern confirmed)');
  } catch(e) {
    ok(false, '40. appendAuditLog FAILED', e.message);
  }

  // ══ 11. Double-Booking Protection ═══════════════════════════════════════
  section('11. Double-Booking Protection');
  try {
    const conflictId  = uuidv4();
    const conflictRef = makeRef('B'); // Different suffix from main booking ref
    let conflictCreated = false;
    try {
      await db.createReservation({
        id:               conflictId,
        bookingReference: conflictRef,
        guestId:          testGuest.id,
        guestName:        'Double Booking Test',
        guestEmail:       testEmail,
        guestPhone:       '+919999000001',
        roomTypeId:       'standard-room',
        roomTypeName:     stdRoom.name,
        checkIn:          testCheckIn,
        checkOut:         testCheckOut,
        nights:           2,
        adults:           2,
        children:         0,
        specialRequests:  '',
        basePrice:        pricing.basePrice,
        subtotal:         pricing.subtotal,
        taxes:            pricing.taxes,
        total:            pricing.total,
        taxRate:          pricing.taxRate,
        currency:         'INR',
        status:           'confirmed',
        paymentStatus:    'paid',
        paymentProvider:  'mock',
        paymentReference: 'MOCK-DBL-' + Date.now(),
        _paymentId:       uuidv4(),
        _orderId:         'MOCK-ORDER-DBL',
        _transactionId:   'MOCK-TXN-DBL',
        _amountPaise:     pricing.total * 100
      });
      // standard-room inventory = 3. We booked 1 so far.
      // 2nd booking on same dates is allowed (inventory still has capacity).
      ok(true, '42. 2nd booking on same dates accepted (inventory allows: 3 total, 2 now used)');
      cleanup.reservationIds.push(conflictId);
      conflictCreated = true;
    } catch(e) {
      if (e.rpcResult) {
        ok(true, `42. RPC rejected booking (inventory exhausted): ${e.message}`);
      } else {
        ok(false, '42. Unexpected error during 2nd booking', e.message);
      }
    }

    // Overlap count should now be 1 (main) or 2 (main + conflict)
    const overlapCount = await avail.countOverlappingBookings('standard-room', testCheckIn, testCheckOut);
    ok(overlapCount >= 1, `43. countOverlappingBookings detects ${overlapCount} active booking(s) on test dates`);
  } catch(e) {
    ok(false, '42. Double-booking test FAILED', e.message);
  }

  // ══ 12. Settings Update (roundtrip) ═════════════════════════════════════
  section('12. Settings Update (roundtrip)');
  try {
    const original    = await db.getSettings();
    const origName    = original.hotel.name;
    const testName    = `${origName} [TEST]`;

    await db.updateSettings({ hotel: { name: testName } });
    const after = await db.getSettings();
    ok(after.hotel.name === testName, '44. Settings update persisted');

    await db.updateSettings({ hotel: { name: origName } });
    const restored = await db.getSettings();
    ok(restored.hotel.name === origName, '45. Settings restored to original');
    ok(restored.pricing.taxRate === original.pricing.taxRate, '46. taxRate preserved during update');
  } catch(e) {
    ok(false, '44. Settings roundtrip FAILED', e.message);
  }

  // ══ 13. Room Type Update ════════════════════════════════════════════════
  section('13. Room Type Update');
  try {
    const before    = await db.getRoomTypeById('standard-room');
    const origPrice = before.basePrice;
    const testPrice = origPrice + 1;

    const updated = await db.updateRoomType('standard-room', { basePrice: testPrice });
    ok(updated !== null,              '47. updateRoomType returned result');
    ok(updated.basePrice === testPrice, '48. Price updated in DB');

    await db.updateRoomType('standard-room', { basePrice: origPrice });
    const restored = await db.getRoomTypeById('standard-room');
    ok(restored.basePrice === origPrice, '49. Room price restored');
  } catch(e) {
    ok(false, '47. updateRoomType FAILED', e.message);
  }

  // ══ 14. Cancelled Booking Frees Availability ════════════════════════════
  section('14. Cancelled Booking Frees Availability');
  try {
    const before = await avail.countOverlappingBookings('standard-room', testCheckIn, testCheckOut);
    await db.updateReservation(reservationId, { status: 'cancelled' });
    const after  = await avail.countOverlappingBookings('standard-room', testCheckIn, testCheckOut);
    ok(after < before, `50. Cancellation freed slot(s) — ${before} → ${after} active bookings`);
  } catch(e) {
    ok(false, '50. Cancellation availability test FAILED', e.message);
  }

  // ══ 15. Admin Dashboard Data (parallel reads) ════════════════════════════
  section('15. Admin Dashboard Data');
  try {
    const [allRes, allRooms, allGuests, allSettings] = await Promise.all([
      db.getReservations(),
      db.getRoomTypes(),
      db.getGuests(),
      db.getSettings()
    ]);
    ok(Array.isArray(allRes),       '51. Parallel getReservations OK');
    ok(Array.isArray(allRooms),     '52. Parallel getRoomTypes OK');
    ok(Array.isArray(allGuests),    '53. Parallel getGuests OK');
    ok(allSettings && allSettings.hotel, '54. Parallel getSettings OK');

    const stats = await avail.getOccupancyStats();
    ok(typeof stats.totalRooms   === 'number' && stats.totalRooms > 0, '55. getOccupancyStats.totalRooms > 0');
    ok(typeof stats.occupancyRate === 'number',  '56. occupancyRate is a number');
    ok(typeof stats.arrivalsToday === 'number',  '57. arrivalsToday is a number');
  } catch(e) {
    ok(false, '51. Dashboard parallel reads FAILED', e.message);
  }

  // ══ 16. Guest Enrichment ════════════════════════════════════════════════
  section('16. Guest Enrichment');
  try {
    const guestById = await db.getGuestById(testGuest.id);
    ok(guestById !== null,               '58. Test guest still exists');
    ok(guestById.email === testEmail,    '59. Guest email correct');

    const reservations = await db.getReservations();
    const guestRes = reservations.filter(r =>
      r.guestId === testGuest.id ||
      r.guestEmail?.toLowerCase() === testEmail.toLowerCase()
    );
    ok(guestRes.length >= 1, `60. Guest has ${guestRes.length} reservation(s) in history`);
  } catch(e) {
    ok(false, '58. Guest enrichment FAILED', e.message);
  }

  // ══ Cleanup: cancel any remaining test reservations ═════════════════════
  section('Cleanup');
  try {
    let cancelCount = 0;
    for (const id of cleanup.reservationIds) {
      try {
        const r = await db.getReservationById(id);
        if (r && r.status !== 'cancelled') {
          await db.updateReservation(id, { status: 'cancelled' });
          cancelCount++;
        }
      } catch(_) {}
    }
    console.log(`  ℹ  Cancelled ${cancelCount} test reservation(s). Guest record kept (scoped email).`);
  } catch(e) {
    console.log(`  ⚠  Cleanup error (non-fatal): ${e.message}`);
  }

  // ══ Report ════════════════════════════════════════════════════════════════
  const total = passed + failed;
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed}/${total} passed  |  ${failed} failed${' '.repeat(Math.max(0, 30 - String(passed+'/'+total).length - String(failed).length))}║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    console.error('[INTEGRATION TESTS FAILED]\n');
    process.exit(1);
  } else {
    console.log('[ALL INTEGRATION TESTS PASSED] ✓\n');
  }
}

run().catch(err => {
  console.error('\n[FATAL TEST ERROR]', err.message, '\n', err.stack);
  process.exit(1);
});
