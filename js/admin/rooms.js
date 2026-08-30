/**
 * SILVERLINE RESORT — Admin Rooms JS
 * Displays room inventory and pricing from /api/admin/rooms
 */
'use strict';

const INR = n => '₹' + Number(n).toLocaleString('en-IN');

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

async function loadRooms() {
  const { ok, data } = await window.adminAuth.apiFetch('/api/admin/rooms');
  const loader = document.getElementById('rooms-loader');
  if (loader) loader.style.display = 'none';

  if (!ok) {
    showToast('Failed to load rooms.', 'error');
    return;
  }

  renderRooms(data.rooms || []);
}

function renderRooms(rooms) {
  const grid = document.getElementById('rooms-grid');
  if (!grid) return;

  if (!rooms.length) {
    grid.innerHTML = '<div class="admin-empty-text" style="padding:2rem;">No rooms configured.</div>';
    return;
  }

  grid.innerHTML = rooms.map(r => `
    <div class="admin-room-card ${r.active ? '' : 'is-inactive'}">
      <div class="admin-room-card-img-wrap">
        <img src="${escHtml(r.image || '/images/room-deluxe-balcony-9400.jpg')}"
             alt="${escHtml(r.imageAlt || r.name)}"
             class="admin-room-card-img" loading="lazy" />
        <span class="admin-room-card-status ${r.active ? 'is-active' : 'is-inactive'}">
          ${r.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div class="admin-room-card-body">
        <h3 class="admin-room-card-name">${escHtml(r.name)}</h3>
        <div class="admin-room-card-meta">
          <span>${escHtml(r.bedConfiguration || '—')}</span>
          ${r.roomSize ? `<span>·</span><span>${escHtml(r.roomSize)}</span>` : ''}
          ${r.view ? `<span>·</span><span>${escHtml(r.view)}</span>` : ''}
        </div>
        <p class="admin-room-card-desc">${escHtml(r.shortDescription || '')}</p>
        <div class="admin-room-card-stats">
          <div class="admin-room-stat">
            <span class="admin-room-stat-label">Base Price</span>
            <span class="admin-room-stat-value">${INR(r.basePrice)}/night</span>
          </div>
          <div class="admin-room-stat">
            <span class="admin-room-stat-label">Inventory</span>
            <span class="admin-room-stat-value">${r.inventory} unit${r.inventory !== 1 ? 's' : ''}</span>
          </div>
          <div class="admin-room-stat">
            <span class="admin-room-stat-label">Max Guests</span>
            <span class="admin-room-stat-value">${r.maxAdults} adults${r.maxGuests > r.maxAdults ? ' + children' : ''}</span>
          </div>
        </div>
        <div class="admin-room-card-amenities">
          ${(r.amenities || []).slice(0, 5).map(a =>
            `<span class="admin-room-amenity">${escHtml(a)}</span>`
          ).join('')}
          ${r.amenities && r.amenities.length > 5
            ? `<span class="admin-room-amenity admin-room-amenity-more">+${r.amenities.length - 5} more</span>`
            : ''}
        </div>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.adminAuth.guardSession();
  if (!user) return;
  await loadRooms();
});
