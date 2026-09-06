/**
 * SILVERLINE RESORT — Transactional Email Service
 * Uses Resend to send emails.
 * Fails gracefully so reservation flow is never interrupted.
 */

'use strict';

const { Resend } = require('resend');

const HOTEL_NAME = process.env.HOTEL_NAME || 'Silverline Resort';
const EMAIL_FROM = process.env.EMAIL_FROM || 'reservations@silverlineresort.in';
const EMAIL_ADMIN = process.env.EMAIL_ADMIN || 'admin@silverlineresort.in';
const HOTEL_PHONE = process.env.HOTEL_PHONE || '+91 86384 79919';

let resend;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('[EMAIL] RESEND_API_KEY is missing. Emails will be logged but not sent.');
}

/**
 * Build premium HTML email for booking confirmation.
 * Uses only inline CSS, table layout, and system fonts for maximum
 * email-client compatibility (Gmail, Outlook, Apple Mail, Android).
 */
function buildConfirmationHtml(reservation) {
  const {
    bookingReference, guestName, roomTypeName,
    checkIn, checkOut, nights, adults, children,
    total, currency, paymentMode, paymentReference
  } = reservation;

  const currencySymbol = currency === 'INR' ? '₹' : currency;
  const totalFormatted = `${currencySymbol}${Number(total).toLocaleString('en-IN')}`;
  const guestSummary = `${adults} adult${adults !== 1 ? 's' : ''}${children > 0 ? `, ${children} child${children !== 1 ? 'ren' : ''}` : ''}`;
  const nightSummary = `${nights} night${nights !== 1 ? 's' : ''}`;

  /* Palette (matching brand tokens) */
  const bg = '#0d1012';
  const cardBg = '#14181a';
  const ivory = '#eceae3';
  const stone = '#a8b2ae';
  const teak = '#c0a077';
  const green = '#7ecba1';
  const divider = '#1f2527';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>Booking Confirmed — ${bookingReference}</title>
  <!--[if mso]>
  <style>table,td{font-family:Segoe UI,Helvetica,Arial,sans-serif!important;}</style>
  <![endif]-->
  <style>
    body,html{margin:0;padding:0;width:100%;}
    body{background:${bg};-webkit-text-size-adjust:none;-ms-text-size-adjust:none;}
    table{border-spacing:0;border-collapse:collapse;}
    td{padding:0;}
    img{border:0;display:block;outline:none;}
    @media only screen and (max-width:620px){
      .outer-table{width:100%!important;}
      .inner-pad{padding-left:20px!important;padding-right:20px!important;}
      .detail-cell{display:block!important;width:100%!important;padding-bottom:14px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${bg};">
    Your stay at Silverline Resort is confirmed. Booking ref: ${bookingReference} &zwnj;&nbsp;
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};">
    <tr><td align="center" style="padding:32px 16px;">

      <!-- Main card -->
      <table role="presentation" class="outer-table" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${cardBg};border-radius:8px;overflow:hidden;border:1px solid #1e2426;">

        <!-- Header -->
        <tr>
          <td style="padding:36px 40px 28px;text-align:center;border-bottom:1px solid ${divider};" class="inner-pad">
            <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.38em;text-transform:uppercase;color:${teak};font-weight:500;">
              SILVERLINE RESORT
            </p>
            <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${stone};font-weight:400;">
              Ooty &middot; Tamil Nadu
            </p>
          </td>
        </tr>

        <!-- Confirmation status -->
        <tr>
          <td style="padding:32px 40px 8px;text-align:center;" class="inner-pad">
            <!-- Check circle (text fallback) -->
            <div style="width:56px;height:56px;border-radius:50%;background:rgba(44,74,63,0.25);border:2px solid ${green};margin:0 auto 20px;line-height:56px;font-size:26px;color:${green};text-align:center;">&#10003;</div>
            <h1 style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:400;color:${ivory};letter-spacing:0.01em;">
              Reservation Confirmed
            </h1>
            <p style="margin:0;font-size:14px;color:${stone};line-height:1.5;">
              Thank you, ${guestName} — we look forward to welcoming you.
            </p>
          </td>
        </tr>

        <!-- Booking Reference -->
        <tr>
          <td style="padding:20px 40px 28px;text-align:center;" class="inner-pad">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background:rgba(44,74,63,0.15);border:1px solid rgba(44,74,63,0.4);border-radius:6px;">
              <tr>
                <td style="padding:12px 24px;text-align:center;">
                  <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:${stone};font-weight:500;">BOOKING REFERENCE</p>
                  <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:18px;color:${green};letter-spacing:0.12em;font-weight:600;">
                    ${bookingReference}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;" class="inner-pad"><div style="height:1px;background:${divider};"></div></td></tr>

        <!-- Room -->
        <tr>
          <td style="padding:24px 40px 8px;" class="inner-pad">
            <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.35em;text-transform:uppercase;color:${teak};font-weight:500;">YOUR ROOM</p>
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:${ivory};font-weight:400;">
              ${roomTypeName}
            </p>
          </td>
        </tr>

        <!-- Details grid -->
        <tr>
          <td style="padding:20px 40px;" class="inner-pad">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td class="detail-cell" width="33%" style="vertical-align:top;padding-right:12px;">
                  <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${stone};font-weight:500;">CHECK-IN</p>
                  <p style="margin:0;font-size:14px;color:${ivory};line-height:1.4;">${checkIn}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:${stone};">from 14:00</p>
                </td>
                <td class="detail-cell" width="33%" style="vertical-align:top;padding-right:12px;">
                  <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${stone};font-weight:500;">CHECK-OUT</p>
                  <p style="margin:0;font-size:14px;color:${ivory};line-height:1.4;">${checkOut}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:${stone};">by 11:00</p>
                </td>
                <td class="detail-cell" width="34%" style="vertical-align:top;">
                  <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${stone};font-weight:500;">GUESTS</p>
                  <p style="margin:0;font-size:14px;color:${ivory};line-height:1.4;">${guestSummary}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:${stone};">${nightSummary}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;" class="inner-pad"><div style="height:1px;background:${divider};"></div></td></tr>

        <!-- Payment -->
        <tr>
          <td style="padding:24px 40px;" class="inner-pad">
            <p style="margin:0 0 14px;font-size:10px;letter-spacing:0.35em;text-transform:uppercase;color:${teak};font-weight:500;">PAYMENT DETAILS</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:6px 0;font-size:14px;color:${stone};border-bottom:1px solid ${divider};">Total Charged</td>
                <td style="padding:6px 0;font-size:14px;color:${ivory};text-align:right;border-bottom:1px solid ${divider};font-weight:500;">${totalFormatted}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:${stone};border-bottom:1px solid ${divider};">Includes</td>
                <td style="padding:6px 0;font-size:13px;color:${stone};text-align:right;border-bottom:1px solid ${divider};">GST</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:${stone};border-bottom:1px solid ${divider};">Payment Mode</td>
                <td style="padding:6px 0;font-size:13px;color:${ivory};text-align:right;border-bottom:1px solid ${divider};">${paymentMode || 'Prepaid'}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:${stone};">Transaction ID</td>
                <td style="padding:6px 0;font-size:13px;color:${ivory};text-align:right;word-break:break-all;">${paymentReference || 'N/A'}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;" class="inner-pad"><div style="height:1px;background:${divider};"></div></td></tr>

        <!-- What to Expect -->
        <tr>
          <td style="padding:24px 40px;" class="inner-pad">
            <p style="margin:0 0 14px;font-size:10px;letter-spacing:0.35em;text-transform:uppercase;color:${teak};font-weight:500;">WHAT TO EXPECT</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:${stone};line-height:1.65;">
              <tr><td style="padding:4px 0;">&#10003;&ensp;Check-in from 14:00 — your room will be ready</td></tr>
              <tr><td style="padding:4px 0;">&#10003;&ensp;Check-out by 11:00</td></tr>
              <tr><td style="padding:4px 0;">&#10003;&ensp;Complimentary breakfast served daily</td></tr>
              <tr><td style="padding:4px 0;">&#10003;&ensp;Free parking available on premises</td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 32px;text-align:center;border-top:1px solid ${divider};" class="inner-pad">
            <p style="margin:0 0 4px;font-size:13px;color:${stone};line-height:1.6;">
              Need assistance? Call us at <a href="tel:${HOTEL_PHONE.replace(/\s/g, '')}" style="color:${teak};text-decoration:none;">${HOTEL_PHONE}</a>
            </p>
            <p style="margin:0 0 2px;font-size:12px;color:#5e6966;line-height:1.5;">
              or reply to this email.
            </p>
            <p style="margin:16px 0 0;font-size:11px;color:#4a5451;line-height:1.5;">
              Silverline Resort &middot; 2/259, Kathadimattam Road, Balacola, Ooty &middot; Tamil Nadu 643003
            </p>
          </td>
        </tr>

      </table>
      <!-- /Main card -->

    </td></tr>
  </table>
  <!-- /Outer wrapper -->

</body>
</html>`;
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

  const html = buildConfirmationHtml(reservation);

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
      text: text,
      html: html
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
