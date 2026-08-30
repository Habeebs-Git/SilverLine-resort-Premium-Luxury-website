/**
 * SILVERLINE RESORT — Admin Dashboard JS
 * Fetches stats from /api/admin/dashboard and renders them.
 */
'use strict';

const INR = n => '₹' + Number(n).toLocaleString('en-IN');
const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN',
  { day:'numeric', month:'short', year:'numeric' }) : '—';

function statusBadge(s) {
  const map = {
    confirmed:   ['badge-confirmed',   'Confirmed'],
    'checked-in':['badge-checked-in',  'Checked-In'],
    'checked-out':['badge-completed',  'Checked-Out'],
    pending:     ['badge-pending',     'Pending'],
    cancelled:   ['badge-cancelled',   'Cancelled'],
    'no-show':   ['badge-noshow',      'No-Show']
  };
  const [cls, label] = map[s] || ['badge-pending', s];
  return `<span class="admin-status-badge ${cls}">${label}</span>`;
}

async function loadDashboard() {
  const { ok, data } = await window.adminAuth.apiFetch('/api/admin/dashboard');
  if (!ok) {
    document.getElementById('dashboard-content').innerHTML =
      '<div class="admin-empty-text" style="padding:3rem; text-align:center;">Could not load dashboard data.</div>';
    return;
  }

  const s = data.stats || {};

  // Stats cards
  setText('stat-occupancy', `${s.occupancyRate ?? 0}%`);
  setText('stat-occupancy-rate', `${s.occupiedToday ?? 0} of ${s.totalRooms ?? 0} rooms`);
  setText('stat-arrivals', s.arrivalsToday ?? 0);
  setText('stat-departures', `${s.departuresToday ?? 0} departures`);
  setText('stat-revenue-month', INR(s.revenueThisMonth ?? 0));
  setText('stat-revenue-today', `${INR(s.revenueToday ?? 0)} today`);
  setText('stat-pending', s.pendingCount ?? 0);
  setText('stat-confirmed', `${s.confirmedCount ?? 0} confirmed`);

  // Topbar date
  setText('topbar-date', new Date().toLocaleDateString('en-IN',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' }));

  // Recent bookings
  renderRecentBookings(data.recentReservations || []);

  // Room summary
  renderRoomSummary(data.roomSummary || []);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderRecentBookings(reservations) {
  const tbody = document.getElementById('recent-bookings-body');
  if (!tbody) return;

  if (!reservations.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="admin-empty-text" style="text-align:center; padding:2rem;">No reservations yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = reservations.slice(0, 8).map(r => `
    <tr>
      <td><a href="/admin/reservations?id=${r.id}" class="admin-link">${r.bookingReference}</a></td>
      <td>${escHtml(r.guestName)}</td>
      <td>${escHtml(r.roomTypeName)}</td>
      <td>${fmt(r.checkIn)}</td>
      <td>${INR(r.total)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>
  `).join('');
}

function renderRoomSummary(rooms) {
  const el = document.getElementById('room-summary');
  if (!el) return;

  if (!rooms.length) {
    el.innerHTML = '<div class="admin-empty-text" style="padding:1.5rem;">No room data available.</div>';
    return;
  }

  el.innerHTML = `<div class="admin-room-summary-list">${rooms.map(r => `
    <div class="admin-room-summary-item">
      <div class="admin-room-summary-name">${escHtml(r.name)}</div>
      <div class="admin-room-summary-meta">${r.occupied}/${r.inventory} occupied · ${INR(r.basePrice)}/night</div>
      <div class="admin-room-summary-bar">
        <div class="admin-room-summary-fill" style="width:${r.inventory ? Math.round((r.occupied/r.inventory)*100) : 0}%"></div>
      </div>
    </div>
  `).join('')}</div>`;
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.adminAuth.guardSession();
  if (!user) return;
  await loadDashboard();
});
