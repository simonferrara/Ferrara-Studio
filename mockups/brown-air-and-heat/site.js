/* Brown Air mockup — page behaviour: retracting banner, mobile menu, demo forms.
   No dependencies. Nothing here sends data anywhere. */
(() => {
  'use strict';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- N12: banner retracts on scroll down, returns on scroll up ---------- */
  const nav = $('#nav');
  const BANNER_KEY = 'brownair.banner.dismissed';
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  if (nav) {
    const dismiss = () => {
      nav.classList.add('is-dismissed');
      document.documentElement.style.setProperty('--banner-h', '0px');
    };
    if (store.get(BANNER_KEY)) dismiss();
    $('#banner-x')?.addEventListener('click', () => { dismiss(); store.set(BANNER_KEY, '1'); });

    let lastY = window.scrollY;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 48) nav.classList.remove('is-compact');
        else if (y > lastY + 4) nav.classList.add('is-compact');
        else if (y < lastY - 4) nav.classList.remove('is-compact');
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------- mobile menu ---------- */
  const toggle = $('#nav-toggle');
  const sheet = $('#nav-sheet');
  if (toggle && sheet) {
    const setOpen = (open) => {
      sheet.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(sheet.hidden));
    sheet.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !sheet.hidden) { setOpen(false); toggle.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (!sheet.hidden && !e.target.closest('#nav')) setOpen(false);
    });
    window.matchMedia('(min-width: 70rem)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  /* ---------- small helpers ---------- */
  const today = new Date();
  const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  $$('[data-min-today]').forEach((el) => { el.min = isoToday; });

  // "Book" links in the services list pre-fill the request form.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-issue]');
    if (link) {
      const issue = $('#sf-issue');
      const details = $('#sf-details');
      if (issue) issue.value = link.dataset.issue;
      if (details && link.dataset.note && !details.value) details.value = `${link.dataset.note} service`;
    }
    const role = e.target.closest('[data-role]');
    if (role) {
      const sel = $('#cf-role');
      if (sel) sel.value = role.dataset.role;
    }
  });

  /* ---------- demo forms: validate on blur, then on input (the "touched" pattern) ---------- */
  const digits = (v) => v.replace(/\D/g, '');
  const RULES = {
    name: (v) => (v.trim().length >= 2 ? '' : 'Add your name so we know who to ask for.'),
    phone: (v) => {
      const d = digits(v).replace(/^1(?=\d{10}$)/, '');
      if (!d) return 'Add a phone number so the office can confirm with you.';
      return d.length === 10 ? '' : 'That number looks incomplete. Enter all 10 digits, area code first.';
    },
    address: (v) => (v.trim().length >= 6 ? '' : 'Add the service address so we can check it is in our area.'),
    choice: (v) => (v ? '' : 'Pick the closest match so we can route your request.'),
    email: (v) => {
      if (!v.trim()) return 'Add an email address so we can reply.';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'That email address looks incomplete. Check for a missing @ or ending.';
    },
  };

  const validate = (input) => {
    const rule = RULES[input.dataset.rule];
    if (!rule) return true;
    const field = input.closest('.field');
    const msg = field.querySelector('.field__msg');
    const error = rule(input.value);
    if (error) {
      field.setAttribute('data-invalid', '');
      field.removeAttribute('data-valid');
      input.setAttribute('aria-invalid', 'true');
      msg.textContent = `⚠ ${error}`;
    } else {
      field.removeAttribute('data-invalid');
      field.setAttribute('data-valid', '');
      input.removeAttribute('aria-invalid');
      msg.textContent = msg.dataset.hint || '';
    }
    return !error;
  };

  const LABELS = {
    service: { title: 'Request received', lead: 'Demo only: nothing was sent. On the live site this request goes to the office by email.', again: 'Send another request' },
    career: { title: 'Application received', lead: 'Demo only: nothing was sent. On the live site this application goes to the hiring manager.', again: 'Start another application' },
  };

  $$('form[data-demo-form]').forEach((form) => {
    const kind = form.dataset.demoForm;
    const done = $(`#${form.id}-done`);
    const submit = form.querySelector('[type="submit"]');
    const submitLabel = submit.textContent;
    const ruled = $$('[data-rule]', form);

    ruled.forEach((input) => {
      input.addEventListener('blur', () => { input.dataset.touched = '1'; validate(input); });
      const recheck = () => { if (input.dataset.touched) validate(input); };
      input.addEventListener('input', recheck);
      input.addEventListener('change', recheck);
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (submit.dataset.state === 'loading') return;
      const firstBad = ruled.filter((input) => { input.dataset.touched = '1'; return !validate(input); })[0];
      if (firstBad) { firstBad.focus(); return; }

      submit.dataset.state = 'loading';
      submit.setAttribute('aria-disabled', 'true');
      submit.textContent = 'Sending…';

      window.setTimeout(() => {
        // Build the confirmation from what was typed. textContent only — never innerHTML with user input.
        const rows = $$('.field', form).map((field) => {
          const control = field.querySelector('.input');
          const label = field.querySelector('.field__label').firstChild.textContent.trim();
          let value = control.value;
          if (control.tagName === 'SELECT') value = control.selectedOptions[0]?.textContent || '';
          if (control.type === 'file') value = control.files?.[0]?.name || '';
          return value ? [label, value] : null;
        }).filter(Boolean);

        done.replaceChildren();
        const h = document.createElement('h3');
        h.textContent = LABELS[kind].title;
        const p = document.createElement('p');
        p.textContent = LABELS[kind].lead;
        const dl = document.createElement('dl');
        rows.forEach(([k, v]) => {
          const row = document.createElement('div');
          const dt = document.createElement('dt');
          const dd = document.createElement('dd');
          dt.textContent = k;
          dd.textContent = v;
          row.append(dt, dd);
          dl.append(row);
        });
        const again = document.createElement('button');
        again.type = 'button';
        again.className = 'btn';
        again.textContent = LABELS[kind].again;
        again.addEventListener('click', () => {
          form.reset();
          $$('.field', form).forEach((field) => {
            field.removeAttribute('data-invalid');
            field.removeAttribute('data-valid');
            const msg = field.querySelector('.field__msg');
            msg.textContent = msg.dataset.hint || '';
          });
          ruled.forEach((input) => { delete input.dataset.touched; input.removeAttribute('aria-invalid'); });
          done.hidden = true;
          form.hidden = false;
          form.querySelector('.input').focus();
        });
        done.append(h, p, dl, again);

        delete submit.dataset.state;
        submit.removeAttribute('aria-disabled');
        submit.textContent = submitLabel;
        form.hidden = true;
        done.hidden = false;
        done.focus();
      }, 700);
    });
  });

  /* ---------- hand-offs to the front-desk widget ---------- */
  document.addEventListener('click', (e) => {
    const say = e.target.closest('[data-fd-say]');
    const open = e.target.closest('[data-fd-open]');
    if (!say && !open) return;
    e.preventDefault();
    window.BrownFrontDesk?.open(say ? say.dataset.fdSay : undefined, { fresh: Boolean(say) });
  });
})();
