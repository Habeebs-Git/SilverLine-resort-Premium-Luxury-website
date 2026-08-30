'use strict';
const fs   = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let pass = 0, fail = 0;
const issues = [];

function ok(label)  { pass++; console.log('  ✓', label); }
function bad(label) { fail++; issues.push(label); console.log('  ✗', label); }
function section(t) { console.log('\n══ ' + t + ' ══'); }

function readText(rel) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); }
  catch { return ''; }
}
function readJson(rel) {
  try { return JSON.parse(readText(rel)); }
  catch { return null; }
}
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

// ─────────────────────────────────────────────────────────────
section('1. JSON FILE VALIDITY');
const jsonFiles = [
  'data/room-types.json','data/reservations.json','data/guests.json',
  'data/payments.json','data/audit-logs.json','data/settings.json',
  'data/users.json','vercel.json','package.json'
];
jsonFiles.forEach(f => {
  const d = readJson(f);
  d !== null ? ok(f + ' parses OK') : bad(f + ' PARSE ERROR');
});

// ─────────────────────────────────────────────────────────────
section('2. ROOM TYPE INTEGRITY');
const rooms = readJson('data/room-types.json') || [];
const validIds = new Set(rooms.map(r => r.id));
const expectedIds = [
  'standard-room','deluxe-room','deluxe-balcony','suite-with-balcony',
  'deluxe-suite','two-bedroom-deluxe','two-bedroom-deluxe-suite'
];
expectedIds.forEach(id => {
  validIds.has(id) ? ok('Room ID: ' + id) : bad('MISSING room ID: ' + id);
});
// No duplicate IDs
const idArr = rooms.map(r => r.id);
const uniq = new Set(idArr);
uniq.size === idArr.length ? ok('No duplicate room IDs') : bad('DUPLICATE room IDs detected');
// Images exist
rooms.forEach(r => {
  if (!r.image) { bad('Room ' + r.id + ' has no image field'); return; }
  exists(r.image) ? ok('Image exists: ' + r.image) : bad('MISSING image: ' + r.image);
});

// ─────────────────────────────────────────────────────────────
section('3. RESERVATIONS INTEGRITY');
const resv = readJson('data/reservations.json') || [];
const resvIds = new Set();
resv.forEach(r => {
  if (resvIds.has(r.id)) bad('Duplicate reservation ID: ' + r.id);
  resvIds.add(r.id);
  if (!validIds.has(r.roomTypeId)) bad('Invalid roomTypeId in reservation: ' + r.roomTypeId);
});
ok('Reservations: ' + resv.length + ' records, no duplicates');

// ─────────────────────────────────────────────────────────────
section('4. _LIB MODULE LOADING');
const libs = ['db','auth','validation','availability','payment-mock','email-mock','ota-adapters','rate-limit'];
libs.forEach(m => {
  try { require(path.join(root, 'api/_lib', m)); ok('_lib/' + m); }
  catch(e) { bad('_lib/' + m + ' LOAD ERROR: ' + e.message); }
});

// ─────────────────────────────────────────────────────────────
section('5. API MODULE LOADING');
const apiMods = [
  'api/availability.js','api/reservations.js','api/reservation/[id].js',
  'api/auth/login.js','api/auth/logout.js','api/auth/me.js',
  'api/admin/dashboard.js','api/admin/reservations.js','api/admin/rooms.js',
  'api/admin/guests.js','api/admin/settings.js','api/admin/reservations/[id].js'
];
apiMods.forEach(m => {
  try { require(path.join(root, m)); ok(m); }
  catch(e) { bad(m + ' LOAD ERROR: ' + e.message); }
});

// ─────────────────────────────────────────────────────────────
section('6. FILE EXISTENCE — HTML/JS/CSS');
const requiredFiles = [
  'pages/booking.html','pages/booking-confirmation.html',
  'pages/admin/login.html','pages/admin/dashboard.html',
  'pages/admin/reservations.html','pages/admin/rooms.html',
  'pages/admin/guests.html','pages/admin/calendar.html',
  'pages/admin/settings.html',
  'js/booking-engine.js','js/booking-confirmation.js',
  'js/admin/auth.js','js/admin/dashboard.js','js/admin/reservations.js',
  'js/admin/rooms.js','js/admin/guests.js','js/admin/calendar.js',
  'js/admin/settings.js',
  'css/booking.css','css/admin.css','css/theme.css',
  'data/room-types.json','data/settings.json','data/users.json',
  '.gitignore','.env.example','vercel.json','package.json',
  'BOOKING-SYSTEM-README.md','favicon.svg'
];
requiredFiles.forEach(f => {
  exists(f) ? ok(f) : bad('MISSING: ' + f);
});

// ─────────────────────────────────────────────────────────────
section('7. VERCEL.JSON ROUTE CONSISTENCY');
const vcfg = readJson('vercel.json') || {};
const rewrites = vcfg.rewrites || [];
const expectedRoutes = {
  '/':                     '/pages/index.html',
  '/booking':              '/pages/booking.html',
  '/booking-confirmation': '/pages/booking-confirmation.html',
  '/admin':                '/pages/admin/login.html',
  '/admin/login':          '/pages/admin/login.html',
  '/admin/dashboard':      '/pages/admin/dashboard.html',
  '/admin/reservations':   '/pages/admin/reservations.html',
  '/admin/rooms':          '/pages/admin/rooms.html',
  '/admin/guests':         '/pages/admin/guests.html',
  '/admin/calendar':       '/pages/admin/calendar.html',
  '/admin/settings':       '/pages/admin/settings.html',
};
Object.entries(expectedRoutes).forEach(([src, dest]) => {
  const found = rewrites.find(r => r.source === src && r.destination === dest);
  if (found) {
    exists(dest) ? ok('Route ' + src + ' → ' + dest) : bad('Route ' + src + ' → ' + dest + ' (file MISSING)');
  } else {
    bad('MISSING route: ' + src + ' → ' + dest);
  }
});

// ─────────────────────────────────────────────────────────────
section('8. LEGACY URL CHECK');
const legacyTargets = [
  'js/admin/auth.js','js/admin/dashboard.js','js/admin/reservations.js',
  'js/admin/rooms.js','js/admin/guests.js','js/admin/calendar.js','js/admin/settings.js',
  'pages/admin/dashboard.html','pages/admin/reservations.html','pages/admin/rooms.html',
  'pages/admin/guests.html','pages/admin/calendar.html','pages/admin/settings.html',
  'pages/admin/login.html'
];
let legacyCount = 0;
legacyTargets.forEach(f => {
  const txt = readText(f);
  const hits = (txt.match(/\/pages\/admin\/[^\s'"<>]+/g) || []);
  const bk   = (txt.match(/\/pages\/booking[^\s'"<>]+/g)  || []);
  hits.forEach(h => { legacyCount++; bad('Legacy URL in ' + f + ': ' + h); });
  bk.forEach(h   => { legacyCount++; bad('Legacy URL in ' + f + ': ' + h); });
});
if (legacyCount === 0) ok('No legacy /pages/admin/ or /pages/booking URLs found');

// ─────────────────────────────────────────────────────────────
section('9. BOOKING ENGINE FIELD CONSISTENCY');
const engine = readText('js/booking-engine.js');
['roomTypeId','checkIn','checkOut','adults','children','guestName','guestEmail','guestPhone',
 '/api/availability','POST','/api/reservations','/booking-confirmation'].forEach(f => {
  engine.includes(f) ? ok('booking-engine.js has: ' + f) : bad('booking-engine.js MISSING: ' + f);
});

// ─────────────────────────────────────────────────────────────
section('10. CONFIRMATION PAGE FIELD CONSISTENCY');
const conf = readText('js/booking-confirmation.js');
['bookingReference','roomTypeName','checkIn','checkOut','adults','children',
 'pricing','slr_booking','sessionStorage'].forEach(f => {
  conf.includes(f) ? ok('booking-confirmation.js has: ' + f) : bad('booking-confirmation.js MISSING: ' + f);
});

// ─────────────────────────────────────────────────────────────
section('11. SETTINGS INTEGRATION CONSISTENCY');
const settingsJs  = readText('js/admin/settings.js');
const settingsApi = readText('api/admin/settings.js');
// Frontend should send PATCH or PUT
['PATCH','PUT'].some(m => settingsJs.includes(m)) ? ok('settings.js uses PATCH/PUT') : bad('settings.js missing PATCH/PUT method');
// API should accept both
settingsApi.includes('PATCH') ? ok('settings API handles PATCH') : bad('settings API missing PATCH');
settingsApi.includes('PUT')   ? ok('settings API handles PUT')   : bad('settings API missing PUT');
// Frontend should read from hotel/pricing keys (not resort/booking)
settingsJs.includes("s.hotel")   ? ok('settings.js reads s.hotel')   : bad('settings.js missing s.hotel key');
settingsJs.includes("s.pricing") ? ok('settings.js reads s.pricing') : bad('settings.js missing s.pricing key');
// Frontend should NOT use old s.resort or s.booking keys
!settingsJs.includes("s.resort")  ? ok('settings.js no stale s.resort')  : bad('settings.js still uses old s.resort key');
!settingsJs.includes("s.booking") ? ok('settings.js no stale s.booking') : bad('settings.js still uses old s.booking key');
// Settings HTML IDs
const settingsHtml = readText('pages/admin/settings.html');
['tax-rate','tax-label','currency','checkin-time','checkout-time','min-nights','booking-window',
 'resort-name','resort-phone','resort-email','resort-address','save-settings','settings-form'].forEach(id => {
  settingsHtml.includes('id="' + id + '"') ? ok('settings.html has #' + id) : bad('settings.html MISSING #' + id);
});

// ─────────────────────────────────────────────────────────────
section('12. ADMIN AUTH SECURITY');
const authLib = readText('api/_lib/auth.js');
['httpOnly: true', 'sameSite:', 'secure:', 'jwt.verify', 'algorithms:', 'requireAuth', 'requireAdmin', 'requireStaff'].forEach(f => {
  authLib.includes(f) ? ok('auth.js has: ' + f) : bad('auth.js MISSING: ' + f);
});
const loginApi = readText('api/auth/login.js');
['bcrypt.compare','checkRateLimit','recordAttempt','buildSessionCookie','appendAuditLog',
 'DUMMY_HASH','Invalid email or password'].forEach(f => {
  loginApi.includes(f) ? ok('login.js has: ' + f) : bad('login.js MISSING: ' + f);
});

// ─────────────────────────────────────────────────────────────
section('13. ADMIN API AUTHORIZATION');
const adminApis = {
  'api/admin/dashboard.js': 'requireStaff',
  'api/admin/reservations.js': 'requireStaff',
  'api/admin/rooms.js': 'requireStaff',
  'api/admin/guests.js': 'requireStaff',
  'api/admin/settings.js': 'requireAdmin',
};
Object.entries(adminApis).forEach(([f, fn]) => {
  const txt = readText(f);
  txt.includes(fn) ? ok(f + ' uses ' + fn) : bad(f + ' MISSING ' + fn);
});

// ─────────────────────────────────────────────────────────────
section('14. GITIGNORE SECURITY');
const gitignore = readText('.gitignore');
['.env', 'node_modules', 'data/users.json'].forEach(e => {
  gitignore.includes(e) ? ok('.gitignore has: ' + e) : bad('.gitignore MISSING: ' + e);
});
// .env should not exist (only .env.example)
!exists('.env') ? ok('.env is NOT tracked (correct)') : bad('.env EXISTS in project root — should not be committed');

// ─────────────────────────────────────────────────────────────
section('15. NO PRODUCTION SECRETS IN TRACKED FILES');
const envExample = readText('.env.example');
// .env.example should NOT contain real credentials
const suspectPatterns = ['SilverlineAdmin', 'SilverlineStaff', 'password123'];
suspectPatterns.forEach(p => {
  !envExample.includes(p) ? ok('.env.example clean: no ' + p) : bad('.env.example CONTAINS potential credential: ' + p);
});

// ─────────────────────────────────────────────────────────────
section('16. HOMEPAGE BOOKING LINKS');
const indexHtml = readText('pages/index.html');
expectedIds.forEach(id => {
  indexHtml.includes('/booking?room=' + id)
    ? ok('Homepage has /booking?room=' + id)
    : bad('Homepage MISSING /booking?room=' + id);
});
indexHtml.includes('agoda')  ? ok('Agoda link present') : bad('Agoda link MISSING');
indexHtml.includes('ixigo')  ? ok('Ixigo link present')  : bad('Ixigo link MISSING');
indexHtml.includes('/booking') ? ok('Direct /booking link present') : bad('Direct /booking link MISSING');

// ─────────────────────────────────────────────────────────────
section('17. ADMIN RESERVATIONS [id] API');
const adminResId = readText('api/admin/reservations/[id].js');
adminResId.length > 0 ? ok('api/admin/reservations/[id].js exists') : bad('api/admin/reservations/[id].js MISSING or empty');
adminResId.includes('requireStaff') ? ok('reservations/[id].js uses requireStaff') : bad('reservations/[id].js missing requireStaff');

// ─────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('AUDIT COMPLETE — Results: ' + pass + ' passed, ' + fail + ' failed');
if (issues.length > 0) {
  console.log('\nFAILED CHECKS:');
  issues.forEach((i, n) => console.log('  ' + (n+1) + '. ' + i));
} else {
  console.log('All checks passed!');
}
console.log('══════════════════════════════════════════');
process.exit(fail > 0 ? 1 : 0);
