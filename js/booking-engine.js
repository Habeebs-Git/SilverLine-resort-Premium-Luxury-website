/**
 * SILVERLINE RESORT — Booking Engine (Guest-Facing)
 * Multi-step booking flow:  Step 1 → Dates & Guests
 *                           Step 2 → Room Selection
 *                           Step 3 → Guest Details
 *                           Step 4 → Review & Confirm
 *
 * All availability, pricing and reservation creation are server-side.
 * This script is purely orchestration + UX. No prices or availability
 * are trusted from or persisted in client state.
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────────────────────────── */
const state = {
  currentStep: 1,
  checkIn:     null,
  checkOut:    null,
  nights:      0,
  adults:      2,
  children:    0,
  selectedRoom: null,       // full room object from API
  guestName:   '',
  guestEmail:  '',
  guestPhone:  '',
  specialRequests: '',
  availabilityData: null    // full response from /api/availability
};

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────────────────────────── */
const INR = n => '₹' + Number(n).toLocaleString('en-IN');

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function nightLabel(n) {
  return n === 1 ? '1 night' : `${n} nights`;
}

function guestLabel(adults, children) {
  let s = adults === 1 ? '1 adult' : `${adults} adults`;
  if (children > 0) s += children === 1 ? ', 1 child' : `, ${children} children`;
  return s;
}

function diffDays(a, b) {
  const msA = new Date(a).getTime();
  const msB = new Date(b).getTime();
  return Math.round((msB - msA) / 86400000);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function maxDate() {
  const d = new Date();
  d.setDate(d.getDate() + 365);
  return d.toISOString().split('T')[0];
}

/* ─────────────────────────────────────────────────────────────────────────────
   DOM HELPERS
───────────────────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const setHTML = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
const setText = (id, txt)  => { const el = $(id); if (el) el.textContent = txt; };
const show    = id          => { const el = $(id); if (el) el.removeAttribute('hidden'); };
const hide    = id          => { const el = $(id); if (el) el.setAttribute('hidden', ''); };

function showError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? '' : 'none';
}

function clearError(id) { showError(id, ''); }

/* ─────────────────────────────────────────────────────────────────────────────
   STEP NAVIGATION
───────────────────────────────────────────────────────────────────────────── */
function goToStep(n, animate = true) {
  const prev = state.currentStep;
  state.currentStep = n;

  // Hide all panels
  [1, 2, 3, 4].forEach(i => {
    const panel = $(`step-${i}`);
    if (!panel) return;
    panel.classList.toggle('bk-panel--hidden', i !== n);
    panel.classList.toggle('bk-panel--active', i === n);
    if (i === n && animate) {
      panel.style.animation = 'none';
      requestAnimationFrame(() => {
        panel.style.animation = '';
      });
    }
  });

  // Update progress bar
  document.querySelectorAll('.bk-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('is-active',    s === n);
    el.classList.toggle('is-complete',  s < n);
    el.setAttribute('aria-current', s === n ? 'step' : 'false');
  });

  // Scroll to top on mobile
  if (window.innerWidth < 900) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   SUMMARY SIDEBAR
───────────────────────────────────────────────────────────────────────────── */
function updateSummary() {
  const hasRoom = !!state.selectedRoom;
  const hasDates = !!(state.checkIn && state.checkOut);

  if (!hasDates) {
    show('summary-empty');
    hide('summary-content');
    updateMobileSummary(false);
    return;
  }

  hide('summary-empty');
  show('summary-content');

  // Room
  if (hasRoom) {
    const r = state.selectedRoom;
    setHTML('summary-room', `
      <div class="bk-summary-room-name">${r.name}</div>
      <div class="bk-summary-room-size">${r.bedConfiguration}${r.roomSize ? ' · ' + r.roomSize : ''}</div>
    `);
  } else {
    setHTML('summary-room', `<div class="bk-summary-room-placeholder">Choose a room below</div>`);
  }

  // Dates
  setHTML('summary-dates', `
    <div class="bk-summary-row">
      <span class="bk-summary-label">Check-In</span>
      <span class="bk-summary-value">${fmtDate(state.checkIn)}</span>
    </div>
    <div class="bk-summary-row">
      <span class="bk-summary-label">Check-Out</span>
      <span class="bk-summary-value">${fmtDate(state.checkOut)}</span>
    </div>
    <div class="bk-summary-row">
      <span class="bk-summary-label">Duration</span>
      <span class="bk-summary-value">${nightLabel(state.nights)}</span>
    </div>
  `);

  // Guests
  setHTML('summary-guests', `
    <div class="bk-summary-row">
      <span class="bk-summary-label">Guests</span>
      <span class="bk-summary-value">${guestLabel(state.adults, state.children)}</span>
    </div>
  `);

  // Pricing
  if (hasRoom && state.selectedRoom.pricing) {
    const p = state.selectedRoom.pricing;
    const taxLabel = (state.availabilityData && state.availabilityData.taxRate)
      ? `GST (${Math.round(state.availabilityData.taxRate * 100)}%)`
      : 'GST (12%)';
    setHTML('summary-pricing', `
      <div class="bk-summary-price-row">
        <span>${INR(p.basePrice)} × ${nightLabel(p.nights)}</span>
        <span>${INR(p.subtotal)}</span>
      </div>
      <div class="bk-summary-price-row is-tax">
        <span>${taxLabel}</span>
        <span>${INR(p.taxes)}</span>
      </div>
      <div class="bk-summary-price-row is-total">
        <span>Total</span>
        <span>${INR(p.total)}</span>
      </div>
    `);
  } else {
    setHTML('summary-pricing', '');
  }

  updateMobileSummary(true);
}

function updateMobileSummary(hasDates) {
  const shortEl = $('mobile-summary-short');
  if (!shortEl) return;
  if (!hasDates) {
    shortEl.textContent = 'View booking summary';
    return;
  }
  if (state.selectedRoom && state.selectedRoom.pricing) {
    shortEl.textContent = `${state.selectedRoom.name} · ${INR(state.selectedRoom.pricing.total)}`;
  } else {
    shortEl.textContent = `${fmtDate(state.checkIn)} → ${nightLabel(state.nights)}`;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   STEP 1: DATES & GUESTS
───────────────────────────────────────────────────────────────────────────── */
function initStep1() {
  const ciInput = $('check-in');
  const coInput = $('check-out');

  // Set min/max
  const today = todayStr();
  const maxD   = maxDate();
  if (ciInput) { ciInput.min = today; ciInput.max = maxD; }
  if (coInput) { coInput.max = maxD; }

  // Check-in change → update check-out min and state
  if (ciInput) {
    ciInput.addEventListener('change', () => {
      state.checkIn = ciInput.value || null;
      if (coInput) {
        // Check-out must be at least next day
        const nextDay = new Date(ciInput.value);
        nextDay.setDate(nextDay.getDate() + 1);
        coInput.min = nextDay.toISOString().split('T')[0];
        // If current checkout is before new min, clear it
        if (coInput.value && coInput.value <= ciInput.value) {
          coInput.value = '';
          state.checkOut = null;
          state.nights = 0;
        }
      }
      clearError('step1-error');
      updateSummary();
    });
  }

  if (coInput) {
    coInput.addEventListener('change', () => {
      state.checkOut = coInput.value || null;
      if (state.checkIn && state.checkOut) {
        state.nights = diffDays(state.checkIn, state.checkOut);
      }
      clearError('step1-error');
      updateSummary();
    });
  }

  // Guest counters
  document.querySelectorAll('.bk-counter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const min = parseInt(btn.dataset.min, 10);
      const max = parseInt(btn.dataset.max, 10);
      const valEl = $(targetId);
      if (!valEl) return;

      let val = parseInt(valEl.textContent, 10);
      if (btn.id.includes('minus')) val = Math.max(min, val - 1);
      else                          val = Math.min(max, val + 1);

      valEl.textContent = val;

      // Sync to state
      if (targetId === 'adults-val')   state.adults   = val;
      if (targetId === 'children-val') state.children = val;

      // Update button disabled states
      btn.closest('.bk-counter').querySelectorAll('.bk-counter-btn').forEach(b => {
        const v = parseInt(valEl.textContent, 10);
        if (b.id.includes('minus')) b.disabled = v <= min;
        if (b.id.includes('plus'))  b.disabled = v >= max;
      });

      clearError('step1-error');
      updateSummary();
    });
  });

  // Next button
  const nextBtn = $('step1-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', handleStep1Next);
  }
}

async function handleStep1Next() {
  clearError('step1-error');

  // Validate
  if (!state.checkIn) {
    showError('step1-error', 'Please select a check-in date.');
    $('check-in')?.focus();
    return;
  }
  if (!state.checkOut) {
    showError('step1-error', 'Please select a check-out date.');
    $('check-out')?.focus();
    return;
  }
  if (state.nights < 1) {
    showError('step1-error', 'Check-out must be after check-in by at least 1 night.');
    return;
  }
  if (state.adults < 1) {
    showError('step1-error', 'Please select at least 1 adult.');
    return;
  }

  // Check date is not in the past
  if (state.checkIn < todayStr()) {
    showError('step1-error', 'Check-in date cannot be in the past.');
    return;
  }

  // Animate button
  const btn = $('step1-next');
  btn.disabled = true;
  btn.textContent = 'Checking availability…';

  goToStep(2);
  await loadRooms();

  btn.disabled = false;
  btn.innerHTML = 'Check Availability <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
}

/* ─────────────────────────────────────────────────────────────────────────────
   STEP 2: ROOM SELECTION
───────────────────────────────────────────────────────────────────────────── */
async function loadRooms() {
  // Show loading
  show('rooms-loading');
  hide('rooms-empty');
  setHTML('rooms-list', '');
  clearError('step2-error');

  // Update subtitle
  const sub = $('step2-sub');
  if (sub) {
    sub.textContent = `Available for ${fmtDate(state.checkIn)} – ${fmtDate(state.checkOut)} · ${guestLabel(state.adults, state.children)}`;
  }

  try {
    const url = `/api/availability?checkIn=${state.checkIn}&checkOut=${state.checkOut}&adults=${state.adults}&children=${state.children}`;
    const res = await fetch(url);
    const data = await res.json();

    hide('rooms-loading');

    if (!res.ok) {
      showError('step2-error', data.error || 'Unable to check availability. Please try again.');
      return;
    }

    state.availabilityData = data;

    if (!data.rooms || data.rooms.length === 0) {
      show('rooms-empty');
      return;
    }

    renderRooms(data.rooms, data.nights);

  } catch (err) {
    hide('rooms-loading');
    showError('step2-error', 'Network error. Please check your connection and try again.');
    console.error('[booking] loadRooms error:', err);
  }
}

function renderRooms(rooms, nights) {
  const list = $('rooms-list');
  if (!list) return;

  list.innerHTML = rooms.map(room => {
    const p = room.pricing;
    const remaining = room.availability?.remainingRooms;
    const urgency = remaining === 1
      ? '<span class="bk-room-urgency">Last room!</span>'
      : remaining === 2
        ? '<span class="bk-room-urgency bk-room-urgency--low">Only 2 left</span>'
        : '';

    const amenityPills = (room.amenities || []).slice(0, 5).map(a =>
      `<span class="bk-room-amenity">${a}</span>`
    ).join('');

    return `
      <article class="bk-room-card" role="listitem" data-room-id="${room.id}" tabindex="0"
               aria-label="${room.name} — ${INR(room.basePrice)} per night">
        <div class="bk-room-img-wrap">
          <img src="${room.image || '/images/room-deluxe-balcony-9400.jpg'}"
               alt="${room.imageAlt || room.name}"
               class="bk-room-img" loading="lazy" />
          ${urgency}
        </div>
        <div class="bk-room-body">
          <div class="bk-room-meta">
            <span class="bk-room-size">${room.roomSize || ''}</span>
            ${room.view ? `<span class="bk-room-view">${room.view}</span>` : ''}
          </div>
          <h3 class="bk-room-name">${room.name}</h3>
          <p class="bk-room-desc">${room.shortDescription || room.description || ''}</p>
          <div class="bk-room-amenities">${amenityPills}</div>
          <div class="bk-room-footer">
            <div class="bk-room-price">
              <span class="bk-room-price-amount">${INR(room.basePrice)}</span>
              <span class="bk-room-price-unit">/ night</span>
              ${p ? `<span class="bk-room-price-total">${INR(p.total)} total incl. taxes</span>` : ''}
            </div>
            <button class="bk-btn-select" data-room-id="${room.id}" type="button"
                    aria-label="Select ${room.name}">
              Select Room
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Bind select buttons
  list.querySelectorAll('.bk-btn-select').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const roomId = btn.dataset.roomId;
      selectRoom(rooms, roomId);
    });
  });

  // Keyboard support for cards
  list.querySelectorAll('.bk-room-card').forEach(card => {
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const roomId = card.dataset.roomId;
        selectRoom(rooms, roomId);
      }
    });
  });
}

function selectRoom(rooms, roomId) {
  const room = rooms.find(r => r.id === roomId);
  if (!room) return;

  state.selectedRoom = room;

  // Highlight selected card
  document.querySelectorAll('.bk-room-card').forEach(c => {
    c.classList.toggle('is-selected', c.dataset.roomId === roomId);
  });

  updateSummary();

  // Brief highlight then advance
  setTimeout(() => goToStep(3), 300);
}

function initStep2() {
  const backBtn = $('step2-back');
  if (backBtn) backBtn.addEventListener('click', () => goToStep(1));

  const emptyBack = $('rooms-empty-back');
  if (emptyBack) emptyBack.addEventListener('click', () => goToStep(1));
}

/* ─────────────────────────────────────────────────────────────────────────────
   STEP 3: GUEST DETAILS
───────────────────────────────────────────────────────────────────────────── */
function initStep3() {
  const backBtn = $('step3-back');
  if (backBtn) backBtn.addEventListener('click', () => goToStep(2));

  // Textarea character counter
  const srField   = $('special-requests');
  const srCounter = $('sr-counter');
  if (srField && srCounter) {
    srField.addEventListener('input', () => {
      srCounter.textContent = `${srField.value.length}/500`;
    });
  }

  // Real-time validation
  const nameInput  = $('guest-name');
  const emailInput = $('guest-email');
  const phoneInput = $('guest-phone');

  if (nameInput) {
    nameInput.addEventListener('blur', () => {
      const v = nameInput.value.trim();
      showError('name-error', v.length < 2 ? 'Please enter your full name.' : '');
    });
  }

  if (emailInput) {
    emailInput.addEventListener('blur', () => {
      const v = emailInput.value.trim();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      showError('email-error', !ok ? 'Please enter a valid email address.' : '');
    });
  }

  if (phoneInput) {
    phoneInput.addEventListener('blur', () => {
      const v = phoneInput.value.trim().replace(/\s+/g, '');
      const ok = /^[+]?[\d\s\-()]{7,15}$/.test(v);
      showError('phone-error', !ok ? 'Please enter a valid phone number.' : '');
    });
  }

  // Form submit
  const form = $('guest-form');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      handleStep3Submit();
    });
  }

  // Also handle the button click explicitly (belt-and-suspenders for iOS)
  const nextBtn = $('step3-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', e => {
      if (nextBtn.type !== 'submit') handleStep3Submit();
    });
  }
}

function handleStep3Submit() {
  clearError('step3-error');
  let valid = true;

  const name  = $('guest-name')?.value.trim() || '';
  const email = $('guest-email')?.value.trim() || '';
  const phone = $('guest-phone')?.value.trim() || '';
  const sr    = $('special-requests')?.value.trim() || '';

  if (name.length < 2) {
    showError('name-error', 'Please enter your full name.');
    valid = false;
  } else {
    clearError('name-error');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('email-error', 'Please enter a valid email address.');
    valid = false;
  } else {
    clearError('email-error');
  }

  const phoneClean = phone.replace(/\s+/g, '');
  if (!/^[+]?[\d\s\-()]{7,15}$/.test(phoneClean)) {
    showError('phone-error', 'Please enter a valid phone number.');
    valid = false;
  } else {
    clearError('phone-error');
  }

  if (!valid) return;

  state.guestName      = name;
  state.guestEmail     = email;
  state.guestPhone     = phone;
  state.specialRequests = sr;

  goToStep(4);
  renderConfirmSummary();
}

/* ─────────────────────────────────────────────────────────────────────────────
   STEP 4: CONFIRM
───────────────────────────────────────────────────────────────────────────── */
function renderConfirmSummary() {
  const container = $('confirm-summary');
  if (!container) return;

  const r  = state.selectedRoom;
  const p  = r?.pricing;
  const taxLabel = (state.availabilityData?.taxRate)
    ? `GST (${Math.round(state.availabilityData.taxRate * 100)}%)`
    : 'GST (12%)';

  container.innerHTML = `
    <div class="bk-confirm-section">
      <div class="bk-confirm-label">Room</div>
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">Room Type</span>
        <span class="bk-confirm-val">${r?.name || '—'}</span>
      </div>
      ${r?.bedConfiguration ? `<div class="bk-confirm-row">
        <span class="bk-confirm-key">Bed</span>
        <span class="bk-confirm-val">${r.bedConfiguration}</span>
      </div>` : ''}
      ${r?.view ? `<div class="bk-confirm-row">
        <span class="bk-confirm-key">View</span>
        <span class="bk-confirm-val">${r.view}</span>
      </div>` : ''}
    </div>

    <div class="bk-confirm-section">
      <div class="bk-confirm-label">Stay</div>
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">Check-In</span>
        <span class="bk-confirm-val">${fmtDate(state.checkIn)}<small class="bk-confirm-hint"> from 14:00</small></span>
      </div>
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">Check-Out</span>
        <span class="bk-confirm-val">${fmtDate(state.checkOut)}<small class="bk-confirm-hint"> by 11:00</small></span>
      </div>
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">Duration</span>
        <span class="bk-confirm-val">${nightLabel(state.nights)}</span>
      </div>
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">Guests</span>
        <span class="bk-confirm-val">${guestLabel(state.adults, state.children)}</span>
      </div>
    </div>

    <div class="bk-confirm-section">
      <div class="bk-confirm-label">Guest</div>
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">Name</span>
        <span class="bk-confirm-val">${escHtml(state.guestName)}</span>
      </div>
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">Email</span>
        <span class="bk-confirm-val">${escHtml(state.guestEmail)}</span>
      </div>
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">Phone</span>
        <span class="bk-confirm-val">${escHtml(state.guestPhone)}</span>
      </div>
      ${state.specialRequests ? `<div class="bk-confirm-row">
        <span class="bk-confirm-key">Requests</span>
        <span class="bk-confirm-val">${escHtml(state.specialRequests)}</span>
      </div>` : ''}
    </div>

    ${p ? `
    <div class="bk-confirm-section bk-confirm-pricing">
      <div class="bk-confirm-label">Pricing</div>
      <div class="bk-confirm-price-row">
        <span>${INR(p.basePrice)} × ${nightLabel(p.nights)}</span>
        <span>${INR(p.subtotal)}</span>
      </div>
      <div class="bk-confirm-price-row is-tax">
        <span>${taxLabel}</span>
        <span>${INR(p.taxes)}</span>
      </div>
      <div class="bk-confirm-price-row is-total">
        <span>Total</span>
        <span>${INR(p.total)}</span>
      </div>
    </div>` : ''}
  `;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initStep4() {
  const backBtn = $('step4-back');
  if (backBtn) backBtn.addEventListener('click', () => goToStep(3));

  const confirmBtn = $('confirm-btn');
  if (confirmBtn) confirmBtn.addEventListener('click', submitReservation);
}

async function submitReservation() {
  clearError('step4-error');

  if (!state.selectedRoom || !state.checkIn || !state.checkOut || !state.guestName) {
    showError('step4-error', 'Something went wrong. Please go back and check your details.');
    return;
  }

  // Show overlay
  const overlay = $('bk-overlay');
  const overlayMsg = $('overlay-msg');
  if (overlay) overlay.classList.add('is-active');
  if (overlayMsg) overlayMsg.textContent = 'Confirming your reservation…';

  const confirmBtn = $('confirm-btn');
  if (confirmBtn) confirmBtn.disabled = true;

  try {
    const body = {
      roomTypeId:      state.selectedRoom.id,
      checkIn:         state.checkIn,
      checkOut:        state.checkOut,
      adults:          state.adults,
      children:        state.children,
      guestName:       state.guestName,
      guestEmail:      state.guestEmail,
      guestPhone:      state.guestPhone,
      specialRequests: state.specialRequests
    };

    const res = await fetch('/api/reservations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Reservation failed.');
    }

    if (overlayMsg) overlayMsg.textContent = 'Reservation confirmed!';

    // Store in sessionStorage for the confirmation page
    sessionStorage.setItem('slr_booking', JSON.stringify({
      ...data.reservation,
      roomImage: state.selectedRoom.image,
      roomImageAlt: state.selectedRoom.imageAlt
    }));

    // Redirect to confirmation
    setTimeout(() => {
      // Use clean URL (vercel.json rewrites /booking-confirmation → html file)
      window.location.href = '/booking-confirmation';
    }, 800);

  } catch (err) {
    if (overlay) overlay.classList.remove('is-active');
    if (confirmBtn) confirmBtn.disabled = false;
    showError('step4-error', err.message || 'Your reservation could not be completed. Please try again or call us.');
    console.error('[booking] submitReservation error:', err);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   MOBILE SUMMARY TOGGLE
───────────────────────────────────────────────────────────────────────────── */
function initMobileSummary() {
  const toggle = $('mobile-summary-toggle');
  const body   = $('mobile-summary-body');
  if (!toggle || !body) return;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', !expanded);
    body.classList.toggle('is-open', !expanded);
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   URL PRE-FILL
   Allows deep-linking with ?checkIn=...&checkOut=...&adults=...
───────────────────────────────────────────────────────────────────────────── */
function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const ci       = params.get('checkIn')  || params.get('check_in');
  const co       = params.get('checkOut') || params.get('check_out');
  const adults   = parseInt(params.get('adults')   || '0', 10);
  const children = parseInt(params.get('children') || '0', 10);
  const roomType = params.get('room') || params.get('roomType');

  if (ci) {
    state.checkIn = ci;
    const el = $('check-in');
    if (el) el.value = ci;
  }
  if (co) {
    state.checkOut = co;
    const el = $('check-out');
    if (el) { el.value = co; el.min = ci || todayStr(); }
  }
  if (state.checkIn && state.checkOut) {
    state.nights = diffDays(state.checkIn, state.checkOut);
  }
  if (adults >= 1) {
    state.adults = adults;
    const el = $('adults-val');
    if (el) el.textContent = adults;
  }
  if (children >= 0) {
    state.children = children;
    const el = $('children-val');
    if (el) el.textContent = children;
  }

  // If a specific room type was linked (e.g. from homepage "Book Now")
  // store it so we can pre-select after availability loads
  if (roomType) {
    state._preSelectRoomId = roomType;
  }

  // If dates were provided in URL, auto-jump to rooms step
  if (state.checkIn && state.checkOut && state.nights >= 1) {
    // Slight delay to let DOM settle
    setTimeout(() => {
      goToStep(2);
      loadRooms().then(() => {
        // Pre-select room if specified
        if (state._preSelectRoomId && state.availabilityData?.rooms) {
          const room = state.availabilityData.rooms.find(r => r.id === state._preSelectRoomId);
          if (room) {
            const btn = document.querySelector(`.bk-btn-select[data-room-id="${state._preSelectRoomId}"]`);
            if (btn) btn.click();
          }
        }
      });
    }, 100);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Show Step 1 by default. applyUrlParams() may override this to Step 2
  // via a setTimeout if valid date params are in the URL.
  goToStep(1, false);   // false = no animation on initial load

  applyUrlParams();
  initStep1();
  initStep2();
  initStep3();
  initStep4();
  initMobileSummary();
  updateSummary();
});
