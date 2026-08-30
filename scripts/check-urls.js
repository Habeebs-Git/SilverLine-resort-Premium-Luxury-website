/**
 * Check for legacy /pages/admin/ URL references in JS and HTML files
 * Also check frontend API endpoint usage
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readDir(dir, ext) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(ext))
      .map(f => ({ name: f, content: fs.readFileSync(path.join(dir, f), 'utf8') }));
  } catch { return []; }
}

let issueCount = 0;

// Check JS files for /pages/admin/ references
console.log('\n=== Checking JS admin files for legacy /pages/admin/ links ===');
const jsAdminFiles = readDir(path.join(root, 'js/admin'), '.js');
jsAdminFiles.push(...readDir(path.join(root, 'js'), '.js'));

jsAdminFiles.forEach(({ name, content }) => {
  const matches = (content.match(/\/pages\/admin\/[^\s'"]+/g) || []);
  const booking = (content.match(/\/pages\/booking[^\s'"]+/g) || []);
  const all = [...matches, ...booking];
  if (all.length > 0) {
    console.log('ISSUE in', name + ':');
    all.forEach(m => { console.log('  FOUND:', m); issueCount++; });
  }
});

// Check admin HTML pages
console.log('\n=== Checking admin HTML files for legacy /pages/ links ===');
const adminHtmlFiles = readDir(path.join(root, 'pages/admin'), '.html');
adminHtmlFiles.forEach(({ name, content }) => {
  const matches = (content.match(/\/pages\/admin\/[^\s'"<>]+/g) || []);
  const booking = (content.match(/\/pages\/booking[^\s'"<>]+/g) || []);
  const all = [...matches, ...booking];
  if (all.length > 0) {
    console.log('ISSUE in', name + ':');
    // Deduplicate
    [...new Set(all)].forEach(m => { console.log('  FOUND:', m); issueCount++; });
  }
});

// Check API field consistency
console.log('\n=== Checking API endpoint field names ===');
const apiRes = fs.readFileSync(path.join(root, 'api/reservations.js'), 'utf8');
const fields = ['bookingReference', 'roomTypeName', 'checkIn', 'checkOut', 'adults', 'children',
  'guestName', 'guestEmail', 'guestPhone', 'subtotal', 'taxes', 'total', 'status', 'paymentStatus'];
fields.forEach(f => {
  if (apiRes.includes(f)) {
    console.log('OK field:', f);
  } else {
    console.log('MISSING field in reservations.js:', f);
    issueCount++;
  }
});

// Check booking-engine.js sends correct fields
console.log('\n=== Checking booking-engine.js POST body fields ===');
const bkEngine = fs.readFileSync(path.join(root, 'js/booking-engine.js'), 'utf8');
const requiredBodyFields = ['roomTypeId', 'checkIn', 'checkOut', 'adults', 'children', 'guestName', 'guestEmail', 'guestPhone'];
requiredBodyFields.forEach(f => {
  if (bkEngine.includes(f)) {
    console.log('OK:', f);
  } else {
    console.log('MISSING from booking-engine.js body:', f);
    issueCount++;
  }
});

// Check booking-confirmation.js reads correct fields
console.log('\n=== Checking booking-confirmation.js reads correct fields ===');
const bkConf = fs.readFileSync(path.join(root, 'js/booking-confirmation.js'), 'utf8');
const confFields = ['bookingReference', 'roomTypeName', 'checkIn', 'checkOut', 'adults', 'children', 'pricing'];
confFields.forEach(f => {
  if (bkConf.includes(f)) {
    console.log('OK:', f);
  } else {
    console.log('MISSING from booking-confirmation.js:', f);
    issueCount++;
  }
});

// Verify .gitignore covers sensitive files
console.log('\n=== Checking .gitignore ===');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const sensitiveEntries = ['.env', 'node_modules', 'data/users.json'];
sensitiveEntries.forEach(e => {
  if (gitignore.includes(e)) {
    console.log('OK .gitignore includes:', e);
  } else {
    console.log('MISSING from .gitignore:', e);
    issueCount++;
  }
});

console.log('\n=== SUMMARY ===');
console.log('Total issues found:', issueCount);
console.log(issueCount === 0 ? 'ALL CHECKS PASSED' : 'ISSUES REQUIRE FIXING');
