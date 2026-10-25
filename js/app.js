/* ==========================================================================
   Sofa & Co. — Interaktionen (Vanilla JS, keine externen Abhängigkeiten)
   - Hero-Video-Zyklus
   - Reveal-on-Scroll
   - Lightbox (barrierefrei: Tastatur + Fokus-Handling)
   - Ausklappbare Kollektions-Galerien (Akkordeon, inert wenn zu)
   - Hover-Video-Hook (Phase 3, aktuell ohne Videos)
   ========================================================================== */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', function () {
    initMobileNav();
    initHeroVideo();
    initReveal();
    initLightbox();
    initCollectionToggles();
    initCarousels();
    initBrandbandMobil();
    initHoverVideo();
    initAmbientVideos();
    initToOverview();
    initMusik();
  });

  /* ---------- E-079/E-080 Musik ----------
     Knopf am Startvideo. Seit E-080 startet die Musik mit dem Aufruf, so weit der Browser
     es zulässt, sonst bei der ersten Bedienung irgendwo. Lautstärke und Blenden laufen über
     die Web Audio API (GainNode), weil iOS-Safari audio.volume ignoriert. Gespeichert wird
     nur das Abschalten, und nur für den Tab (sessionStorage). Prüfschalter ?ohne-musik
     schaltet alles ab. */
  function initMusik() {
    if (/[?&]ohne-musik\b/.test(window.location.search)) return;
    var knopf = document.querySelector('[data-musik-knopf]');
    var schwebend = document.querySelector('[data-musik-knopf-schwebend]');
    var hero = document.querySelector('.hero');
    if (!knopf) return;
    var musikBlock = knopf.closest('.hero__musik');
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { if (musikBlock) musikBlock.hidden = true; if (schwebend) schwebend.hidden = true; return; }

    var SRC = 'assets/audio/sofa-musik.mp3';
    var ZIEL = 0.35, EIN = 2, AUS = 1;
    var ctx = null, gain = null, audio = null;
    var will = true;        // Wunsch „Musik an“ (E-080: standardmäßig an, bis der Besucher sie in diesem Tab ausschaltet)
    var geste = null;       // Handler für die erste Bedienung, solange der Browser den Ton noch sperrt
    var spielt = false;     // Ton läuft tatsächlich (oder blendet gerade ein)
    var stopTimer = null;
    var text = knopf.querySelector('[data-musik-text]');
    var kopfleiste = document.querySelector('.header');
    var MERK = 'sofa-musik-aus';

    // Merken nur für diesen Tab (sessionStorage); jeder Zugriff gesichert, kein localStorage, keine Cookies.
    function leseAus() {
      try { return window.sessionStorage.getItem(MERK) === '1'; } catch (e) { return false; }
    }
    function schreibeAus(aus) {
      try {
        if (aus) window.sessionStorage.setItem(MERK, '1');
        else window.sessionStorage.removeItem(MERK);
      } catch (e) { /* gesperrt: verhält sich wie „nicht ausgeschaltet“ */ }
    }

    function tonFilm() {
      var v = document.querySelectorAll('video');
      for (var i = 0; i < v.length; i++) {
        if (!v[i].paused && !v[i].ended && !v[i].muted && v[i].volume > 0) return true;
      }
      return false;
    }

    function zeigeZustand() {
      [knopf, schwebend].forEach(function (b) {
        if (!b) return;
        b.setAttribute('aria-pressed', will ? 'true' : 'false');
        b.setAttribute('aria-label', will ? 'Musik ausschalten' : 'Musik einschalten');
      });
      if (text) text.textContent = will ? 'Musik aus' : 'Musik an';
      zeigeSchwebend();
    }

    function zeigeSchwebend() {
      if (!schwebend || !hero) return;
      // sichtbar, sobald der obere Knopf hinter der festen Kopfleiste aus dem Bild ist
      var ref = (musikBlock || hero).getBoundingClientRect();
      var sichtbar = will && ref.bottom < (kopfleiste ? kopfleiste.offsetHeight : 0);
      schwebend.classList.toggle('is-visible', sichtbar);
      if (sichtbar) {
        schwebend.removeAttribute('aria-hidden');
        schwebend.removeAttribute('tabindex');
      } else {
        schwebend.setAttribute('aria-hidden', 'true');
        schwebend.setAttribute('tabindex', '-1');
        if (document.activeElement === schwebend) knopf.focus();
      }
    }

    function rampe(ziel, dauer) {
      var t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(ziel, t + dauer);
    }

    function starte() {
      clearTimeout(stopTimer);
      if (spielt) { rampe(ZIEL, EIN); return Promise.resolve(); }
      spielt = true;
      if (ctx.state !== 'running') ctx.resume();
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      var p = audio.play();
      return Promise.resolve(p).then(function () {
        if (spielt) rampe(ZIEL, EIN);
      });
    }

    function stoppe(dauer) {
      if (!spielt) return;
      spielt = false;
      rampe(0, dauer);
      clearTimeout(stopTimer);
      stopTimer = setTimeout(function () {
        if (!spielt && audio) audio.pause();
      }, dauer * 1000 + 80);
    }

    function abgleich() {
      var soll = will && !tonFilm() && !document.hidden;
      if (!audio) return;
      if (soll && !spielt) {
        starte().catch(fehler);
      } else if (!soll && spielt) {
        stoppe(AUS);
      }
    }

    function fehler(e) {
      console.log('[musik] Start fehlgeschlagen:', e && e.message ? e.message : e);
      spielt = false;
      var name = e && e.name;
      if (name === 'NotAllowedError') {
        // Browser sperrt Ton bis zur ersten Bedienung: Wunsch bleibt, Start bei der nächsten Geste
        if (will) wartenAufGeste();
      } else if (name !== 'AbortError') {
        // AbortError = unser eigenes pause() hat play() abgebrochen: Nutzerwunsch bleibt
        will = false;
        gesteEntfernen();
      }
      zeigeZustand();
    }

    var GESTEN = ['pointerdown', 'touchend', 'click', 'keydown'];
    function wartenAufGeste() {
      if (geste) return;
      geste = function (e) {
        var t = e.target;
        // Erste Bedienung ist der Musik-Knopf selbst: nicht starten, der Klick schaltet um (→ aus).
        if (t && t.closest && t.closest('[data-musik-knopf], [data-musik-knopf-schwebend]')) return;   // Handler bleibt: wird aus der Berührung kein click (Scrollen), startet die nächste Bedienung
        if (!will || !audio) { gesteEntfernen(); return; }
        if (document.hidden) return;
        if (tonFilm()) {   // Film mit Ton: nur den Context freischalten, abgleich() startet später
          try { ctx.resume(); } catch (x) {}
          gesteEntfernen();
          return;
        }
        // synchron im Handler: resume() + play() (Gesten-Pfad, iPhone)
        starte().then(gesteEntfernen).catch(fehler);
      };
      GESTEN.forEach(function (ev) { document.addEventListener(ev, geste, { capture: true, passive: true }); });
    }
    function gesteEntfernen() {
      if (!geste) return;
      var h = geste;
      geste = null;
      GESTEN.forEach(function (ev) { document.removeEventListener(ev, h, { capture: true }); });
    }

    // Startversuch beim Laden, ohne Bedienung. Gelingt er nicht, wartet der Wunsch auf die erste Geste.
    function autostart() {
      try { bauen(); } catch (e) { fehler(e); return; }
      if (tonFilm() || document.hidden) { wartenAufGeste(); return; }
      spielt = true;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      var p = audio.play();
      var r = ctx.resume();
      var frist = new Promise(function (ok) { setTimeout(ok, 700); });
      Promise.all([p, Promise.race([Promise.resolve(r), frist])]).then(function () {
        if (!will || !spielt) return;
        if (ctx.state !== 'running') {
          spielt = false;
          audio.pause();
          wartenAufGeste();
          return;
        }
        rampe(ZIEL, EIN);
      }).catch(fehler);
    }

    function bauen() {
      // iPhone/iPad: ohne „playback“ bleibt Web-Audio-Ton bei eingeschaltetem Lautlos-Schalter stumm (Safari ab 16.4)
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) {} }
      ctx = new AC();
      audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      audio.src = SRC;
      gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(audio).connect(gain);
      gain.connect(ctx.destination);
      if (/[?&]pruef-musik\b/.test(window.location.search)) window.__musikGain = gain;
      // Systemunterbrechung (z. B. iOS-Anruf): Zustand richtigstellen
      audio.addEventListener('pause', function () { if (spielt) spielt = false; });
      audio.addEventListener('error', function () { fehler(audio.error || new Error('audio error')); });
      ctx.onstatechange = function () {
        if (ctx.state === 'running') abgleich();
      };
      audio.addEventListener('ended', function () {
        // Sicherheitsnetz, falls loop ausfällt
        if (will && spielt) { audio.currentTime = 0; audio.play().catch(fehler); }
      });
    }

    function umschalten() {
      if (!will) {
        try {
          if (!audio) bauen();
        } catch (e) { fehler(e); return; }
        will = true;
        schreibeAus(false);
        zeigeZustand();
        if (tonFilm() || document.hidden) return;
        starte().catch(fehler);
      } else {
        will = false;
        schreibeAus(true);
        gesteEntfernen();
        zeigeZustand();
        stoppe(AUS);
      }
    }

    knopf.addEventListener('click', umschalten);
    if (schwebend) schwebend.addEventListener('click', umschalten);

    ['play', 'pause', 'ended', 'volumechange'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        if (e.target && e.target.tagName === 'VIDEO') abgleich();
      }, true);
    });
    document.addEventListener('visibilitychange', abgleich);

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; zeigeSchwebend(); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    will = !leseAus();
    zeigeZustand();
    if (will) autostart();
  }

  /* ---------- Mobile Navigation ---------- */
  function initMobileNav() {
    var header = document.querySelector('.header');
    if (!header) return;
    var toggle = header.querySelector('.nav-toggle');
    var nav = header.querySelector('#site-nav');
    if (!toggle || !nav) return;

    function setOpen(isOpen) {
      header.classList.toggle('is-open', isOpen);
      nav.classList.toggle('is-open', isOpen);
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggle.setAttribute('aria-label', isOpen ? 'Menü schließen' : 'Menü öffnen');
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { setOpen(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
      setOpen(false);
      toggle.focus();
    });

    document.addEventListener('click', function (e) {
      if (toggle.getAttribute('aria-expanded') !== 'true' || header.contains(e.target)) return;
      setOpen(false);
    });
  }

  /* ---------- Hero-Video-Zyklus ----------
     Kurz nach dem Laden blendet das Video ein. Während des ersten Durchlaufs ist
     der "Sofa & Co"-Schriftzug ausgeblendet; danach erscheint er und das Video
     läuft in Dauerschleife weiter (E-069).
     Bei prefers-reduced-motion bleibt das Standbild mit Schriftzug von Anfang an. */
  function initHeroVideo() {
    var video = document.querySelector('[data-hero-video]');
    if (!video) return;
    var content = document.querySelector('.hero__content');

    // Handys (< 600 px) bekommen die Hochkant-Fassung (9:16) des Hero-Videos,
    // alles ab 600 px die 16:9-Fassung (E-048). Die Wahl wird beim Drehen des
    // Geräts neu getroffen — vorher lief quer weiter die Hochkant-Fassung
    // (Andrea 27.09.: „Es wirk sehr abgeschnitten“). Gleiche Grenze wie das
    // <source media> des Standbilds in index.html.
    var mobilSrc = video.getAttribute('data-src-mobil');
    var desktopSrc = video.getAttribute('src');
    var handy = window.matchMedia('(max-width: 599px)');
    function passendeQuelle() {
      return (mobilSrc && handy.matches) ? mobilSrc : desktopSrc;
    }
    function setzeQuelle() {
      var soll = passendeQuelle();
      if (video.getAttribute('src') === soll) return;
      var zeit = video.currentTime;
      var lief = !video.paused && !video.ended;
      video.setAttribute('src', soll);
      video.load();
      if (lief) {
        video.addEventListener('loadedmetadata', function weiter() {
          video.removeEventListener('loadedmetadata', weiter);
          try { video.currentTime = zeit; } catch (e) { /* noop */ }
          var p = video.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        });
      }
    }
    setzeQuelle();
    if (handy.addEventListener) handy.addEventListener('change', setzeQuelle);
    else if (handy.addListener) handy.addListener(setzeQuelle);

    video.muted = true;
    video.loop = false;
    video.pause();

    // E-062: In der Nahen hebt die Frau die VR-Brille über den Kopf. Auf dem Rechner
    // beschneidet object-fit:cover oben ~170 Videopixel — Kopf und Brille waren weg
    // (Fatih 03.10.). Nur in diesem Abschnitt (data-ausschnitt="von-bis:Position",
    // Sekunden) wird der Ausschnitt nach unten geschoben; die Grenzen liegen auf harten
    // Schnitten, das Umschalten fällt nicht auf. Bildgenau per requestVideoFrameCallback,
    // sonst über timeupdate. Handy-Fassung: data-ausschnitt-mobil (gleiche Zeiten).
    var ausschnitt = (video.getAttribute('data-ausschnitt') || '').match(/^([\d.]+)-([\d.]+):(.+)$/);
    if (ausschnitt) {
      var abT = parseFloat(ausschnitt[1]), bisT = parseFloat(ausschnitt[2]), ausPos = ausschnitt[3];
      // Handy-Fassung (Hochkant, gleicher Schnitt): eigene Position aus data-ausschnitt-mobil.
      var ausPosMobil = video.getAttribute('data-ausschnitt-mobil');
      var ausAktiv = '';
      var pruefeAusschnitt = function (t) {
        var src = video.getAttribute('src');
        var pos = src === desktopSrc ? ausPos : (src === mobilSrc && ausPosMobil ? ausPosMobil : '');
        var soll = (t >= abT && t < bisT) ? pos : '';
        if (soll !== ausAktiv) { ausAktiv = soll; video.style.objectPosition = soll; }
      };
      if ('requestVideoFrameCallback' in video) {
        var proBild = function (jetzt, meta) {
          pruefeAusschnitt(meta.mediaTime);
          video.requestVideoFrameCallback(proBild);
        };
        video.requestVideoFrameCallback(proBild);
      } else {
        video.addEventListener('timeupdate', function () { pruefeAusschnitt(video.currentTime); });
      }
      video.addEventListener('seeked', function () { pruefeAusschnitt(video.currentTime); });
      video.addEventListener('ended', function () { pruefeAusschnitt(Infinity); });
    }

    // Reduced Motion: keinen Video-Zyklus starten, Schriftzug bleibt sichtbar.
    if (prefersReducedMotion) return;

    // Vor dem ersten Durchlauf den Schriftzug ausblenden.
    if (content) content.classList.add('is-hidden');

    var firstDelay = 1200;

    // E-075: Wiederanlauf. Andrea (iPhone): „das die dauerschleife manchmal stopp“.
    // iOS hält das Video selbst an (aus dem Bild gescrollt, App-Wechsel, Sperre,
    // Stromsparmodus) und startet es nicht neu. Wir starten es nur dann wieder,
    // wenn der Zyklus lief, das Video pausiert ist, die Seite sichtbar ist und das
    // Video im Bild steht. Unser Code pausiert sonst nirgends absichtlich.
    var zyklusGestartet = false;
    var imBild = true;
    var beruehrungWartet = false;

    function beruehrungsStart() {
      document.removeEventListener('touchend', beruehrungsStart);
      document.removeEventListener('click', beruehrungsStart);
      beruehrungWartet = false;
      wiederanlauf();
    }
    function wiederanlauf() {
      if (!zyklusGestartet || !video.paused || document.hidden || !imBild) return;
      var p = video.play();
      if (p && typeof p.then === 'function') {
        p.then(function () {
          if (!video.classList.contains('is-visible')) video.classList.add('is-visible');
        }).catch(function () {
          // Abgelehnt (z. B. Stromsparmodus): einmal auf die nächste Berührung warten.
          if (beruehrungWartet) return;
          beruehrungWartet = true;
          document.addEventListener('touchend', beruehrungsStart, { once: true, passive: true });
          document.addEventListener('click', beruehrungsStart, { once: true, passive: true });
        });
      }
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        imBild = entries[entries.length - 1].isIntersecting;
        if (imBild) wiederanlauf();
      }, { threshold: 0 }).observe(video);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) wiederanlauf();
    });
    window.addEventListener('pageshow', wiederanlauf);
    video.addEventListener('pause', function () { setTimeout(wiederanlauf, 400); });

    function playVideo() {
      zyklusGestartet = true;
      video.classList.remove('is-fading-out');
      video.classList.add('is-visible');
      if (content) content.classList.add('is-hidden');
      try {
        video.currentTime = 0;
      } catch (e) { /* noop */ }
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {
          // Autoplay evtl. blockiert: Standbild + Schriftzug direkt zeigen.
          video.classList.remove('is-visible');
          if (content) content.classList.remove('is-hidden');
          // E-075: z. B. Stromsparmodus — bei der nächsten Berührung nochmal versuchen.
          wiederanlauf();
        });
      }
    }

    // E-069: Dauerschleife. Das Video endet mit einer weichen Rückblende in sein
    // erstes Bild (Skizze), daher ist der Neustart unsichtbar. Nach dem ersten
    // Durchlauf blendet der Schriftzug ein und bleibt; das Video läuft darunter weiter.
    function onEnded() {
      if (content) content.classList.remove('is-hidden');
      video.loop = true;
      try { video.currentTime = 0; } catch (e) { /* noop */ }
      var p = video.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }

    video.addEventListener('ended', onEnded);
    setTimeout(playVideo, firstDelay);
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
          fig.classList.add('is-playing');
        });
      });

      fig.addEventListener('mouseleave', function () {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (!video) return;
        video.classList.remove('is-active');
        fig.classList.remove('is-playing');
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
  /* Ambient-Videos laden erst, wenn ihre Sektion in Sichtweite scrollt —
     data-src wird dann zu src, danach Autoplay im Loop. Erfasst werden die
     Klima-Stimmung (.klima-ambient) und die Ausziehvideos der Schlafsofa-
     Sektionen (.feature-video, Auftrag S2) — eine Logik für beide.
     Bei prefers-reduced-motion läuft nichts von selbst: Das Video bekommt
     controls, und die Quelle wird erst beim ersten Klick nachgeladen. */
  function initAmbientVideos() {
    var videos = document.querySelectorAll(
      '.klima-ambient video[data-src], .feature-video video[data-src]');
    if (!videos.length) return;
    if (!('IntersectionObserver' in window)) return;
    if (prefersReducedMotion) {
      videos.forEach(function (video) {
        video.controls = true;
        var nachladen = function () {
          if (!video.src) {
            video.src = video.getAttribute('data-src');
            video.load();
            video.play().catch(function () {});
          }
          video.removeEventListener('click', nachladen);
        };
        video.addEventListener('click', nachladen);
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target;
        if (entry.isIntersecting) {
          if (!video.src) {
            video.src = video.getAttribute('data-src');
            video.load();
          }
          video.play().catch(function () {});
        } else if (video.src) {
          video.pause();
        }
      });
    }, { rootMargin: '300px 0px' });
    videos.forEach(function (v) { io.observe(v); });
  }

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

  /* ---------- E-068: Bilderband unter dem Startvideo auf dem Handy (< 600 px) ----------
     Kein Laufband: wischbar, rastet auf ganzen Kacheln ein (CSS), Pfeil rückt eine Kachel weiter,
     alle 3,5 s rückt es selbst eine Kachel weiter (am Ende zurück zum Anfang). Pause bei Berührung
     und 10 s danach; mit „weniger Bewegung“ kein Selbst-Weiterrücken. Ab 600 px passiert hier nichts. */
  function initBrandbandMobil() {
    var band = document.querySelector('.brandband');
    var track = band && band.querySelector('.brandband__track');
    var next = band && band.querySelector('[data-brandband-next]');
    if (!track) return;
    var mq = window.matchMedia('(max-width: 599px)');
    var pauseUntil = 0;

    function step() {
      var t = track.querySelectorAll('.brandband__tile');
      return t.length > 1 ? t[1].offsetLeft - t[0].offsetLeft : track.clientWidth / 3;
    }
    function amEnde() { return track.scrollLeft >= track.scrollWidth - track.clientWidth - 2; }
    function updateNav() {
      if (next) next.hidden = !mq.matches || amEnde();
    }
    function pause(ms) { pauseUntil = Date.now() + ms; }

    if (next) {
      next.addEventListener('click', function () {
        pause(10000);
        track.scrollBy({ left: step(), behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      });
    }
    track.addEventListener('scroll', updateNav, { passive: true });
    window.addEventListener('resize', updateNav);
    track.addEventListener('touchstart', function () { pause(1e9); }, { passive: true });
    track.addEventListener('touchend', function () { pause(10000); }, { passive: true });
    track.addEventListener('touchcancel', function () { pause(10000); }, { passive: true });
    updateNav();

    if (prefersReducedMotion) return;
    setInterval(function () {
      if (!mq.matches || Date.now() < pauseUntil || document.hidden) return;
      var r = band.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      if (amEnde()) track.scrollTo({ left: 0, behavior: 'smooth' });
      else track.scrollBy({ left: step(), behavior: 'smooth' });
    }, 3500);
  }

  /* ---------- Knopf „Zur Übersicht" (E-028, R4-1) ----------
     Sichtbar erst, wenn man die Kacheln (#kollektion) nach unten verlassen
     hat — genau dann, wenn deren Unterkante oben aus dem Bild gescrollt ist.
     Zurück bei den Kacheln verschwindet er wieder. Der Sprung selbst läuft
     über den normalen Anker (scroll-behavior: smooth + scroll-margin-top im
     CSS), damit er auch ohne JavaScript funktioniert. */
  function initToOverview() {
    var btn = document.querySelector('[data-to-overview]');
    var kollektion = document.getElementById('kollektion');
    if (!btn || !kollektion) return;

    var ticking = false;

    function update() {
      ticking = false;
      var sichtbar = kollektion.getBoundingClientRect().bottom < 0;
      btn.classList.toggle('is-visible', sichtbar);
      // Ein unsichtbarer Knopf darf weder per Tab noch für den
      // Screenreader erreichbar sein.
      if (sichtbar) {
        btn.removeAttribute('aria-hidden');
        btn.removeAttribute('tabindex');
      } else {
        btn.setAttribute('aria-hidden', 'true');
        btn.setAttribute('tabindex', '-1');
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }
})();
