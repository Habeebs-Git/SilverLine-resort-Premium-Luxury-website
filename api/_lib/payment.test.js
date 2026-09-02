'use strict';

const crypto = require('crypto');

// Mock environment variables for testing
process.env.PAYMENT_RAZORPAY_KEY_SECRET = 'test_secret_key_123';

const { verifySignature } = require('./payment');

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
console.log('  SILVERLINE RESORT — Payment Utility Tests');
console.log('═══════════════════════════════════════════════════════\n');

try {
  const orderId = 'order_test123';
  const paymentId = 'pay_test456';
  const secret = process.env.PAYMENT_RAZORPAY_KEY_SECRET;

  // Generate a valid signature
  const validSignature = crypto
    .createHmac('sha256', secret)
    .update(orderId + '|' + paymentId)
    .digest('hex');

  // Test 1: Valid signature should return true
  const isValid = verifySignature(orderId, paymentId, validSignature);
  ok(isValid === true, 'Valid HMAC-SHA256 signature is accepted');

  // Test 2: Invalid signature should return false
  const isInvalid = verifySignature(orderId, paymentId, 'invalid_signature_hex');
  ok(isInvalid === false, 'Invalid HMAC-SHA256 signature is rejected');

  // Test 3: Missing secret should throw
  process.env.PAYMENT_RAZORPAY_KEY_SECRET = '';
  try {
    verifySignature(orderId, paymentId, validSignature);
    ok(false, 'Missing secret should throw an error');
  } catch (err) {
    ok(err.message === 'PAYMENT_RAZORPAY_KEY_SECRET not configured.', 'Missing secret throws correct error');
  }

} catch (e) {
  console.error('Test execution failed:', e);
  failed++;
}

console.log('\n═══════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed  |  ${failed} failed`);
console.log('═══════════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
