/* Desert Design Dreamscapes — interactions (GSAP + ScrollTrigger + Lenis) */
(() => {
  const root = document.documentElement;
  root.classList.add('js');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDesktop = () => matchMedia('(min-width: 900px)').matches;
  const DDD = (window.DDD = { heroProgress: reduced ? 1 : 0, reduced });

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ---------- loader ---------- */
  const loader = $('#loader');
  const loaderBar = $('#loaderBar');
  let loaderDone = false;
  const hideLoader = () => {
    if (loaderDone) return;
    loaderDone = true;
    loader.classList.add('is-done');
    introHero();
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
    nav.classList.toggle('is-solid', y > 40);
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

  /* ---------- frame sequences drawn to canvas ---------- */
  // Frames are decoded up front (createImageBitmap) and painted once per animation frame,
  // so scrubbing never pays a decode on the main thread.
  class Sequence {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.name = canvas.dataset.seq;
      this.count = +canvas.dataset.count;
      this.frames = new Array(this.count);
      this.target = 0;
      this.drawn = -1;
      this.loading = false;
      this.raf = 0;
      this.resize();
    }
    get size() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      return this.canvas.clientWidth * dpr > 520 ? 'lg' : 'sm';
    }
    src(i) {
      this.sizeKey = this.sizeKey || this.size; // keep one resolution per session
      return `assets/seq/${this.name}/${this.sizeKey}/${String(i + 1).padStart(3, '0')}.webp`;
    }
    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(this.canvas.clientWidth * dpr);
      const h = Math.round(this.canvas.clientHeight * dpr);
      if (!w || !h) return;
      this.canvas.width = w;
      this.canvas.height = h;
      this.drawn = -1;
      this.schedule();
    }
    async load(i) {
      if (this.frames[i]) return this.frames[i];
      try {
        const res = await fetch(this.src(i));
        const bmp = await createImageBitmap(await res.blob());
        this.frames[i] = bmp;
        return bmp;
      } catch (e) {
        return null;
      }
    }
    first() { return this.load(0).then(() => this.schedule()); }
    // Coarse-to-fine order: early scrubbing already looks continuous while the rest streams in.
    loadAll() {
      if (this.loading) return;
      this.loading = true;
      const order = [];
      const seen = new Set();
      for (let step = 16; step >= 1; step /= 2)
        for (let i = 0; i < this.count; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
      let next = 0;
      const worker = () => {
        if (next >= order.length) return;
        const i = order[next++];
        this.load(i).then(() => {
          if (Math.abs(i - this.target) < 4) { this.drawn = -1; this.schedule(); }
          worker();
        });
      };
      for (let k = 0; k < 6; k++) worker();
    }
    nearest(i) {
      for (let d = 0; d < this.count; d++) {
        if (this.frames[i - d]) return i - d;
        if (this.frames[i + d]) return i + d;
      }
      return -1;
    }
    schedule() {
      if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
    }
    paint() {
      const n = this.nearest(this.target);
      if (n < 0 || n === this.drawn) return;
      const img = this.frames[n];
      const { width: cw, height: ch } = this.canvas;
      const s = Math.max(cw / img.width, ch / img.height);
      const w = img.width * s, h = img.height * s;
      this.ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      this.drawn = n;
    }
    progress(p) {
      this.target = Math.round(Math.min(1, Math.max(0, p)) * (this.count - 1));
      this.schedule();
    }
  }

  const seqs = {};
  $$('canvas.seq').forEach(c => { seqs[c.dataset.seq] = new Sequence(c); });
  const loaded = Object.values(seqs).map(s => s.first());
  Promise.all([loaded[0], document.fonts ? document.fonts.ready : null]).then(() => {
    loaderBar.style.width = '100%';
    setTimeout(hideLoader, 350);
  });
  loaderBar.style.width = '45%';

  // Stream the full sequences only when a section gets close, to save mobile data.
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const s = seqs[e.target.dataset.seq];
      s && s.loadAll();
      io.unobserve(e.target);
    });
  }, { rootMargin: '250% 0px' });
  Object.values(seqs).forEach(s => io.observe(s.canvas));
  // The render sequence sits right after the hero: warm it up as soon as the page is idle.
  addEventListener('load', () => setTimeout(() => seqs.render && seqs.render.loadAll(), 600));

  let resizeT;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => Object.values(seqs).forEach(s => s.resize()), 120);
  });

  /* ---------- hero intro ---------- */
  function introHero() {
    if (reduced) return;
    gsap.from('.hero__title .line > span', { yPercent: 110, duration: 1.3, stagger: 0.09, ease: 'expo.out' });
    gsap.from(['.hero .eyebrow', '.hero__lede', '.hero__actions', '.hero__chips li'], { y: 24, opacity: 0, duration: 1, stagger: 0.08, delay: 0.35, ease: 'power3.out' });
  }

  /* ---------- reduced motion: static, fully readable layout ---------- */
  if (reduced) {
    seqs.render && (seqs.render.loadAll(), seqs.render.progress(1));
    $$('.steps li').forEach(li => li.classList.add('is-active'));
    root.classList.add('reduced');
    return;
  }

  /* ---------- hero: pin while the 3D patio assembles ---------- */
  ScrollTrigger.create({
    trigger: '.hero',
    start: 'top top',
    end: '+=130%',
    pin: '#heroStage',
    scrub: true,
    onUpdate: self => { DDD.heroProgress = self.progress; }
  });
  gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=130%', scrub: true } })
    .to('.hero__copy', { y: -60, opacity: 0, ease: 'power1.in', duration: 0.4 }, 0.55)
    .to('.hero__chips, .hero__scroll', { opacity: 0, duration: 0.2 }, 0.5)
    .to('.hero__stage', { '--scrim': 0, duration: 0.3 }, 0.6)
    .fromTo('.hero__caption', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.15 }, 0.85);

  /* ---------- render sequence ---------- */
  const steps = $$('#renderSteps li');
  const renderBar = $('#renderProgress');
  ScrollTrigger.create({
    trigger: '.scrub--render',
    start: 'top top',
    end: '+=170%',
    pin: '.scrub--render .scrub__pin',
    scrub: true, // Lenis already smooths the scroll; a second smoothing layer feels laggy
    onUpdate: self => {
      const p = self.progress;
      seqs.render.progress(p);
      renderBar.style.transform = `scaleX(${p})`;
      const active = Math.min(steps.length - 1, Math.floor(p * steps.length));
      steps.forEach((li, i) => li.classList.toggle('is-active', i === active));
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
