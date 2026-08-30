/**
 * SILVERLINE RESORT — Admin Reservations JS
 * List, filter, view and update reservations.
 */
'use strict';

const INR = n => '₹' + Number(n).toLocaleString('en-IN');
const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN',
  { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(s) {
  const map = {
    confirmed:    ['badge-confirmed',   'Confirmed'],
    'checked-in': ['badge-checked-in',  'Checked-In'],
    'checked-out':['badge-completed',   'Checked-Out'],
    pending:      ['badge-pending',     'Pending'],
    cancelled:    ['badge-cancelled',   'Cancelled'],
    'no-show':    ['badge-noshow',      'No-Show']
  };
  const [cls, label] = map[s] || ['badge-pending', s];
  return `<span class="admin-status-badge ${cls}">${label}</span>`;
}

let allReservations = [];
let currentFilter = { status: '', search: '' };

async function loadReservations() {
  const res = document.getElementById('reservations-tbody');
  const loader = document.getElementById('res-loader');
  const empty = document.getElementById('res-empty');
  if (loader) loader.style.display = '';
  if (empty) empty.style.display = 'none';

  const { ok, data } = await window.adminAuth.apiFetch('/api/admin/reservations');
  if (loader) loader.style.display = 'none';

  if (!ok) {
    showToast('Failed to load reservations.', 'error');
    return;
  }

  allReservations = data.reservations || [];
  applyFilter();
}

function applyFilter() {
  let list = [...allReservations];
  if (currentFilter.status) {
    list = list.filter(r => r.status === currentFilter.status);
  }
  if (currentFilter.search) {
    const q = currentFilter.search.toLowerCase();
    list = list.filter(r =>
      (r.bookingReference || '').toLowerCase().includes(q) ||
      (r.guestName || '').toLowerCase().includes(q) ||
      (r.guestEmail || '').toLowerCase().includes(q) ||
      (r.roomTypeName || '').toLowerCase().includes(q)
    );
  }

  renderTable(list);

  // Update count
  const countEl = document.getElementById('res-count');
  if (countEl) countEl.textContent = `${list.length} reservation${list.length !== 1 ? 's' : ''}`;
}

function renderTable(list) {
  const tbody = document.getElementById('reservations-tbody');
  const empty = document.getElementById('res-empty');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = list.map(r => `
    <tr class="res-row" data-id="${r.id}">
      <td><button class="admin-link res-open-btn" data-id="${r.id}">${escHtml(r.bookingReference)}</button></td>
      <td>
        <div class="admin-guest-name">${escHtml(r.guestName)}</div>
        <div class="admin-guest-email">${escHtml(r.guestEmail)}</div>
      </td>
      <td>${escHtml(r.roomTypeName)}</td>
      <td>${fmt(r.checkIn)}</td>
      <td>${fmt(r.checkOut)}</td>
      <td>${r.nights || '—'}</td>
      <td>${INR(r.total)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>
        <div class="admin-actions-cell">
          <button class="btn-admin btn-admin-ghost btn-admin-sm res-open-btn" data-id="${r.id}">View</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Bind open buttons
  tbody.querySelectorAll('.res-open-btn').forEach(btn => {
    btn.addEventListener('click', () => openDetail(btn.dataset.id));
  });
}

function openDetail(id) {
  const res = allReservations.find(r => r.id === id);
  if (!res) return;

  const modal = document.getElementById('res-modal');
  const body  = document.getElementById('res-modal-body');
  if (!modal || !body) return;

  body.innerHTML = `
    <div class="admin-detail-grid">
      <div class="admin-detail-section">
        <div class="admin-detail-label">Reference</div>
        <div class="admin-detail-value">${escHtml(res.bookingReference)}</div>
      </div>
      <div class="admin-detail-section">
        <div class="admin-detail-label">Status</div>
        <div class="admin-detail-value">${statusBadge(res.status)}</div>
      </div>
      <div class="admin-detail-section">
        <div class="admin-detail-label">Guest</div>
        <div class="admin-detail-value">${escHtml(res.guestName)}<br>
          <small>${escHtml(res.guestEmail)}</small><br>
          <small>${escHtml(res.guestPhone || '')}</small>
        </div>
      </div>
      <div class="admin-detail-section">
        <div class="admin-detail-label">Room</div>
        <div class="admin-detail-value">${escHtml(res.roomTypeName)}</div>
      </div>
      <div class="admin-detail-section">
        <div class="admin-detail-label">Check-In</div>
        <div class="admin-detail-value">${fmt(res.checkIn)}</div>
      </div>
      <div class="admin-detail-section">
        <div class="admin-detail-label">Check-Out</div>
        <div class="admin-detail-value">${fmt(res.checkOut)}</div>
      </div>
      <div class="admin-detail-section">
        <div class="admin-detail-label">Duration</div>
        <div class="admin-detail-value">${res.nights || '—'} night${res.nights !== 1 ? 's' : ''}</div>
      </div>
      <div class="admin-detail-section">
        <div class="admin-detail-label">Guests</div>
        <div class="admin-detail-value">${res.adults} adult${res.adults !== 1?'s':''} ${res.children ? `, ${res.children} child${res.children !== 1?'ren':''}` : ''}</div>
      </div>
      <div class="admin-detail-section">
        <div class="admin-detail-label">Pricing</div>
        <div class="admin-detail-value">
          ${INR(res.basePrice)}/night · Subtotal ${INR(res.subtotal)} · Tax ${INR(res.taxes)}<br>
          <strong>Total: ${INR(res.total)}</strong>
        </div>
      </div>
      <div class="admin-detail-section">
        <div class="admin-detail-label">Payment</div>
        <div class="admin-detail-value">${escHtml(res.paymentStatus || '—')} · ${escHtml(res.paymentProvider || '—')}<br>
          <small>${escHtml(res.paymentReference || '')}</small>
        </div>
      </div>
      ${res.specialRequests ? `<div class="admin-detail-section admin-detail-full">
        <div class="admin-detail-label">Special Requests</div>
        <div class="admin-detail-value">${escHtml(res.specialRequests)}</div>
      </div>` : ''}
    </div>

    <div class="admin-modal-status-actions">
      <div class="admin-detail-label" style="margin-bottom:0.75rem;">Update Status</div>
      <div class="admin-status-btn-group">
        ${['confirmed','checked-in','checked-out','cancelled','no-show'].map(s =>
          `<button class="btn-admin ${res.status === s ? 'btn-admin-primary' : 'btn-admin-ghost'} btn-admin-sm res-status-btn"
                   data-id="${res.id}" data-status="${s}">${s}</button>`
        ).join('')}
      </div>
    </div>
  `;

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  // Status buttons
  body.querySelectorAll('.res-status-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.id, btn.dataset.status));
  });
}

async function updateStatus(id, status) {
  const { ok, data } = await window.adminAuth.apiFetch(`/api/admin/reservations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  if (!ok) {
    showToast(data.error || 'Failed to update status.', 'error');
    return;
  }
  showToast(`Status updated to "${status}".`, 'success');
  closeModal();
  await loadReservations();
}

function closeModal() {
  const modal = document.getElementById('res-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `admin-toast admin-toast--${type}`;
  t.textContent = msg;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('is-visible'));
  setTimeout(() => { t.classList.remove('is-visible'); setTimeout(() => t.remove(), 400); }, 3500);
}

function initFilters() {
  const searchInp = document.getElementById('res-search');
  const statusSel = document.getElementById('res-status-filter');

  if (searchInp) {
    searchInp.addEventListener('input', () => {
      currentFilter.search = searchInp.value.trim();
      applyFilter();
    });
  }
  if (statusSel) {
    statusSel.addEventListener('change', () => {
      currentFilter.status = statusSel.value;
      applyFilter();
    });
  }

  // Modal close
  const closeBtn = document.getElementById('res-modal-close');
  const modal    = document.getElementById('res-modal');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal();
    });
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.adminAuth.guardSession();
  if (!user) return;
  initFilters();
  await loadReservations();
});
