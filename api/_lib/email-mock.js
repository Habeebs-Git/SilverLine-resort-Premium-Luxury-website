/**
 * SILVERLINE RESORT — Mock Email Service
 *
 * ⚠ DEMO / PROTOTYPE ONLY
 * In development, emails are logged to console only.
 * No real emails are sent.
 *
 * Production upgrade path:
 *   Set EMAIL_PROVIDER=resend (or sendgrid/nodemailer) in .env
 *   and add the appropriate API key.
 */

'use strict';

const HOTEL_NAME  = process.env.HOTEL_NAME  || 'Silverline Resort';
const EMAIL_FROM  = process.env.EMAIL_FROM  || 'reservations@silverlineresort.in';
const HOTEL_PHONE = process.env.HOTEL_PHONE || '+91 86384 79919';

/**
 * Send a booking confirmation email.
 * In production, replace the body of this function with your email provider SDK.
 */
function sendBookingConfirmation(reservation) {
  const {
    bookingReference, guestName, guestEmail,
    roomTypeName, checkIn, checkOut, nights,
    adults, children, total, currency
  } = reservation;

  const emailData = {
    to: guestEmail,
    from: EMAIL_FROM,
    subject: `Your ${HOTEL_NAME} booking is confirmed — ${bookingReference}`,
    text: `
Dear ${guestName},

Your reservation at ${HOTEL_NAME} is confirmed.

Booking Reference: ${bookingReference}
Room: ${roomTypeName}
Check-in:  ${checkIn} (from 14:00)
Check-out: ${checkOut} (by 11:00)
Guests: ${adults} adult(s)${children > 0 ? `, ${children} child(ren)` : ''}
Duration: ${nights} night(s)
Total: ${currency === 'INR' ? '₹' : currency}${total.toLocaleString('en-IN')} (incl. GST)

For assistance, contact us at ${HOTEL_PHONE} or reply to this email.

We look forward to welcoming you.

Warm regards,
${HOTEL_NAME}
Balacola, Ooty · Tamil Nadu 643003
    `.trim()
  };

  // In prototype mode: log instead of send
  console.log('[MOCK EMAIL] Booking confirmation would be sent:');
  console.log(`  To: ${emailData.to}`);
  console.log(`  Subject: ${emailData.subject}`);
  console.log(`  Ref: ${bookingReference}`);

  return { sent: true, mock: true, to: emailData.to };
}

/**
 * Send a cancellation notification email.
 */
function sendCancellationEmail(reservation) {
  const { bookingReference, guestName, guestEmail, roomTypeName } = reservation;

  console.log('[MOCK EMAIL] Cancellation notification would be sent:');
  console.log(`  To: ${guestEmail} (${guestName})`);
  console.log(`  Ref: ${bookingReference} — ${roomTypeName}`);

  return { sent: true, mock: true, to: guestEmail };
}

/**
 * Send an admin notification email (e.g., new reservation received).
 */
function sendAdminNotification(subject, body) {
  console.log(`[MOCK EMAIL] Admin notification: ${subject}`);
  return { sent: true, mock: true };
}

module.exports = {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendAdminNotification
};
