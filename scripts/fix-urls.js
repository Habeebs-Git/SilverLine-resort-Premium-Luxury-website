/**
 * Fix all /pages/admin/xxx.html → /admin/xxx clean URL references
 * And /pages/booking.html → /booking
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const replacements = [
  // Admin page links
  ['/pages/admin/dashboard.html',    '/admin/dashboard'],
  ['/pages/admin/reservations.html', '/admin/reservations'],
  ['/pages/admin/rooms.html',        '/admin/rooms'],
  ['/pages/admin/guests.html',       '/admin/guests'],
  ['/pages/admin/calendar.html',     '/admin/calendar'],
  ['/pages/admin/settings.html',     '/admin/settings'],
  ['/pages/admin/login.html',        '/admin/login'],
  // Booking link
  ['/pages/booking.html',            '/booking'],
  ['/pages/booking-confirmation.html', '/booking-confirmation'],
];

const targets = [
  // JS files
  path.join(root, 'js/admin/auth.js'),
  path.join(root, 'js/admin/dashboard.js'),
  path.join(root, 'js/admin/reservations.js'),
  path.join(root, 'js/admin/rooms.js'),
  path.join(root, 'js/admin/guests.js'),
  path.join(root, 'js/admin/calendar.js'),
  path.join(root, 'js/admin/settings.js'),
  // HTML files
  path.join(root, 'pages/admin/dashboard.html'),
  path.join(root, 'pages/admin/reservations.html'),
  path.join(root, 'pages/admin/rooms.html'),
  path.join(root, 'pages/admin/guests.html'),
  path.join(root, 'pages/admin/calendar.html'),
  path.join(root, 'pages/admin/settings.html'),
  path.join(root, 'pages/admin/login.html'),
];

let totalChanges = 0;

targets.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.log('SKIP (not found):', path.basename(filePath));
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = 0;
  
  replacements.forEach(([from, to]) => {
    // Use split/join to replace all occurrences
    const parts = content.split(from);
    if (parts.length > 1) {
      content = parts.join(to);
      changed += parts.length - 1;
    }
  });
  
  if (changed > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`FIXED (${changed} replacements): ${path.relative(root, filePath)}`);
    totalChanges += changed;
  } else {
    console.log(`CLEAN: ${path.relative(root, filePath)}`);
  }
});

console.log(`\nTotal replacements made: ${totalChanges}`);
