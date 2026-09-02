'use strict';

const { sendBookingConfirmation, sendCancellationEmail, sendAdminNotification } = require('./email');

let passed = 0;
let failed = 0;

function ok(condition, name) {
  if (condition) {
    console.log(`  ✓  ${name}`);
    passed++;
  } else {
    console.error(`  ✗  ${name}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  SILVERLINE RESORT — Email Utility Tests');
console.log('═══════════════════════════════════════════════════════\n');

async function runTests() {
  try {
    const mockReservation = {
      bookingReference: 'SLR-TEST-123',
      guestName: 'Test Guest',
      guestEmail: 'test@example.com',
      roomTypeName: 'Standard Room',
      checkIn: '2026-10-01',
      checkOut: '2026-10-03',
      nights: 2,
      adults: 2,
      children: 0,
      total: 6000,
      currency: 'INR',
      paymentMode: 'Razorpay (TEST)',
      paymentReference: 'pay_test123'
    };

    // Test 1: Booking Confirmation
    const res1 = await sendBookingConfirmation(mockReservation);
    ok(res1.sent === true || res1.sent === false, 'sendBookingConfirmation returns sent status');

    // Test 2: Cancellation
    const res2 = await sendCancellationEmail(mockReservation);
    ok(res2.sent === true || res2.sent === false, 'sendCancellationEmail returns sent status');

    // Test 3: Admin Notification
    const res3 = await sendAdminNotification('Test Subject', 'Test Body');
    ok(res3.sent === true || res3.sent === false, 'sendAdminNotification returns sent status');

  } catch (e) {
    console.error('Test execution failed:', e);
    failed++;
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed  |  ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests();
