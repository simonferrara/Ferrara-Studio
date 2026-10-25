/* Desert Design Dreamscapes — interactions (GSAP + ScrollTrigger + Lenis) */
(() => {
  const root = document.documentElement;
  root.classList.add('js');

  // Always open on the first frame of the film, not mid-scroll from a previous visit.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DDD = (window.DDD = { reduced });

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp01 = v => Math.min(1, Math.max(0, v));

  /* ---------- loader ---------- */
  const loader = $('#loader');
  const loaderBar = $('#loaderBar');
  let loaderDone = false;
  const hideLoader = () => {
    if (loaderDone) return;
    loaderDone = true;
    loader.classList.add('is-done');
    setTimeout(() => loader.remove(), 900); // don't depend on the fade finishing
    introFilm();
  };
  setTimeout(hideLoader, 2600); // never block the page for long

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    DDD.lenis = lenis;
  }
  gsap.registerPlugin(ScrollTrigger);
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const navH = () => parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 70;
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      const target = id === '#top' ? document.body : $(id);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      if (lenis) lenis.scrollTo(target, { offset: id === '#top' ? 0 : -navH() + 1 });
      else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  /* ---------- nav + mobile menu + dock ---------- */
  const nav = $('#nav');
  const dock = $('#dock');
  let lastY = 0;
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.add('is-solid'); // the film opens on a white model, so the bar stays solid
    nav.classList.toggle('is-hidden', y > innerHeight * 1.5 && y > lastY && !menuOpen);
    dock.classList.toggle('is-visible', y > innerHeight * 0.7);
    lastY = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const burger = $('#burger');
  const menu = $('#menu');
  let menuOpen = false;
  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    menu.hidden = true;
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    lenis && lenis.start();
  }
  burger.addEventListener('click', () => {
    if (menuOpen) return closeMenu();
    menuOpen = true;
    menu.hidden = false;
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
    lenis && lenis.stop();
    gsap.from('#menu nav a', { y: 30, opacity: 0, stagger: 0.05, duration: 0.6, ease: 'power3.out' });
  });
  addEventListener('keydown', e => e.key === 'Escape' && closeMenu());

  /* ---------- film ----------
     Frames are plain <img> objects, pre-decoded with img.decode() (off the main thread in Safari
     and Chrome) and drawn straight to the canvas. Downloads go coarse-to-fine first, then follow
     the playhead, so whatever the user scrolls to arrives next. Neighbours are cross-faded. */
  class Film {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.count = +canvas.dataset.count;
      // Phones get the vertical cut, larger screens the wide one.
      this.size = matchMedia('(min-width: 900px)').matches ? 'lg' : 'sm';
      this.frames = new Array(this.count); // HTMLImageElement once requested
      this.ready = new Uint8Array(this.count); // 1 = decoded and drawable
      this.pos = 0;      // fractional frame index
      this.painted = -1;
      this.loading = false;
      this.inflight = 0;
      this.raf = 0;
      this.resize();
    }
    src(i) { return `assets/film/${this.size}/${String(i + 1).padStart(3, '0')}.webp`; }
    resize() {
      // Never render the canvas far above the frames' own resolution: no extra sharpness,
      // only extra pixels for Safari to push on every scroll step.
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const maxW = this.size === 'lg' ? 1920 : 1080;
      const k = Math.min(dpr, maxW / Math.max(1, this.canvas.clientWidth));
      this.canvas.width = Math.round(this.canvas.clientWidth * k);
      this.canvas.height = Math.round(this.canvas.clientHeight * k);
      this.painted = -1;
      this.schedule();
    }
    load(i) {
      if (this.frames[i]) return Promise.resolve();
      const img = new Image();
      img.decoding = 'async';
      this.frames[i] = img;
      this.inflight++;
      return new Promise(res => {
        const done = ok => {
          this.inflight--;
          if (ok) {
            this.ready[i] = 1;
            if (Math.abs(i - this.pos) < 25) { this.painted = -1; this.schedule(); }
          }
          res();
        };
        img.onload = () => (img.decode ? img.decode().then(() => done(true), () => done(true)) : done(true));
        img.onerror = () => done(false);
        img.src = this.src(i);
      });
    }
    first() { return this.load(0).then(() => this.schedule()); }
    // Next frame to fetch: the coarse skeleton first, then whatever sits just ahead of the playhead.
    pick() {
      while (this.coarse.length) { const i = this.coarse.shift(); if (!this.frames[i]) return i; }
      const c = Math.round(this.pos);
      for (let d = 0; d < this.count; d++) {
        const ahead = c + d, behind = c - Math.ceil(d / 3);
        if (ahead < this.count && !this.frames[ahead]) return ahead;
        if (behind >= 0 && !this.frames[behind]) return behind;
      }
      return -1;
    }
    loadAll() {
      if (this.loading) return;
      this.loading = true;
      this.coarse = [];
      for (let i = 0; i < this.count; i += 12) this.coarse.push(i);
      const worker = () => {
        const i = this.pick();
        if (i < 0) return;
        this.load(i).then(worker);
      };
      for (let k = 0; k < 6; k++) worker();
    }
    nearest(i) {
      if (this.ready[i]) return i;
      for (let d = 1; d < this.count; d++) {
        if (i - d >= 0 && this.ready[i - d]) return i - d;
        if (i + d < this.count && this.ready[i + d]) return i + d;
      }
      return -1;
    }
    schedule() {
      if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
    }
    cover(img, alpha) {
      const { width: cw, height: ch } = this.canvas;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const s = Math.max(cw / iw, ch / ih);
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(img, (cw - iw * s) / 2, (ch - ih * s) / 2, iw * s, ih * s);
    }
    // Closest drawable frames at or before / at or after i (within a short reach).
    bracket(i) {
      let lo = -1, hi = -1;
      for (let d = 0; d <= 24 && (lo < 0 || hi < 0); d++) {
        if (lo < 0 && i - d >= 0 && this.ready[i - d]) lo = i - d;
        if (hi < 0 && i + d < this.count && this.ready[i + d]) hi = i + d;
      }
      return [lo, hi];
    }
    paint() {
      if (Math.abs(this.pos - this.painted) < 0.01) return;
      // Blend the drawable frames around the playhead: adjacent frames give smooth motion,
      // and frames still downloading become a short dissolve instead of a jump.
      let [lo, hi] = this.bracket(Math.floor(this.pos));
      if (hi >= 0 && hi < this.pos) hi = this.bracket(Math.ceil(this.pos))[1];
      if (lo < 0 && hi < 0) {
        const n = this.nearest(Math.floor(this.pos));
        if (n < 0) return;
        lo = hi = n;
      }
      if (lo < 0) lo = hi;
      if (hi < 0) hi = lo;
      const a = hi > lo ? (this.pos - lo) / (hi - lo) : 0;
      this.cover(this.frames[lo], 1);
      if (a > 0.02) this.cover(this.frames[hi], Math.min(1, a));
      this.ctx.globalAlpha = 1;
      this.shown = a > 0.5 ? hi : lo;
      this.gap = hi - lo;
      const exact = lo === Math.floor(this.pos) && (a <= 0.02 || hi === lo + 1);
      this.painted = exact ? this.pos : -1;
    }
    progress(p) {
      this.pos = clamp01(p) * (this.count - 1);
      this.schedule();
    }
  }

  const film = new Film($('#filmCanvas'));
  DDD.film = film;
  Promise.all([film.first(), document.fonts ? document.fonts.ready : null]).then(() => {
    loaderBar.style.width = '100%';
    setTimeout(hideLoader, 350);
  });
  loaderBar.style.width = '45%';
  addEventListener('load', () => setTimeout(() => film.loadAll(), 300));

  let resizeT;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => film.resize(), 120);
  });

  /* ---------- film intro ---------- */
  function introFilm() {
    if (reduced) return;
    gsap.from('.chapter--intro > *', { y: 36, opacity: 0, duration: 1.3, stagger: 0.1, ease: 'expo.out' });
  }

  /* ---------- reduced motion: last frame, intro copy, normal page ---------- */
  if (reduced) {
    film.loadAll();
    film.progress(1);
    root.classList.add('reduced');
    return;
  }

  /* ---------- film scroll: frames, progress line, chapters ---------- */
  const line = $('#filmLine');
  const stage = $('.film__stage');
  const marks = $$('.film__rail li');
  const fades = $$('.film [data-from]').map(el => ({ el, from: +el.dataset.from, to: +el.dataset.to }));
  const FADE = 0.04;
  ScrollTrigger.create({
    trigger: '.film',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true, // Lenis already smooths the scroll; a second smoothing layer feels laggy
    onUpdate: self => {
      const p = self.progress;
      film.progress(p);
      line.style.transform = `scaleY(${p})`;
      // The film opens and closes on a white model: drop the dark shade and flip the UI there.
      const light = Math.max(clamp01((0.12 - p) / 0.04), clamp01((p - 0.84) / 0.04));
      stage.style.setProperty('--shade', (1 - light).toFixed(3));
      stage.classList.toggle('is-light', light > 0.5);
      marks.forEach(m => m.classList.toggle('is-on', +m.dataset.at <= p + 0.001));
      fades.forEach(f => {
        const a = (f.from === 0 ? 1 : clamp01((p - f.from) / FADE)) * (f.to >= 1 ? 1 : clamp01((f.to - p) / FADE));
        if (f.a !== undefined && Math.abs(a - f.a) < 0.002) return; // untouched chapters cost nothing
        f.a = a;
        f.el.style.opacity = a;
        f.el.style.visibility = a > 0.01 ? 'visible' : 'hidden';
        f.el.style.transform = `translateY(${(1 - a) * 28}px)`;
      });
    }
  });

  /* ---------- work gallery: horizontal on desktop, swipe on phones ---------- */
  ScrollTrigger.matchMedia({
    '(min-width: 900px)': () => {
      const rail = $('#workRail');
      const dist = () => rail.scrollWidth - innerWidth;
      gsap.to(rail, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: { trigger: '.work', start: 'top top', end: () => '+=' + dist(), pin: '.work__pin', scrub: 0.6, invalidateOnRefresh: true }
      });
    }
  });

  /* ---------- reveals ---------- */
  ScrollTrigger.batch('.reveal', {
    start: 'top 88%',
    once: true,
    onEnter: els => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, stagger: 0.08, ease: 'expo.out' })
  });
  $$('.section-head .h2, .offer .h2, .process .h2, .about .h2, .area .h2, .faq .h2, .plan .h2, .builders .h2').forEach(h => {
    gsap.from(h, { y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: h, start: 'top 85%' } });
  });
  gsap.fromTo('.final__bg', { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.final', scrub: true } });
  $$('.services .tile img, .builders__img, .about__img img').forEach(img => {
    gsap.fromTo(img, { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: img.parentElement || img, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  addEventListener('load', () => ScrollTrigger.refresh());
})();

/* ---------- planner ---------- */
(() => {
  const form = document.getElementById('planner');
  if (!form) return;
  const steps = [...form.querySelectorAll('.planner__step')];
  const next = document.getElementById('planNext');
  const back = document.getElementById('planBack');
  const bar = document.getElementById('planBar');
  const summary = document.getElementById('planSummary');
  const email = document.getElementById('planEmail');
  let step = 1;

  const values = n => {
    const box = steps[n - 1].querySelector('.chips');
    return [...box.querySelectorAll('input:checked')].map(i => i.value);
  };
  const valid = () => step > 3 || values(step).length > 0;
  const sync = () => {
    steps.forEach(s => s.classList.toggle('is-active', +s.dataset.step === step));
    bar.style.width = `${Math.min(step, 3) / 3 * 100}%`;
    back.disabled = step === 1;
    next.disabled = !valid();
    next.textContent = step === 3 ? 'See my plan' : 'Next';
    form.classList.toggle('is-done', step === 4);
  };
  form.addEventListener('change', sync);
  back.addEventListener('click', () => { if (step > 1) { step--; sync(); } });
  next.addEventListener('click', () => {
    if (!valid()) return;
    step++;
    if (step === 4) finish();
    sync();
    const legend = steps[step - 1].querySelector('legend, .planner__summary-title');
    legend && legend.setAttribute('tabindex', '-1');
    legend && legend.focus({ preventScroll: true });
  });

  function finish() {
    const rows = [
      ['Project', values(1).join(', ')],
      ['City', values(2).join('')],
      ['Timeline', values(3).join('')]
    ];
    summary.innerHTML = '';
    rows.forEach(([k, v]) => {
      const d = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      d.append(dt, dd);
      summary.append(d);
    });
    const text = `My dream yard\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`;
    email.href = `mailto:DesertDesignDreamscapes@gmail.com?subject=${encodeURIComponent('Free design consultation request')}&body=${encodeURIComponent(text + '\n\nName:\nPhone:\nAddress:')}`;
    try { navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {}); } catch (e) { /* clipboard unavailable */ }
  }
  sync();
})();
