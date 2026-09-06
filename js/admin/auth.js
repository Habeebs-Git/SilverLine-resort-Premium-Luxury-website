/**
 * SILVERLINE RESORT — Admin Auth Module
 *
 * Handles:
 *  - Login page form submission
 *  - Session guard (redirect to login if not authenticated)
 *  - Loading user info into the sidebar UI
 *  - Logout
 *
 * This file is included on EVERY admin page.
 * On the login page it initialises the login form.
 * On dashboard/protected pages it validates the session.
 */

'use strict';

/* ─── Shared Utilities ───────────────────────────────────────────────────── */

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* ─── SESSION GUARD ─────────────────────────────────────────────────────── */
// Called on every protected admin page.
// Verifies the session via /api/auth/me and populates sidebar user info.
// Redirects to login if session is missing or expired.

async function guardSession() {
  try {
    const { ok, data } = await apiFetch('/api/auth/me');
    if (!ok) {
      redirectToLogin();
      return null;
    }
    populateSidebarUser(data.user);
    initLogoutBtn();
    initMenuToggle();
    setActiveNav();
    return data.user;
  } catch {
    redirectToLogin();
    return null;
  }
}

function redirectToLogin() {
  const current = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/admin/login?next=${current}`;
}

function populateSidebarUser(user) {
  if (!user) return;
  const nameEl   = document.getElementById('user-name');
  const roleEl   = document.getElementById('user-role');
  const avatarEl = document.getElementById('user-avatar');

  if (nameEl)   nameEl.textContent   = user.name  || user.email || 'Admin';
  if (roleEl)   roleEl.textContent   = user.role  === 'admin' ? 'Administrator' : 'Front Desk';
  if (avatarEl) avatarEl.textContent = (user.name || user.email || 'A')[0].toUpperCase();

  // RBAC: Hide sensitive admin-only controls from staff
  if (user.role !== 'admin') {
    const settingsNav = document.getElementById('nav-settings');
    if (settingsNav) settingsNav.style.display = 'none';
  }

  // Update nav badge if pending count is available
  updatePendingBadge();
}

async function updatePendingBadge() {
  try {
    const { ok, data } = await apiFetch('/api/admin/dashboard');
    if (!ok) return;
    const badge = document.getElementById('nav-pending-count');
    const count = data?.stats?.pendingCount || 0;
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch { /* silent */ }
}

function initLogoutBtn() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Signing out…';
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch { /* still redirect */ }
    window.location.href = '/admin/login';
  });
}

function initMenuToggle() {
  const toggle   = document.getElementById('menu-toggle');
  const sidebar  = document.getElementById('admin-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open);
    if (backdrop) backdrop.classList.toggle('is-visible', open);
  });

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      backdrop.classList.remove('is-visible');
    });
  }
}

function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.admin-nav-link').forEach(link => {
    const href = link.getAttribute('href') || '';
    // Match on the filename portion
    const linkFile = href.split('/').pop();
    const pathFile = path.split('/').pop();
    link.classList.toggle('is-active', linkFile === pathFile && linkFile !== '');
  });
}

/* ─── LOGIN PAGE ─────────────────────────────────────────────────────────── */

function initLoginPage() {
  const form      = document.getElementById('login-form');
  const emailInp  = document.getElementById('email');
  const passInp   = document.getElementById('password');
  const submitBtn = document.getElementById('login-submit');
  const btnText   = document.getElementById('login-btn-text');
  const errorEl   = document.getElementById('login-error');

  if (!form) return;  // Not the login page

  // Redirect to dashboard if already logged in
  apiFetch('/api/auth/me').then(({ ok }) => {
    if (ok) window.location.href = '/admin/dashboard';
  });

  function showLoginError(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = msg ? '' : 'none';
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    showLoginError('');

    const email    = emailInp?.value.trim()  || '';
    const password = passInp?.value          || '';

    if (!email)    { showLoginError('Please enter your email address.'); emailInp?.focus(); return; }
    if (!password) { showLoginError('Please enter your password.');       passInp?.focus();  return; }

    // Loading state
    if (submitBtn) submitBtn.disabled = true;
    if (btnText)   btnText.textContent = 'Signing in…';

    try {
      const { ok, data } = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (!ok) {
        showLoginError(data.error || 'Invalid email or password. Please try again.');
        if (submitBtn) submitBtn.disabled = false;
        if (btnText)   btnText.textContent = 'Sign In';
        passInp?.focus();
        return;
      }

      // Successful login — redirect
      if (btnText) btnText.textContent = 'Redirecting…';
      const params  = new URLSearchParams(window.location.search);
      const next    = params.get('next') || '/admin/dashboard';
      // Only allow same-origin redirects
      const safeNext = next.startsWith('/') ? next : '/admin/dashboard';
      window.location.href = safeNext;

    } catch {
      showLoginError('Network error. Please try again.');
      if (submitBtn) submitBtn.disabled = false;
      if (btnText)   btnText.textContent = 'Sign In';
    }
  });
}

/* ─── INIT ───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const isLoginPage = !!document.getElementById('login-form');
  if (isLoginPage) {
    initLoginPage();
  }
  // For protected pages: guardSession() is called by each page's own script
  // so auth.js alone does nothing on protected pages (avoids double calls).
});

// Export for use by other admin scripts
window.adminAuth = { guardSession, apiFetch };
