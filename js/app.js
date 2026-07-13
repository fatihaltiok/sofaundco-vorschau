/* ==========================================================================
   Sofa & Co. — Interaktionen (Vanilla JS, keine externen Abhängigkeiten)
   - Hero-Video-Zyklus
   - Reveal-on-Scroll
   - Lightbox (barrierefrei: Tastatur + Fokus-Handling)
   - Ausklappbare Kollektions-Galerien (Akkordeon, inert wenn zu)
   - Vimeo Klick-zum-Laden (DSGVO-konform, idempotent, dnt=1)
   - Hover-Video-Hook (Phase 3, aktuell ohne Videos)
   ========================================================================== */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', function () {
    initHeroVideo();
    initReveal();
    initLightbox();
    initCollectionToggles();
    initCarousels();
    initVimeoClickToLoad();
    initHoverVideo();
  });

  /* ---------- Hero-Video-Zyklus ----------
     Bild ist immer sichtbar. Nach einer Pause blendet das Video ein,
     spielt einmal komplett durch und blendet dann langsam zurück zum Bild.
     Bei prefers-reduced-motion bleibt das Standbild stehen. */
  function initHeroVideo() {
    var video = document.querySelector('[data-hero-video]');
    if (!video) return;

    video.muted = true;
    video.pause();

    // Reduced Motion: keinen automatischen Video-Zyklus starten.
    if (prefersReducedMotion) return;

    var firstDelay = 5000;
    var pauseBetween = 7000;
    var timer = null;

    function playVideo() {
      video.classList.remove('is-fading-out');
      video.classList.add('is-visible');
      try {
        video.currentTime = 0;
      } catch (e) { /* noop */ }
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () { /* Autoplay evtl. blockiert — kein Fehler */ });
      }
    }

    function onEnded() {
      video.classList.add('is-fading-out');
      video.classList.remove('is-visible');
      timer = setTimeout(playVideo, pauseBetween);
    }

    video.addEventListener('ended', onEnded);
    timer = setTimeout(playVideo, firstDelay);
  }

  /* ---------- Reveal-on-Scroll ---------- */
  function initReveal() {
    var els = document.querySelectorAll('.reveal, .reveal-media');
    if (!els.length) return;

    if (!('IntersectionObserver' in window) || prefersReducedMotion) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.style.transitionDelay = (el.__revDelay || 0) + 'ms';
        el.classList.add('is-visible');
        io.unobserve(el);
      });
    }, { threshold: 0, rootMargin: '0px 0px -4% 0px' });

    var groups = {};
    els.forEach(function (el) {
      var group = el.closest('[data-reveal-group]');
      var key = group ? group.dataset.revealGroup : 'default';
      groups[key] = groups[key] || 0;
      var i = groups[key]++;
      var stagger = el.classList.contains('reveal-media') ? 160 : 120;
      el.__revDelay = (i % 3) * stagger;
      io.observe(el);
    });
  }

  /* ---------- Lightbox (Tastatur- + Fokus-fähig) ---------- */
  function initLightbox() {
    var lightbox = document.querySelector('[data-lightbox]');
    if (!lightbox) return;
    var img = lightbox.querySelector('[data-lightbox-img]');
    if (!img) return; // ohne Bild-Element sauber abbrechen
    var closeBtn = lightbox.querySelector('[data-lightbox-close]');
    var lastTrigger = null;

    // Produktbilder per Tastatur aktivierbar machen (progressive enhancement).
    document.querySelectorAll('.product-media img').forEach(function (el) {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
    });

    function open(trigger) {
      var src = trigger.getAttribute('src');
      if (!src) return;
      lastTrigger = trigger;
      img.setAttribute('src', src);
      img.setAttribute('alt', trigger.getAttribute('alt') || 'Produktansicht in voller Größe');
      lightbox.classList.add('is-open');
      lightbox.setAttribute('role', 'dialog');
      lightbox.setAttribute('aria-modal', 'true');
      if (closeBtn) closeBtn.focus();
    }

    function close() {
      if (!lightbox.classList.contains('is-open')) return;
      lightbox.classList.remove('is-open');
      lightbox.removeAttribute('role');
      lightbox.removeAttribute('aria-modal');
      img.setAttribute('src', '');
      if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
      lastTrigger = null;
    }

    // Klick: Produktbild öffnet, Klick auf Overlay/Schließen schließt.
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('.product-media img');
      if (trigger) { open(trigger); return; }
      if (e.target.closest('[data-lightbox]') && !e.target.closest('[data-lightbox-img]')) {
        close();
      }
    });

    // Tastatur: Enter/Space auf Produktbild öffnet; Escape schließt.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        var trigger = e.target.closest && e.target.closest('.product-media img');
        if (trigger) { e.preventDefault(); open(trigger); }
      }
    });
  }

  /* ---------- Ausklappbare Kollektions-Galerien ----------
     Panel ist initial per [inert] aus Tab-/Screenreader-Fluss genommen;
     beim Öffnen wird inert/aria-hidden entfernt, die Höhen-Animation bleibt. */
  function initCollectionToggles() {
    var toggles = document.querySelectorAll('[data-collection-toggle]');
    toggles.forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      var countEl = btn.querySelector('[data-collection-count]');
      var openLabel = btn.dataset.labelOpen || 'Ausblenden';
      // Fällt kein data-label-closed zurück, initialen Text merken und
      // beim Schließen wiederherstellen (statt ihn mit '' zu überschreiben).
      var closedLabel = btn.dataset.labelClosed ||
        (countEl ? countEl.textContent : '');

      btn.addEventListener('click', function () {
        var isOpen = btn.classList.toggle('is-open');
        panel.classList.toggle('is-open', isOpen);
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) {
          panel.removeAttribute('inert');
          panel.removeAttribute('aria-hidden');
        } else {
          panel.setAttribute('inert', '');
          panel.setAttribute('aria-hidden', 'true');
        }
        if (countEl) countEl.textContent = isOpen ? openLabel : closedLabel;
      });
    });
  }

  /* ---------- Vimeo Klick-zum-Laden (DSGVO-konform) ---------- */
  function initVimeoClickToLoad() {
    var embeds = document.querySelectorAll('[data-vimeo]');
    embeds.forEach(function (embed) {
      var poster = embed.querySelector('[data-vimeo-poster]');
      if (!poster) return;
      // once: nach dem ersten Laden ist der Poster weg -> kein erneutes Laden.
      poster.addEventListener('click', function () { loadVimeo(embed); }, { once: true });
    });
  }

  function loadVimeo(embed) {
    if (embed.getAttribute('data-loaded') === 'true') return; // idempotent
    var id = embed.getAttribute('data-vimeo');
    if (!id || !/^\d+$/.test(id)) return; // nur numerische Vimeo-IDs
    var hash = embed.getAttribute('data-vimeo-hash');
    var title = embed.getAttribute('data-vimeo-title') || 'Vimeo-Video';
    var wrap = embed.querySelector('[data-vimeo-frame-wrap]');
    if (!wrap) return;

    var params = new URLSearchParams({ autoplay: '1', loop: '1', muted: '1', dnt: '1' });
    if (hash) params.set('h', hash);

    var iframe = document.createElement('iframe');
    iframe.setAttribute('title', title);
    iframe.setAttribute('src', 'https://player.vimeo.com/video/' + id + '?' + params.toString());
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('frameborder', '0');
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';

    var poster = embed.querySelector('[data-vimeo-poster]');
    if (poster && poster.parentNode) poster.parentNode.removeChild(poster);

    wrap.innerHTML = '';
    wrap.appendChild(iframe);
    embed.setAttribute('data-loaded', 'true');
  }

  /* ---------- Hover-Video-Hook (Phase 3 — Mechanik ohne Videos) ----------
     Figures mit ausgefülltem data-hover-video zeigen bei Maus-Hover ein
     gemutetes, loopendes Video über dem Foto. Aktuell sind alle
     data-hover-video-Attribute leer, daher passiert nichts.
     Hinweis Phase 3: Bei sehr vielen aktiven Kacheln ggf. erzeugte
     <video>-Elemente bei mouseleave wieder entfernen (Speicher). */
  function initHoverVideo() {
    if (prefersReducedMotion) return; // Reduced Motion: keine Hover-Videos
    var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!canHover) return;

    var figures = document.querySelectorAll('[data-hover-video]');
    figures.forEach(function (fig) {
      var src = fig.getAttribute('data-hover-video');
      if (!src) return; // kein Video hinterlegt -> keine Aktion

      var video = null;
      var rafId = null;

      fig.addEventListener('mouseenter', function () {
        if (!video) {
          video = document.createElement('video');
          video.className = 'product-media__hover-video';
          video.src = src;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          fig.appendChild(video);
        }
        video.currentTime = 0;
        var p = video.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
        rafId = requestAnimationFrame(function () {
          rafId = null;
          video.classList.add('is-active');
        });
      });

      fig.addEventListener('mouseleave', function () {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (!video) return;
        video.classList.remove('is-active');
        video.pause();
      });
    });
  }

  /* ---------- Karussells (seitlich wischbare Bildbänder) ----------
     Horizontale Bildbahnen mit Pfeil-Navigation: prev/next-Buttons
     scrollen den Track um ~85% der sichtbaren Breite; an den Rändern
     wird der jeweilige Button über updateNav ausgeblendet.
     Track fehlt -> Carousel wird übersprungen; fehlt ein Button, läuft
     nur die andere Richtung (updateNav bleibt sicher). */
  function initCarousels() {
    var behavior = prefersReducedMotion ? 'auto' : 'smooth';

    document.querySelectorAll('[data-carousel]').forEach(function (carousel) {
      var track = carousel.querySelector('[data-carousel-track]');
      if (!track) return;
      var prev = carousel.querySelector('[data-carousel-prev]');
      var next = carousel.querySelector('[data-carousel-next]');

      function updateNav() {
        if (prev) prev.hidden = track.scrollLeft <= 2;
        if (next) next.hidden = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
      }

      if (prev) {
        prev.addEventListener('click', function () {
          track.scrollBy({ left: -Math.round(track.clientWidth * 0.85), behavior: behavior });
        });
      }
      if (next) {
        next.addEventListener('click', function () {
          track.scrollBy({ left: Math.round(track.clientWidth * 0.85), behavior: behavior });
        });
      }

      track.addEventListener('scroll', updateNav, { passive: true });
      window.addEventListener('resize', updateNav);
      updateNav();
    });
  }
})();
