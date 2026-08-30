/**
 * SILVERLINE RESORT — Admin Guests JS
 * Lists guest records from /api/admin/guests
 */
'use strict';

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
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

let allGuests = [];

async function loadGuests() {
  const loader = document.getElementById('guests-loader');
  const { ok, data } = await window.adminAuth.apiFetch('/api/admin/guests');
  if (loader) loader.style.display = 'none';

  if (!ok) {
    showToast('Failed to load guests.', 'error');
    return;
  }

  allGuests = data.guests || [];
  renderGuests(allGuests);
}

function renderGuests(guests) {
  const tbody = document.getElementById('guests-tbody');
  const empty = document.getElementById('guests-empty');
  const count = document.getElementById('guests-count');

  if (count) count.textContent = `${guests.length} guest${guests.length !== 1 ? 's' : ''}`;

  if (!tbody) return;

  if (!guests.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = guests.map(g => `
    <tr>
      <td>
        <div class="admin-guest-avatar-wrap">
          <div class="admin-guest-avatar-sm">${(g.name || '?')[0].toUpperCase()}</div>
          <div>
            <div class="admin-guest-name">${escHtml(g.name)}</div>
          </div>
        </div>
      </td>
      <td><a href="mailto:${escHtml(g.email)}" class="admin-link">${escHtml(g.email)}</a></td>
      <td>${escHtml(g.phone || '—')}</td>
      <td>${escHtml(g.address || '—')}</td>
      <td>${fmtDate(g.createdAt)}</td>
      <td>${g.reservationCount !== undefined ? g.reservationCount : '—'}</td>
    </tr>
  `).join('');
}

function initSearch() {
  const inp = document.getElementById('guests-search');
  if (!inp) return;
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    const filtered = q
      ? allGuests.filter(g =>
          (g.name  || '').toLowerCase().includes(q) ||
          (g.email || '').toLowerCase().includes(q) ||
          (g.phone || '').toLowerCase().includes(q)
        )
      : allGuests;
    renderGuests(filtered);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.adminAuth.guardSession();
  if (!user) return;
  initSearch();
  await loadGuests();
});
