/* Desert Design Dreamscapes — interactions (GSAP + ScrollTrigger + Lenis) */
(() => {
  const root = document.documentElement;
  root.classList.add('js');

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

  /* ---------- film: frames decoded ahead, painted once per animation frame ---------- */
  class Film {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.count = +canvas.dataset.count;
      // Phones get the vertical cut, larger screens the wide one.
      this.size = matchMedia('(min-width: 900px)').matches ? 'lg' : 'sm';
      this.frames = new Array(this.count);
      this.target = 0;
      this.drawn = -1;
      this.loading = false;
      this.raf = 0;
      this.resize();
    }
    src(i) { return `assets/film/${this.size}/${String(i + 1).padStart(3, '0')}.webp`; }
    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
      this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
      this.drawn = -1;
      this.schedule();
    }
    async load(i) {
      if (this.frames[i]) return this.frames[i];
      try {
        const res = await fetch(this.src(i));
        return (this.frames[i] = await createImageBitmap(await res.blob()));
      } catch (e) {
        return null;
      }
    }
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
      const ctx = this.ctx;
      const mismatch = (img.width / img.height) / (cw / ch);
      if (mismatch > 0.72 && mismatch < 1.39) {
        const s = Math.max(cw / img.width, ch / img.height);
        ctx.drawImage(img, (cw - img.width * s) / 2, (ch - img.height * s) / 2, img.width * s, img.height * s);
      } else {
        // Clip shot for another aspect: dimmed backdrop from the same frame, clip shown whole.
        const bs = Math.max(cw / img.width, ch / img.height) * 1.15;
        ctx.drawImage(img, (cw - img.width * bs) / 2, (ch - img.height * bs) / 2, img.width * bs, img.height * bs);
        ctx.fillStyle = 'rgba(15,13,11,.72)';
        ctx.fillRect(0, 0, cw, ch);
        const s = Math.min(cw / img.width, ch / img.height);
        ctx.drawImage(img, (cw - img.width * s) / 2, (ch - img.height * s) / 2, img.width * s, img.height * s);
      }
      this.drawn = n;
    }
    progress(p) {
      this.target = Math.round(clamp01(p) * (this.count - 1));
      this.schedule();
    }
  }

  const film = new Film($('#filmCanvas'));
  Promise.all([film.load(0), document.fonts ? document.fonts.ready : null]).then(() => {
    film.schedule();
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
      marks.forEach(m => m.classList.toggle('is-on', +m.dataset.at <= p + 0.001));
      fades.forEach(f => {
        const a = (f.from === 0 ? 1 : clamp01((p - f.from) / FADE)) * clamp01((f.to - p) / FADE);
        if (Math.abs(a - (f.a ?? -1)) < 0.002) return; // untouched chapters cost nothing
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
