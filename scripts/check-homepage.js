/**
 * Check index.html for booking links and room ID integration
 */
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync('./pages/index.html', 'utf8');

// Check booking links
const bookingLinks = (html.match(/href=['"][^'"]*booking[^'"<>]*/g) || []);
console.log('Booking links found:', bookingLinks.length);
bookingLinks.forEach(l => console.log('  ' + l));

// Check for room IDs used as deep-link params
const roomIds = [
  'standard-room',
  'deluxe-room', 
  'deluxe-balcony',
  'suite-with-balcony',
  'deluxe-suite',
  'two-bedroom-deluxe',
  'two-bedroom-deluxe-suite'
];

console.log('\nRoom IDs in index.html:');
roomIds.forEach(id => {
  const count = html.split(id).length - 1;
  const status = count > 0 ? 'OK' : 'MISSING';
  console.log('  ' + status + ' ' + id + ' (found: ' + count + ')');
});

// Check if there's a direct booking CTA section
const hasDirectBookCTA = html.includes('/booking') || html.includes('book-direct') || html.includes('Book Direct');
console.log('\nHas direct booking CTA:', hasDirectBookCTA ? 'YES' : 'NO - NEEDS ADDITION');

// Check for OTA references (should be preserved)
const hasAgoda = html.includes('agoda') || html.includes('Agoda');
const hasIxigo = html.includes('ixigo') || html.includes('Ixigo');
console.log('Agoda link preserved:', hasAgoda ? 'YES' : 'NO');
console.log('Ixigo link preserved:', hasIxigo ? 'YES' : 'NO');

// Check for a "Book Now" button  
const bookNowCount = (html.match(/book.?now/gi) || []).length;
console.log('Book Now buttons:', bookNowCount);

// Show first 5 booking-related href values
console.log('\nAll /booking hrefs in index.html:');
(html.match(/href=['"][^'"]*\/booking[^'"<>]*/g) || ['NONE FOUND']).forEach(m => console.log('  ' + m));
