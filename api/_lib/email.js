/**
 * SILVERLINE RESORT — Transactional Email Service
 * Uses Resend to send emails.
 * Fails gracefully so reservation flow is never interrupted.
 */

'use strict';

const { Resend } = require('resend');

const HOTEL_NAME  = process.env.HOTEL_NAME  || 'Silverline Resort';
const EMAIL_FROM  = process.env.EMAIL_FROM  || 'reservations@silverlineresort.in';
const EMAIL_ADMIN = process.env.EMAIL_ADMIN || 'admin@silverlineresort.in';
const HOTEL_PHONE = process.env.HOTEL_PHONE || '+91 86384 79919';

let resend;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('[EMAIL] RESEND_API_KEY is missing. Emails will be logged but not sent.');
}

/**
 * Send a booking confirmation email.
 */
async function sendBookingConfirmation(reservation) {
  const {
    bookingReference, guestName, guestEmail,
    roomTypeName, checkIn, checkOut, nights,
    adults, children, total, currency, paymentMode, paymentReference
  } = reservation;

  const subject = `Your ${HOTEL_NAME} booking is confirmed — ${bookingReference}`;
  
  const text = `
Dear ${guestName},

Your reservation at ${HOTEL_NAME} is confirmed.

Booking Reference: ${bookingReference}
Room: ${roomTypeName}
Check-in:  ${checkIn} (from 14:00)
Check-out: ${checkOut} (by 11:00)
Guests: ${adults} adult(s)${children > 0 ? `, ${children} child(ren)` : ''}
Duration: ${nights} night(s)

Payment Details:
Total: ${currency === 'INR' ? '₹' : currency}${total.toLocaleString('en-IN')} (incl. GST)
Payment Mode: ${paymentMode || 'Prepaid'}
Transaction ID: ${paymentReference || 'N/A'}

For assistance, contact us at ${HOTEL_PHONE} or reply to this email.

We look forward to welcoming you.

Warm regards,
${HOTEL_NAME}
Balacola, Ooty · Tamil Nadu 643003
  `.trim();

  // If missing key, just log and return
  if (!resend) {
    console.log('[MOCK EMAIL] Booking confirmation would be sent:');
    console.log(`  To: ${guestEmail}\n  Subject: ${subject}\n  Ref: ${bookingReference}`);
    return { sent: true, mock: true, to: guestEmail };
  }

  try {
    const data = await resend.emails.send({
      from: `${HOTEL_NAME} <${EMAIL_FROM}>`,
      to: guestEmail,
      subject: subject,
      text: text
    });
    console.log(`[EMAIL] Booking confirmation sent to ${guestEmail} (ID: ${data.id})`);
    return { sent: true, id: data.id };
  } catch (error) {
    // We catch and log, but do not throw so the reservation isn't interrupted
    console.error(`[EMAIL ERROR] Failed to send booking confirmation to ${guestEmail}:`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Send a cancellation notification email.
 */
async function sendCancellationEmail(reservation) {
  const { bookingReference, guestName, guestEmail, roomTypeName } = reservation;
  
  const subject = `Reservation Cancelled — ${HOTEL_NAME} (${bookingReference})`;
  const text = `
Dear ${guestName},

Your reservation at ${HOTEL_NAME} has been cancelled as requested.

Booking Reference: ${bookingReference}
Room: ${roomTypeName}

If you have any questions, please contact us at ${HOTEL_PHONE}.

Warm regards,
${HOTEL_NAME}
  `.trim();

  if (!resend) {
    console.log('[MOCK EMAIL] Cancellation notification would be sent:');
    console.log(`  To: ${guestEmail}\n  Ref: ${bookingReference}`);
    return { sent: true, mock: true, to: guestEmail };
  }

  try {
    const data = await resend.emails.send({
      from: `${HOTEL_NAME} <${EMAIL_FROM}>`,
      to: guestEmail,
      subject: subject,
      text: text
    });
    return { sent: true, id: data.id };
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send cancellation to ${guestEmail}:`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Send an admin notification email (e.g., new reservation received).
 */
async function sendAdminNotification(subject, body) {
  if (!resend) {
    console.log(`[MOCK EMAIL] Admin notification: ${subject}`);
    return { sent: true, mock: true };
  }

  try {
    const data = await resend.emails.send({
      from: `${HOTEL_NAME} System <${EMAIL_FROM}>`,
      to: EMAIL_ADMIN,
      subject: subject,
      text: body
    });
    return { sent: true, id: data.id };
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send admin notification:`, error.message);
    return { sent: false, error: error.message };
  }
}

module.exports = {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendAdminNotification
};
