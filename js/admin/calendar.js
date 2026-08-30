/**
 * SILVERLINE RESORT — Admin Calendar JS
 * Renders a monthly availability calendar using reservation data.
 */
'use strict';

const INR = n => '₹' + Number(n).toLocaleString('en-IN');

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed
let reservations = [];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN',
    { day: 'numeric', month: 'short', year: 'numeric' });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(s) {
  const map = {
    confirmed: ['badge-confirmed','Confirmed'], 'checked-in': ['badge-checked-in','In'],
    'checked-out': ['badge-completed','Out'], pending: ['badge-pending','Pending'],
    cancelled: ['badge-cancelled','Cancelled'], 'no-show': ['badge-noshow','No-Show']
  };
  const [cls, label] = map[s] || ['badge-pending', s];
  return `<span class="admin-status-badge ${cls}" style="font-size:0.6rem;">${label}</span>`;
}

async function loadCalendarData() {
  const { ok, data } = await window.adminAuth.apiFetch('/api/admin/reservations');
  if (!ok) return;
  reservations = (data.reservations || []).filter(r =>
    !['cancelled','no-show'].includes(r.status)
  );
  renderCalendar();
}

function getReservationsForDate(dateStr) {
  return reservations.filter(r => {
    if (!r.checkIn || !r.checkOut) return false;
    return r.checkIn <= dateStr && r.checkOut > dateStr;
  });
}

function isCheckIn(dateStr)  { return reservations.some(r => r.checkIn === dateStr  && !['cancelled','no-show'].includes(r.status)); }
function isCheckOut(dateStr) { return reservations.some(r => r.checkOut === dateStr && !['cancelled','no-show'].includes(r.status)); }

function renderCalendar() {
  const monthTitle = document.getElementById('cal-month-title');
  const grid       = document.getElementById('cal-grid');
  if (!monthTitle || !grid) return;

  const monthName = new Date(calYear, calMonth).toLocaleDateString('en-IN',
    { month: 'long', year: 'numeric' });
  monthTitle.textContent = monthName;

  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  // Day headers
  const dayHeaders = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    .map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // Empty cells before first day
  const blanks = Array(firstDay).fill('<div class="cal-cell cal-cell--blank"></div>').join('');

  // Day cells
  const dayCells = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const active  = getReservationsForDate(dateStr);
    const checkin = isCheckIn(dateStr);
    const checkout = isCheckOut(dateStr);
    const isToday = dateStr === todayStr;
    const isPast  = dateStr < todayStr;

    const classes = [
      'cal-cell',
      isToday   ? 'cal-cell--today'   : '',
      isPast    ? 'cal-cell--past'    : '',
      active.length ? 'cal-cell--has-bookings' : '',
      checkin   ? 'cal-cell--checkin' : '',
      checkout  ? 'cal-cell--checkout': ''
    ].filter(Boolean).join(' ');

    const bookingDots = active.slice(0, 3).map(r =>
      `<span class="cal-dot" title="${escHtml(r.guestName)} · ${escHtml(r.roomTypeName)}"></span>`
    ).join('');
    const moreText = active.length > 3 ? `<span class="cal-more">+${active.length-3}</span>` : '';

    dayCells.push(`
      <div class="${classes}" data-date="${dateStr}"
           ${active.length ? `tabindex="0" role="button" aria-label="${d} ${monthName}: ${active.length} booking${active.length!==1?'s':''}"` : ''}>
        <div class="cal-day-num">${d}</div>
        <div class="cal-day-dots">${bookingDots}${moreText}</div>
      </div>
    `);
  }

  grid.innerHTML = dayHeaders + blanks + dayCells.join('');

  // Click handler for cells with bookings
  grid.querySelectorAll('.cal-cell--has-bookings').forEach(cell => {
    cell.addEventListener('click', () => showDayDetail(cell.dataset.date));
    cell.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDayDetail(cell.dataset.date); }
    });
  });
}

function showDayDetail(dateStr) {
  const panel = document.getElementById('cal-day-panel');
  const panelDate = document.getElementById('cal-panel-date');
  const panelList = document.getElementById('cal-panel-list');
  if (!panel) return;

  const active = getReservationsForDate(dateStr);

  if (panelDate) panelDate.textContent = fmtDate(dateStr);
  if (panelList) {
    panelList.innerHTML = active.length
      ? active.map(r => `
        <div class="cal-panel-item">
          <div class="cal-panel-item-header">
            <span class="cal-panel-ref">${escHtml(r.bookingReference)}</span>
            ${statusBadge(r.status)}
          </div>
          <div class="cal-panel-guest">${escHtml(r.guestName)}</div>
          <div class="cal-panel-room">${escHtml(r.roomTypeName)}</div>
          <div class="cal-panel-dates">${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)} · ${r.nights}n</div>
        </div>
      `).join('')
      : '<div class="admin-empty-text">No active bookings on this day.</div>';
  }

  panel.classList.add('is-open');
}

function initCalendar() {
  const prevBtn  = document.getElementById('cal-prev');
  const nextBtn  = document.getElementById('cal-next');
  const todayBtn = document.getElementById('cal-today');
  const closeBtn = document.getElementById('cal-panel-close');
  const panel    = document.getElementById('cal-day-panel');

  if (prevBtn) prevBtn.addEventListener('click', () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar();
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
  });
  if (todayBtn) todayBtn.addEventListener('click', () => {
    const now = new Date();
    calYear = now.getFullYear(); calMonth = now.getMonth(); renderCalendar();
  });
  if (closeBtn) closeBtn.addEventListener('click', () => panel?.classList.remove('is-open'));
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.adminAuth.guardSession();
  if (!user) return;
  initCalendar();
  await loadCalendarData();
});
