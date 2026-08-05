/* ============================================================
   SILVERLINE RESORT — interaction layer
   Lenis smooth scroll · GSAP scroll storytelling · reveals ·
   magnetic buttons · cursor glow · 3D tilt · lightbox
   Motion timing is slow and eased to match the drift of the
   drone footage. Everything degrades safely.
   ============================================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer  = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isMobile     = window.matchMedia('(max-width: 1024px)').matches;

  /* ----------------------------------------------------------
     PRELOADER
     ---------------------------------------------------------- */
  const preloader = document.getElementById('preloader');
  const plFill    = document.getElementById('pl-fill');
  const plPct     = document.getElementById('pl-pct');

  let progress = 0;
  const tick = setInterval(() => {
    progress += Math.random() * 16 + 6;
    if (progress > 100) progress = 100;
    if (plFill) plFill.style.width = progress + '%';
    if (plPct) plPct.textContent = String(Math.floor(progress)).padStart(2, '0');
    if (progress >= 100) clearInterval(tick);
  }, 190);

  function dismissPreloader() {
    progress = 100;
    clearInterval(tick);
    if (plFill) plFill.style.width = '100%';
    if (plPct) plPct.textContent = '100';

    setTimeout(() => {
      if (preloader) preloader.classList.add('is-done');
      document.body.classList.add('is-loaded');
      playHero();
    }, 480);
  }

  if (document.readyState === 'complete') setTimeout(dismissPreloader, 700);
  else window.addEventListener('load', () => setTimeout(dismissPreloader, 700));
  // Safety net so the page is never gated behind a stalled asset
  setTimeout(dismissPreloader, 5200);

  /* ----------------------------------------------------------
     HERO ENTRANCE
     ---------------------------------------------------------- */
  function playHero() {
    const items = document.querySelectorAll('.hero-in');
    if (reduceMotion || typeof gsap === 'undefined') {
      items.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
      return;
    }
    gsap.set(items, { opacity: 0, y: 42, filter: 'blur(9px)' });
    gsap.to(items, {
      opacity: 1, y: 0, filter: 'blur(0px)',
      duration: 1.9, ease: 'power3.out', stagger: 0.16, delay: 0.15
    });

    const media = document.getElementById('hero-media');
    if (media) gsap.to(media, { scale: 1, duration: 3.4, ease: 'power2.out' });
  }
  // Pre-hide hero items immediately to avoid a flash before GSAP runs
  if (!reduceMotion && typeof gsap !== 'undefined') {
    gsap.set('.hero-in', { opacity: 0, y: 42 });
  }

  /* ----------------------------------------------------------
     LENIS SMOOTH SCROLL
     ---------------------------------------------------------- */
  let lenis = null;
  if (typeof Lenis !== 'undefined' && !reduceMotion) {
    lenis = new Lenis({
      duration: 1.35,
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
      wheelMultiplier: 0.95
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    if (typeof ScrollTrigger !== 'undefined') {
      lenis.on('scroll', ScrollTrigger.update);
    }
    window.__lenis = lenis;
  }

  // Anchor navigation routed through Lenis
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      closeDrawer();
      if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.7 });
      else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* ----------------------------------------------------------
     REVEAL ON SCROLL
     ---------------------------------------------------------- */
  const revealTargets = document.querySelectorAll('[data-reveal], .amenity-item, .img-reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-inview');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach(el => io.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('is-inview'));
  }

  /* ----------------------------------------------------------
     GSAP SCROLL STORYTELLING
     ---------------------------------------------------------- */
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined' && !reduceMotion) {
    gsap.registerPlugin(ScrollTrigger);

    // Hero: depth-based exit — media drifts, copy lifts and softens
    const heroMedia = document.getElementById('hero-media');
    const heroCopy  = document.getElementById('hero-copy');

    if (heroMedia) {
      gsap.to(heroMedia, {
        yPercent: 17, scale: 1.14, ease: 'none',
        scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1.1 }
      });
    }
    if (heroCopy) {
      gsap.to(heroCopy, {
        yPercent: -13, opacity: 0, filter: 'blur(7px)', ease: 'none',
        scrollTrigger: { trigger: '#hero', start: '18% top', end: 'bottom top', scrub: 1.1 }
      });
    }

    // Nature band: slow background push
    document.querySelectorAll('[data-bg-parallax]').forEach(el => {
      gsap.fromTo(el, { yPercent: -8 }, {
        yPercent: 8, ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: 1.2 }
      });
    });

    // Generic depth parallax
    document.querySelectorAll('[data-parallax]').forEach(el => {
      const depth = parseFloat(el.dataset.parallax) || 0.04;
      gsap.fromTo(el, { y: depth * 260 }, {
        y: -depth * 260, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 1.3 }
      });
    });

    // Scroll progress rail
    gsap.to('#scroll-progress', {
      scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.4 }
    });

    // Room cards: staggered rise per row
    ScrollTrigger.batch('#rooms-grid > article', {
      start: 'top 88%',
      onEnter: batch => gsap.fromTo(batch,
        { y: 58, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.5, ease: 'power3.out', stagger: 0.13, overwrite: true }
      ),
      once: true
    });
  }

  /* ----------------------------------------------------------
     HEADER STATE
     ---------------------------------------------------------- */
  const header = document.getElementById('site-header');
  function onScrollHeader() {
    if (!header) return;
    if (window.scrollY > 90) header.classList.add('is-stuck');
    else header.classList.remove('is-stuck');
  }
  onScrollHeader();
  window.addEventListener('scroll', onScrollHeader, { passive: true });

  /* ----------------------------------------------------------
     MOBILE DRAWER
     ---------------------------------------------------------- */
  const navToggle = document.getElementById('nav-toggle');
  const drawer    = document.getElementById('nav-drawer');
  let drawerOpen  = false;

  function openDrawer() {
    if (!drawer) return;
    drawerOpen = true;
    drawer.classList.add('is-open');
    navToggle && navToggle.setAttribute('aria-expanded', 'true');
    if (lenis) lenis.stop();
    const bars = navToggle ? navToggle.querySelectorAll('span') : [];
    if (bars[0]) bars[0].style.transform = 'translateY(3px) rotate(45deg)';
    if (bars[1]) bars[1].style.transform = 'translateY(-3px) rotate(-45deg)';
  }
  function closeDrawer() {
    if (!drawer || !drawerOpen) return;
    drawerOpen = false;
    drawer.classList.remove('is-open');
    navToggle && navToggle.setAttribute('aria-expanded', 'false');
    if (lenis) lenis.start();
    const bars = navToggle ? navToggle.querySelectorAll('span') : [];
    bars.forEach(b => { b.style.transform = 'none'; });
  }
  navToggle && navToggle.addEventListener('click', () => drawerOpen ? closeDrawer() : openDrawer());

  /* ----------------------------------------------------------
     CURSOR GLOW + MAGNETIC BUTTONS
     ---------------------------------------------------------- */
  if (finePointer && !reduceMotion) {
    const glow = document.getElementById('cursor-glow');
    const dot  = document.getElementById('cursor-dot');

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let gx = mx, gy = my, dx = mx, dy = my;

    window.addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      document.body.classList.add('cursor-active');
    }, { passive: true });

    (function loop() {
      gx += (mx - gx) * 0.085;   // slow, weighty halo
      gy += (my - gy) * 0.085;
      dx += (mx - dx) * 0.22;    // tighter dot
      dy += (my - dy) * 0.22;
      if (glow) glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      if (dot)  dot.style.transform  = `translate3d(${dx}px, ${dy}px, 0)`;
      requestAnimationFrame(loop);
    })();

    document.querySelectorAll('[data-cursor="hover"]').forEach(el => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
    });

    // Magnetic pull on buttons
    document.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        btn.style.transform = `translate(${px * 11}px, ${py * 7}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = 'translate(0,0)'; });
    });
  }

  /* ----------------------------------------------------------
     BUTTON RIPPLE
     ---------------------------------------------------------- */
  document.querySelectorAll('[data-ripple]').forEach(btn => {
    btn.addEventListener('click', e => {
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height);
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = size + 'px';
      span.style.left = (e.clientX - r.left - size / 2) + 'px';
      span.style.top  = (e.clientY - r.top  - size / 2) + 'px';
      btn.appendChild(span);
      setTimeout(() => span.remove(), 780);
    });
  });

  /* ----------------------------------------------------------
     3D TILT CARDS
     ---------------------------------------------------------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('[data-tilt]').forEach(card => {
      const soft = card.hasAttribute('data-tilt-soft');
      const maxDeg = soft ? 3 : 7;

      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transition = 'transform 0.14s linear, box-shadow 0.85s var(--ease-silk)';
        card.style.transform =
          `perspective(1100px) rotateY(${px * maxDeg}deg) rotateX(${-py * maxDeg}deg) translateZ(14px)`;
        card.style.boxShadow = '0 34px 80px -30px rgba(0,0,0,0.72)';
      });

      card.addEventListener('mouseleave', () => {
        card.style.transition = 'transform 0.95s var(--ease-silk), box-shadow 0.95s var(--ease-silk)';
        card.style.transform = 'perspective(1100px) rotateY(0) rotateX(0) translateZ(0)';
        card.style.boxShadow = 'none';
      });
    });
  }

  /* ----------------------------------------------------------
     GLASS PANELS REACTING TO POINTER
     Adds a soft specular highlight that follows the cursor.
     ---------------------------------------------------------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.glass, .glass-light').forEach(panel => {
      panel.addEventListener('mousemove', e => {
        const r = panel.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        panel.style.backgroundImage =
          `radial-gradient(circle at ${x}% ${y}%, rgba(236,234,227,0.07), rgba(236,234,227,0) 58%)`;
      });
      panel.addEventListener('mouseleave', () => { panel.style.backgroundImage = 'none'; });
    });
  }

  /* ----------------------------------------------------------
     LIGHTBOX
     ---------------------------------------------------------- */
  const lightbox = document.getElementById('lightbox');
  const lbImg    = document.getElementById('lb-img');
  const lbClose  = document.getElementById('lb-close');

  function openLightbox(src, alt) {
    if (!lightbox || !lbImg) return;
    lbImg.src = src;
    lbImg.alt = alt || '';
    lightbox.classList.add('is-open');
    if (lenis) lenis.stop();
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('is-open');
    if (lenis) lenis.start();
    setTimeout(() => { if (lbImg && !lightbox.classList.contains('is-open')) lbImg.src = ''; }, 700);
  }

  document.querySelectorAll('[data-lightbox]').forEach(item => {
    item.addEventListener('click', () => {
      const img = item.querySelector('img');
      openLightbox(item.dataset.lightbox, img ? img.alt : '');
    });
  });

  lbClose && lbClose.addEventListener('click', closeLightbox);
  lightbox && lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox();
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeLightbox(); closeDrawer(); }
  });

  /* ----------------------------------------------------------
     MISC
     ---------------------------------------------------------- */
  const yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();

  // Expose environment flags for the WebGL layer
  window.__silverline = { reduceMotion, finePointer, isMobile };

  /* ----------------------------------------------------------
     ATTRACTION CARD FLIP
     Click (desktop) or tap (mobile) flips the card with a
     premium 3D rotation. A second click/tap returns to front.
     The existing hover `attr-detail` reveal is unaffected on
     the front face; it is simply inaccessible when flipped.
     ---------------------------------------------------------- */
  document.querySelectorAll('.attr-card').forEach(card => {
    card.addEventListener('click', function flipCard(e) {
      // If the user clicked an anchor inside the card, don't flip
      if (e.target.closest('a')) return;

      const isFlipped = card.classList.contains('is-flipped');

      // Trigger glare sweep on every flip (in and out)
      card.classList.remove('is-glaring');
      // Force reflow so the animation re-triggers if flipping rapidly
      void card.offsetWidth;
      card.classList.add('is-glaring');
      setTimeout(() => card.classList.remove('is-glaring'), 500);

      if (isFlipped) {
        card.classList.remove('is-flipped');
      } else {
        card.classList.add('is-flipped');
        // Stop Lenis scroll momentarily so the flip feels intentional
        // (re-enables immediately so it's not disruptive)
      }
    });

    // Keyboard accessibility: Enter/Space also flips
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  // Touch hint: swap "Click to return" → "Tap to return" on touch devices
  if (!finePointer) {
    document.querySelectorAll('.attr-back-hint').forEach(el => {
      if (el.textContent.trim() === 'Click to return') {
        el.textContent = 'Tap to return';
      }
    });
  }

  /* ----------------------------------------------------------
     DAY / NIGHT ATMOSPHERE
     Reads visitor's local hour and applies a barely-perceptible
     colour overlay via #day-night-overlay. The three phases
     (day / golden hour / night) map to the resort's existing
     palette so the tint feels native to the design.

     Phase mapping:
       06:00 – 16:59  → day   (transparent — no change)
       17:00 – 19:29  → golden hour (warm amber, ~4% opacity)
       19:30 – 05:59  → night (deep forest cool, ~6% opacity)

     On page load the colour is set immediately (no transition).
     The CSS transition is 120s so live phase changes during a
     session are absolutely imperceptible.
     ---------------------------------------------------------- */
  (function initDayNight() {
    const overlay = document.getElementById('day-night-overlay');
    if (!overlay) return;

    const now  = new Date();
    const hour = now.getHours();
    const min  = now.getMinutes();
    const t    = hour + min / 60; // decimal hour, e.g. 17.5 = 17:30

    let colour;

    if (t >= 6 && t < 17) {
      // Daytime: no overlay — the site looks exactly as designed.
      // A very faint cool-green breath keeps mountain freshness.
      colour = 'rgba(28, 42, 36, 0.0)';
    } else if (t >= 17 && t < 19.5) {
      // Golden hour / early evening: warm amber glow from the
      // resort windows, slightly richer tone.
      // Strength scales from 0 at 17:00 to peak at 18:30 to 0 at 19:30
      const progress = Math.min(1, (t - 17) / 1.5);
      const ease = progress < 0.5
        ? 2 * progress * progress
        : -1 + (4 - 2 * progress) * progress; // smooth in-out
      const alpha = (0.035 * ease).toFixed(4);
      colour = `rgba(200, 155, 80, ${alpha})`;
    } else {
      // Night: 19:30 – 05:59
      // A cool, very dark forest-green tint that deepens the shadows
      // slightly and adds a cosy lamp-lit mood.
      colour = 'rgba(10, 18, 14, 0.055)';
    }

    // Set immediately without the transition (add transition after first paint)
    overlay.style.transition = 'none';
    overlay.style.backgroundColor = colour;

    // Re-enable the slow CSS transition after the initial paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = '';
      });
    });
  })();

})();
