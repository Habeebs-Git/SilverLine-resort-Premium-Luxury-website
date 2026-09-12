/**
 * SILVERLINE RESORT — Booking Confirmation Page JS
 *
 * Reads booking data from sessionStorage (written by booking-engine.js
 * after a successful API call) and renders the confirmation UI.
 *
 * Supports both single-room and multi-room bookings.
 *
 * If no session data is present, shows the error state.
 */

'use strict';

const INR = n => '₹' + Number(n).toLocaleString('en-IN');

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function nightLabel(n) { return n === 1 ? '1 night' : `${n} nights`; }

function guestLabel(a, c) {
  let s = a === 1 ? '1 adult' : `${a} adults`;
  if (c > 0) s += c === 1 ? ', 1 child' : `, ${c} children`;
  return s;
}

function renderConfirmation(booking) {
  // Hide loading
  const loading = document.getElementById('conf-loading');
  if (loading) loading.setAttribute('hidden', '');

  // Show success
  const success = document.getElementById('conf-success');
  if (success) success.removeAttribute('hidden');

  // Reference
  const refVal = document.getElementById('conf-ref-value');
  if (refVal) refVal.textContent = booking.bookingReference || '—';

  // Room image — for multi-room, show first room; for single-room, keep legacy
  const img = document.getElementById('conf-room-img');
  if (img) {
    const imgSrc = booking.roomImage || (booking.roomImages && booking.roomImages[0]?.image);
    if (imgSrc) {
      img.src = imgSrc;
      img.alt = booking.roomImageAlt || (booking.roomImages && booking.roomImages[0]?.roomTypeName) || booking.roomTypeName || 'Room';
    }
  }

  // Room name(s)
  const roomName = document.getElementById('conf-room-name');
  if (roomName) {
    if (booking.isMultiRoom && booking.lineItems) {
      roomName.innerHTML = booking.lineItems.map(li =>
        `<span class="conf-room-line">${li.roomTypeName}${li.quantity > 1 ? ' × ' + li.quantity : ''}</span>`
      ).join('');
    } else {
      roomName.textContent = booking.roomTypeName || '—';
    }
  }

  // Detail grid
  const grid = document.getElementById('conf-detail-grid');
  if (grid) {
    grid.innerHTML = `
      <div class="conf-detail-item">
        <div class="conf-detail-label">Check-In</div>
        <div class="conf-detail-value">${fmtDate(booking.checkIn)}</div>
        <div class="conf-detail-sub">from 14:00</div>
      </div>
      <div class="conf-detail-item">
        <div class="conf-detail-label">Check-Out</div>
        <div class="conf-detail-value">${fmtDate(booking.checkOut)}</div>
        <div class="conf-detail-sub">by 11:00</div>
      </div>
      <div class="conf-detail-item">
        <div class="conf-detail-label">Guests</div>
        <div class="conf-detail-value">${guestLabel(booking.adults || 2, booking.children || 0)}</div>
        <div class="conf-detail-sub">${nightLabel(booking.nights || 1)}</div>
      </div>
    `;
  }

  // Pricing — support multi-room line items
  const pricingTable = document.getElementById('conf-pricing-table');
  if (pricingTable && booking.pricing) {
    const p = booking.pricing;
    const taxLabel = p.taxLabel || 'GST (12%)';

    let html = '';

    if (booking.isMultiRoom && booking.lineItems) {
      // Multi-room: show each line item
      for (const li of booking.lineItems) {
        const label = li.quantity > 1
          ? `${li.roomTypeName} × ${li.quantity}`
          : li.roomTypeName;
        const detail = li.quantity > 1
          ? `${INR(li.basePrice)} × ${nightLabel(p.nights)} × ${li.quantity}`
          : `${INR(li.basePrice)} × ${nightLabel(p.nights)}`;
        html += `
          <div class="conf-pricing-row">
            <span class="label">${label}</span>
            <span class="value">${INR(li.lineSubtotal)}</span>
          </div>
          <div class="conf-pricing-row is-detail">
            <span class="label">${detail}</span>
            <span class="value"></span>
          </div>`;
      }
    } else {
      // Single room: legacy display
      html += `
        <div class="conf-pricing-row">
          <span class="label">${INR(p.basePrice)} × ${nightLabel(p.nights)}</span>
          <span class="value">${INR(p.subtotal)}</span>
        </div>`;
    }

    // Multi-room: show combined subtotal before taxes
    if (booking.isMultiRoom && booking.lineItems) {
      html += `
        <div class="conf-pricing-row">
          <span class="label">Subtotal</span>
          <span class="value">${INR(p.subtotal)}</span>
        </div>`;
    }

    html += `
      <div class="conf-pricing-row">
        <span class="label">${taxLabel}</span>
        <span class="value">${INR(p.taxes)}</span>
      </div>
      <div class="conf-pricing-row is-total">
        <span class="label">Total Charged</span>
        <span class="value">${INR(p.total)}</span>
      </div>
    `;
    pricingTable.innerHTML = html;
  }

  // Guest info
  const guestNameEl = document.getElementById('conf-guest-name');
  if (guestNameEl) {
    guestNameEl.querySelector('span').textContent = booking.guestName || '—';
  }
  const guestEmailEl = document.getElementById('conf-guest-email');
  if (guestEmailEl) {
    guestEmailEl.querySelector('span').textContent = booking.guestEmail || '—';
  }
  const guestPhoneEl = document.getElementById('conf-guest-phone');
  if (guestPhoneEl) {
    guestPhoneEl.querySelector('span').textContent = booking.guestPhone || '—';
  }

  // Special requests
  const srEl = document.getElementById('conf-special-requests');
  if (srEl && booking.specialRequests) {
    srEl.style.display = '';
    srEl.querySelector('span').textContent = booking.specialRequests;
  }

  // Update page title with reference
  if (booking.bookingReference) {
    document.title = `Confirmed ${booking.bookingReference} — Silverline Resort`;
  }
}

function showError() {
  const loading = document.getElementById('conf-loading');
  if (loading) loading.setAttribute('hidden', '');
  const error = document.getElementById('conf-error');
  if (error) error.removeAttribute('hidden');
}

// Copy reference to clipboard
function initCopyBtn(bookingReference) {
  const btn = document.getElementById('conf-ref-copy');
  if (!btn || !bookingReference) return;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(bookingReference);
      btn.title = 'Copied!';
      const orig = btn.innerHTML;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7ecba1" stroke-width="1.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>`;
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.title = 'Copy';
      }, 2000);
    } catch {
      // Clipboard not available — silently ignore
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Try to get booking from sessionStorage
  let booking = null;
  try {
    const raw = sessionStorage.getItem('slr_booking');
    if (raw) booking = JSON.parse(raw);
  } catch (e) {
    console.error('[conf] Failed to parse booking from sessionStorage:', e);
  }

  if (booking && booking.bookingReference) {
    renderConfirmation(booking);
    initCopyBtn(booking.bookingReference);
    // Clear session after render so refresh shows error state (booking already displayed)
    // Don't clear immediately — allow user to print/save, clear on next navigation instead
  } else {
    showError();
  }
});
