/**
 * SILVERLINE RESORT — Booking Engine (Guest-Facing)
 * Multi-step booking flow:  Step 1 → Dates & Guests
 *                           Step 2 → Room Selection (multi-room with qty controls)
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
  selectedRoom: null,       // legacy: single room object (kept for backward compat)
  selectedRooms: {},        // multi-room: { roomTypeId: { room, quantity } }
  guestName:   '',
  guestEmail:  '',
  guestPhone:  '',
  specialRequests: '',
  availabilityData: null    // full response from /api/availability
};

// Only the latest availability search is allowed to update the room list.
// This prevents a late response from a prior search from restoring stale prices
// after the guest changes dates or navigates back.
let availabilityRequest = null;

function invalidateAvailability() {
  if (availabilityRequest) {
    availabilityRequest.abort();
    availabilityRequest = null;
  }
  state.selectedRoom = null;
  state.selectedRooms = {};
  state.availabilityData = null;
}

/**
 * Get selected rooms as an array of { roomTypeId, quantity, room }
 */
function getSelectedRoomsList() {
  return Object.values(state.selectedRooms).filter(s => s.quantity > 0);
}

/**
 * Get total room count across all types
 */
function getTotalRoomCount() {
  return getSelectedRoomsList().reduce((sum, s) => sum + s.quantity, 0);
}

/**
 * Calculate combined pricing from selected rooms
 */
function getCombinedPricing() {
  const items = getSelectedRoomsList();
  if (items.length === 0) return null;

  let subtotal = 0;
  let taxes = 0;
  const lineItems = [];

  for (const { room, quantity } of items) {
    if (!room.pricing) continue;
    const p = room.pricing;
    const lineSubtotal = p.subtotal * quantity;
    const lineTaxes    = p.taxes * quantity;
    subtotal += lineSubtotal;
    taxes    += lineTaxes;
    lineItems.push({
      roomTypeId:   room.id,
      roomTypeName: room.name,
      basePrice:    room.basePrice,
      quantity,
      nights:       p.nights,
      lineSubtotal,
      lineTaxes,
      lineTotal:    lineSubtotal + lineTaxes
    });
  }

  return {
    lineItems,
    subtotal,
    taxes,
    total: subtotal + taxes
  };
}

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
  const totalRooms = getTotalRoomCount();
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
  if (totalRooms > 0) {
    const items = getSelectedRoomsList();
    const roomLines = items.map(s =>
      `<div class="bk-summary-room-name">${s.room.name}${s.quantity > 1 ? ' × ' + s.quantity : ''}</div>
       <div class="bk-summary-room-size">${s.room.bedConfiguration}${s.room.roomSize ? ' · ' + s.room.roomSize : ''}</div>`
    ).join('');
    setHTML('summary-room', roomLines);
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
  const combined = getCombinedPricing();
  if (combined && combined.lineItems.length > 0) {
    const taxLabel = (state.availabilityData && state.availabilityData.taxRate)
      ? `GST (${Math.round(state.availabilityData.taxRate * 100)}%)`
      : 'GST (12%)';

    let pricingHtml = '';
    for (const li of combined.lineItems) {
      const label = li.quantity > 1
        ? `${INR(li.basePrice)} × ${nightLabel(li.nights)} × ${li.quantity} rooms`
        : `${INR(li.basePrice)} × ${nightLabel(li.nights)}`;
      pricingHtml += `
        <div class="bk-summary-price-row">
          <span>${li.roomTypeName}</span>
          <span>${INR(li.lineSubtotal)}</span>
        </div>
        <div class="bk-summary-price-row is-detail">
          <span>${label}</span>
          <span></span>
        </div>`;
    }
    pricingHtml += `
      <div class="bk-summary-price-row is-tax">
        <span>${taxLabel}</span>
        <span>${INR(combined.taxes)}</span>
      </div>
      <div class="bk-summary-price-row is-total">
        <span>Total</span>
        <span>${INR(combined.total)}</span>
      </div>`;
    setHTML('summary-pricing', pricingHtml);
  } else {
    setHTML('summary-pricing', '');
  }

  updateMobileSummary(true);
}

function updateMobileSummary(hasDates) {
  const shortEl = $('mobile-summary-short');
  const mobileBody = $('mobile-summary-body');
  if (!shortEl) return;
  if (!hasDates) {
    shortEl.textContent = 'View booking summary';
    if (mobileBody) mobileBody.innerHTML = '';
    return;
  }
  const totalRooms = getTotalRoomCount();
  const combined = getCombinedPricing();
  if (totalRooms > 0 && combined) {
    const items = getSelectedRoomsList();
    const names = items.map(s => s.room.name + (s.quantity > 1 ? ' ×' + s.quantity : '')).join(', ');
    shortEl.textContent = `${names} · ${INR(combined.total)}`;
  } else {
    shortEl.textContent = `${fmtDate(state.checkIn)} → ${nightLabel(state.nights)}`;
  }
  if (mobileBody) mobileBody.innerHTML = $('summary-content')?.innerHTML || '';
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
      // Dates changed — invalidate previous room selection & availability
      invalidateAvailability();
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
      // Dates changed — invalidate previous room selection & availability
      invalidateAvailability();
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

  // Clear any stale room selection from a previous flow
  invalidateAvailability();

  // Animate button
  const btn = $('step1-next');
  btn.disabled = true;
  btn.textContent = 'Checking availability…';

  // Start fetch BEFORE panel transition so network request runs in parallel
  // with the CSS animation, reducing perceived load time
  const roomsPromise = loadRooms();
  goToStep(2);
  await roomsPromise;

  btn.disabled = false;
  btn.innerHTML = 'Check Availability <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
}

/* ─────────────────────────────────────────────────────────────────────────────
   STEP 2: ROOM SELECTION (Multi-Room)
───────────────────────────────────────────────────────────────────────────── */
async function loadRooms() {
  // Cancel a pending search before issuing a replacement request.
  if (availabilityRequest) availabilityRequest.abort();
  const controller = new AbortController();
  availabilityRequest = controller;
  const search = {
    checkIn: state.checkIn,
    checkOut: state.checkOut,
    adults: state.adults,
    children: state.children
  };

  // Show loading (these elements use CSS display:none, not hidden attr)
  const loadingEl = $('rooms-loading');
  const emptyEl = $('rooms-empty');
  if (loadingEl) loadingEl.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';
  setHTML('rooms-list', '');
  // Remove stale continue button from previous render
  const oldContinue = document.getElementById('rooms-continue');
  if (oldContinue) oldContinue.remove();
  clearError('step2-error');

  // Update subtitle
  const sub = $('step2-sub');
  if (sub) {
    sub.textContent = `Available for ${fmtDate(state.checkIn)} – ${fmtDate(state.checkOut)} · ${guestLabel(state.adults, state.children)}`;
  }

  try {
    const url = `/api/availability?checkIn=${search.checkIn}&checkOut=${search.checkOut}&adults=${search.adults}&children=${search.children}`;
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    const data = await res.json();

    // Ignore a response that no longer belongs to the visible search.
    if (availabilityRequest !== controller ||
        state.checkIn !== search.checkIn || state.checkOut !== search.checkOut ||
        state.adults !== search.adults || state.children !== search.children) return;

    if (loadingEl) loadingEl.style.display = 'none';

    if (!res.ok) {
      showError('step2-error', data.error || 'Unable to check availability. Please try again.');
      return;
    }

    state.availabilityData = data;

    if (!data.rooms || data.rooms.length === 0) {
      if (emptyEl) emptyEl.style.display = '';
      return;
    }

    renderRooms(data.rooms, data.nights);

  } catch (err) {
    if (err.name === 'AbortError') return;
    if (loadingEl) loadingEl.style.display = 'none';
    showError('step2-error', 'Network error. Please check your connection and try again.');
    console.error('[booking] loadRooms error:', err);
  } finally {
    if (availabilityRequest === controller) availabilityRequest = null;
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

    // Capacity info
    const capacityInfo = `Max ${room.maxAdults} adults · ${room.maxGuests} guests per room`;

    // Current selection quantity for this room type
    const currentQty = state.selectedRooms[room.id]?.quantity || 0;
    const maxQty = remaining || 0;

    return `
      <article class="bk-room-card${currentQty > 0 ? ' is-selected' : ''}" role="listitem" data-room-id="${room.id}" tabindex="0"
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
          <div class="bk-room-capacity">${capacityInfo}</div>
          <div class="bk-room-amenities">${amenityPills}</div>
          <div class="bk-room-footer">
            <div class="bk-room-price">
              <span class="bk-room-price-amount">${INR(room.basePrice)}</span>
              <span class="bk-room-price-unit">/ night</span>
              ${p ? `<span class="bk-room-price-total">${INR(p.total)} total incl. taxes</span>` : ''}
            </div>
            <div class="bk-room-qty-wrap" data-room-id="${room.id}">
              <button class="bk-qty-btn bk-qty-minus" type="button" data-room-id="${room.id}" ${currentQty <= 0 ? 'disabled' : ''}
                      aria-label="Remove one ${room.name}">−</button>
              <output class="bk-qty-val" id="qty-${room.id}" aria-live="polite">${currentQty}</output>
              <button class="bk-qty-btn bk-qty-plus" type="button" data-room-id="${room.id}" ${currentQty >= maxQty ? 'disabled' : ''}
                      aria-label="Add one ${room.name}">+</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Add "Continue" button area below rooms
  const continueArea = document.createElement('div');
  continueArea.className = 'bk-rooms-continue';
  continueArea.id = 'rooms-continue';
  continueArea.innerHTML = `
    <button class="bk-btn-primary bk-btn-continue" id="step2-continue" type="button" disabled>
      Continue with Selected Rooms
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </button>
  `;
  list.after(continueArea);

  // Bind quantity buttons
  list.querySelectorAll('.bk-qty-minus').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      changeRoomQty(rooms, btn.dataset.roomId, -1);
    });
  });

  list.querySelectorAll('.bk-qty-plus').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      changeRoomQty(rooms, btn.dataset.roomId, 1);
    });
  });

  // Continue button
  const continueBtn = $('step2-continue');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      if (getTotalRoomCount() > 0) {
        // Set legacy selectedRoom for backward compat
        const first = getSelectedRoomsList()[0];
        if (first) state.selectedRoom = first.room;
        goToStep(3);
      }
    });
  }

  updateContinueBtn();
}

function changeRoomQty(rooms, roomId, delta) {
  const room = rooms.find(r => r.id === roomId);
  if (!room) return;

  const maxQty = room.availability?.remainingRooms || 0;
  const current = state.selectedRooms[roomId]?.quantity || 0;
  const newQty = Math.max(0, Math.min(maxQty, current + delta));

  if (newQty === 0) {
    delete state.selectedRooms[roomId];
  } else {
    state.selectedRooms[roomId] = { room, quantity: newQty };
  }

  // Update the quantity display
  const qtyEl = $(`qty-${roomId}`);
  if (qtyEl) qtyEl.textContent = newQty;

  // Update button states
  const wrap = document.querySelector(`.bk-room-qty-wrap[data-room-id="${roomId}"]`);
  if (wrap) {
    const minusBtn = wrap.querySelector('.bk-qty-minus');
    const plusBtn  = wrap.querySelector('.bk-qty-plus');
    if (minusBtn) minusBtn.disabled = newQty <= 0;
    if (plusBtn)  plusBtn.disabled  = newQty >= maxQty;
  }

  // Update card highlight
  const card = document.querySelector(`.bk-room-card[data-room-id="${roomId}"]`);
  if (card) card.classList.toggle('is-selected', newQty > 0);

  // Set legacy selectedRoom
  const first = getSelectedRoomsList()[0];
  state.selectedRoom = first ? first.room : null;

  updateSummary();
  updateContinueBtn();
}

function updateContinueBtn() {
  const btn = $('step2-continue');
  if (!btn) return;
  const total = getTotalRoomCount();
  btn.disabled = total === 0;
  if (total === 0) {
    btn.innerHTML = 'Continue with Selected Rooms <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  } else {
    const roomWord = total === 1 ? '1 Room' : `${total} Rooms`;
    const combined = getCombinedPricing();
    const priceStr = combined ? ` · ${INR(combined.total)}` : '';
    btn.innerHTML = `Continue with ${roomWord}${priceStr} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
  }
}

function initStep2() {
  const backBtn = $('step2-back');
  if (backBtn) backBtn.addEventListener('click', () => {
    // Clear room selection when going back — forces fresh search on next forward
    invalidateAvailability();
    goToStep(1);
  });

  const emptyBack = $('rooms-empty-back');
  if (emptyBack) emptyBack.addEventListener('click', () => {
    invalidateAvailability();
    goToStep(1);
  });
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
   STEP 4: CONFIRM (Multi-Room)
───────────────────────────────────────────────────────────────────────────── */
function renderConfirmSummary() {
  const container = $('confirm-summary');
  if (!container) return;

  const items = getSelectedRoomsList();
  const combined = getCombinedPricing();
  const taxLabel = (state.availabilityData?.taxRate)
    ? `GST (${Math.round(state.availabilityData.taxRate * 100)}%)`
    : 'GST (12%)';

  // Room section
  let roomHtml = '<div class="bk-confirm-section"><div class="bk-confirm-label">Rooms</div>';
  for (const { room, quantity } of items) {
    roomHtml += `
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">Room Type</span>
        <span class="bk-confirm-val">${room.name}${quantity > 1 ? ' × ' + quantity : ''}</span>
      </div>`;
    if (room.bedConfiguration) {
      roomHtml += `
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">Bed</span>
        <span class="bk-confirm-val">${room.bedConfiguration}</span>
      </div>`;
    }
    if (room.view) {
      roomHtml += `
      <div class="bk-confirm-row">
        <span class="bk-confirm-key">View</span>
        <span class="bk-confirm-val">${room.view}</span>
      </div>`;
    }
    // Add separator between room types
    if (items.length > 1) {
      roomHtml += '<div class="bk-confirm-room-sep"></div>';
    }
  }
  roomHtml += '</div>';

  // Stay section
  const stayHtml = `
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
    </div>`;

  // Guest section
  const guestHtml = `
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
    </div>`;

  // Pricing section
  let pricingHtml = '';
  if (combined) {
    pricingHtml = '<div class="bk-confirm-section bk-confirm-pricing"><div class="bk-confirm-label">Pricing</div>';
    for (const li of combined.lineItems) {
      const label = li.quantity > 1
        ? `${li.roomTypeName} × ${li.quantity}`
        : li.roomTypeName;
      const detail = li.quantity > 1
        ? `${INR(li.basePrice)} × ${nightLabel(li.nights)} × ${li.quantity}`
        : `${INR(li.basePrice)} × ${nightLabel(li.nights)}`;
      pricingHtml += `
        <div class="bk-confirm-price-row">
          <span>${label}</span>
          <span>${INR(li.lineSubtotal)}</span>
        </div>
        <div class="bk-confirm-price-row is-detail">
          <span>${detail}</span>
          <span></span>
        </div>`;
    }
    pricingHtml += `
      <div class="bk-confirm-price-row is-tax">
        <span>${taxLabel}</span>
        <span>${INR(combined.taxes)}</span>
      </div>
      <div class="bk-confirm-price-row is-total">
        <span>Total</span>
        <span>${INR(combined.total)}</span>
      </div>
    </div>`;
  }

  container.innerHTML = roomHtml + stayHtml + guestHtml + pricingHtml;
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

  const totalRooms = getTotalRoomCount();
  if (totalRooms === 0 || !state.checkIn || !state.checkOut || !state.guestName) {
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
    // Build the request body
    const items = getSelectedRoomsList();
    const isMultiRoom = items.length > 1 || items[0].quantity > 1;

    const body = {
      checkIn:         state.checkIn,
      checkOut:        state.checkOut,
      adults:          state.adults,
      children:        state.children,
      guestName:       state.guestName,
      guestEmail:      state.guestEmail,
      guestPhone:      state.guestPhone,
      specialRequests: state.specialRequests
    };

    if (isMultiRoom) {
      // Multi-room payload
      body.rooms = items.map(s => ({ roomTypeId: s.room.id, quantity: s.quantity }));
    } else {
      // Single-room payload (backward compatible)
      body.roomTypeId = items[0].room.id;
    }

    if (overlayMsg) overlayMsg.textContent = 'Generating payment order…';

    // 1. Fetch Order from /api/orders
    const orderRes = await fetch('/api/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });

    const orderData = await orderRes.json();

    if (!orderRes.ok) {
      throw new Error(orderData.error || 'Could not create order.');
    }

    // 2. Load Razorpay script if not loaded
    if (!window.Razorpay) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
        document.body.appendChild(script);
      });
    }

    // Hide overlay while user interacts with Razorpay
    if (overlay) overlay.classList.remove('is-active');

    // 3. Open Razorpay Widget
    const roomDesc = items.map(s => s.room.name + (s.quantity > 1 ? ' ×' + s.quantity : '')).join(', ');
    const options = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      name: 'Silverline Resort Ooty',
      description: roomDesc || 'Room Reservation',
      order_id: orderData.order_id,
      prefill: {
        name: state.guestName,
        email: state.guestEmail,
        contact: state.guestPhone
      },
      theme: {
        color: '#2a5d4f'
      },
      handler: async function (response) {
        try {
          if (overlay) overlay.classList.add('is-active');
          if (overlayMsg) overlayMsg.textContent = 'Confirming your reservation…';

          // 4. Submit to /api/reservations to verify & finalize
          const finalBody = {
            ...body,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          };

          const res = await fetch('/api/reservations', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(finalBody)
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || 'Reservation failed.');
          }

          if (overlayMsg) overlayMsg.textContent = 'Reservation confirmed!';

          // Store in sessionStorage for the confirmation page
          const bookingData = {
            ...data.reservation,
            // Attach room images for confirmation page
            roomImages: items.map(s => ({
              roomTypeId: s.room.id,
              roomTypeName: s.room.name,
              image: s.room.image,
              imageAlt: s.room.imageAlt,
              quantity: s.quantity
            }))
          };
          // Legacy field
          if (!isMultiRoom) {
            bookingData.roomImage = items[0].room.image;
            bookingData.roomImageAlt = items[0].room.imageAlt;
          }
          sessionStorage.setItem('slr_booking', JSON.stringify(bookingData));

          // Redirect to confirmation
          setTimeout(() => {
            window.location.href = '/booking-confirmation';
          }, 800);

        } catch (err) {
          if (overlay) overlay.classList.remove('is-active');
          if (confirmBtn) confirmBtn.disabled = false;
          showError('step4-error', err.message || 'Payment verification failed.');
        }
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response){
      if (confirmBtn) confirmBtn.disabled = false;
      showError('step4-error', response.error.description || 'Payment failed. Please try again.');
    });
    rzp.open();

  } catch (err) {
    if (overlay) overlay.classList.remove('is-active');
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
            // Auto-add one of the pre-selected room type
            changeRoomQty(state.availabilityData.rooms, state._preSelectRoomId, 1);
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
