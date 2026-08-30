/**
 * SILVERLINE RESORT — Admin Settings JS
 * Load and save resort settings via /api/admin/settings
 */
'use strict';

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

async function loadSettings() {
  const { ok, data } = await window.adminAuth.apiFetch('/api/admin/settings');
  if (!ok) { showToast('Failed to load settings.', 'error'); return; }

  const s = data.settings || {};
  // data.settings has shape: { hotel: {...}, pricing: {...}, notifications: {...} }

  // Pricing section — matches s.pricing
  setValue('tax-rate',  s.pricing?.taxRate !== undefined ? (s.pricing.taxRate * 100).toFixed(0) : '12');
  setValue('tax-label', s.pricing?.taxLabel  || 'GST (12%)');
  setValue('currency',  s.pricing?.currency  || s.hotel?.currency || 'INR');

  // Booking rules — stored inside s.hotel in settings.json
  setValue('checkin-time',   s.hotel?.checkInTime  || '14:00');
  setValue('checkout-time',  s.hotel?.checkOutTime || '11:00');
  setValue('min-nights',     s.pricing?.minNights  || '1');
  setValue('booking-window', s.pricing?.advanceBookingDays || '365');

  // Contact — stored inside s.hotel
  setValue('resort-name',    s.hotel?.name    || 'Silverline Resort');
  setValue('resort-phone',   s.hotel?.phone   || '+91 86384 79919');
  setValue('resort-email',   s.hotel?.reservationsEmail || s.hotel?.email || 'reservations@silverlineresort.in');
  setValue('resort-address', s.hotel?.address || '');
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

async function saveSettings() {
  const taxRateRaw = parseFloat(getValue('tax-rate'));
  if (isNaN(taxRateRaw) || taxRateRaw < 0 || taxRateRaw > 50) {
    showToast('Tax rate must be between 0 and 50%.', 'error'); return;
  }

  // Build payload matching the API's expected structure (hotel + pricing keys)
  const payload = {
    hotel: {
      name:         getValue('resort-name'),
      phone:        getValue('resort-phone'),
      email:        getValue('resort-email'),
      address:      getValue('resort-address'),
      checkInTime:  getValue('checkin-time')   || '14:00',
      checkOutTime: getValue('checkout-time')  || '11:00'
    },
    pricing: {
      taxRate:           taxRateRaw / 100,
      taxLabel:          getValue('tax-label') || 'GST',
      minNights:         parseInt(getValue('min-nights'), 10)      || 1,
      advanceBookingDays:parseInt(getValue('booking-window'), 10)  || 365
    }
  };

  const saveBtn = document.getElementById('save-settings');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  const { ok, data } = await window.adminAuth.apiFetch('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Settings'; }

  if (!ok) { showToast(data.error || 'Failed to save settings.', 'error'); return; }
  showToast('Settings saved successfully.', 'success');
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.adminAuth.guardSession();
  if (!user) return;

  await loadSettings();

  const form = document.getElementById('settings-form');
  if (form) {
    form.addEventListener('submit', e => { e.preventDefault(); saveSettings(); });
  }
  const saveBtn = document.getElementById('save-settings');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }
});
