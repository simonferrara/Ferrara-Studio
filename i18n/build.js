// Builds the translated pages from index.html (English source) + i18n/<lang>.json:
//   es/index.html, it/index.html
// Usage (from the repo root): node i18n/build.js
// Re-run it every time index.html changes. Strings missing from a dictionary stay in English and are listed.
const path = require('path'), fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(process.env.PW || 'playwright'); }
const ROOT = path.join(__dirname, '..');
const SITE = 'https://ferrarastudio.net';

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const browser = await pw.chromium.launch();
  const page = await browser.newPage();
  for (const file of fs.readdirSync(__dirname).filter(f => /^[a-z]{2}\.json$/.test(f))) {
    const dict = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
    const lang = dict._lang;
    const res = await page.evaluate(({ html, dict, lang, SITE }) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const T = dict.text, missing = new Set();
      const tr = s => { const k = s.replace(/\s+/g, ' ').trim(); if (!k || !/[A-Za-z]{2}/.test(k)) return s; if (k in T) { const pre = s.match(/^\s*/)[0], post = s.match(/\s*$/)[0]; return pre + T[k] + post; } missing.add(k); return s; };
      // text nodes (not scripts/styles)
      const w = d.createTreeWalker(d.documentElement, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const pe = n.parentElement; if (!pe || /^(SCRIPT|STYLE)$/.test(pe.tagName)) continue; if (pe.closest('.lang')) continue; n.nodeValue = tr(n.nodeValue); }
      // attributes
      d.querySelectorAll('[aria-label],[placeholder],[data-package]').forEach(e => { for (const a of ['aria-label', 'placeholder', 'data-package']) if (e.hasAttribute(a) && !e.closest('.lang')) e.setAttribute(a, tr(e.getAttribute(a))); });
      d.querySelectorAll('meta[name=description],meta[property="og:title"],meta[property="og:description"]').forEach(m => m.setAttribute('content', tr(m.getAttribute('content'))));
      // language-specific head
      d.documentElement.setAttribute('lang', lang);
      const url = `${SITE}/${lang}/`;
      d.querySelector('link[rel=canonical]').setAttribute('href', url);
      d.querySelector('meta[property="og:url"]').setAttribute('content', url);
      d.querySelector('script[data-i18n-redirect]')?.remove();
      // links marked data-i18n-href point to the same page in this language (e.g. /privacy/ → /es/privacy/)
      d.querySelectorAll('a[data-i18n-href]').forEach(a => a.setAttribute('href', `/${lang}${a.getAttribute('href')}`));
      // switcher: mark the current language
      d.querySelectorAll('.lang a').forEach(a => a.dataset.lang === lang ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
      // strings inside the page script
      const jsMissing = [];
      d.querySelectorAll('script[type=module]').forEach(s => {
        let src = s.textContent;
        for (const [en, loc] of Object.entries(dict.js)) { if (!src.includes(en)) jsMissing.push(en); src = src.split(en).join(loc); }
        s.textContent = src;
      });
      return { out: '<!DOCTYPE html>\n' + d.documentElement.outerHTML + '\n', missing: [...missing], jsMissing };
    }, { html, dict, lang, SITE });
    fs.mkdirSync(path.join(ROOT, lang), { recursive: true });
    fs.writeFileSync(path.join(ROOT, lang, 'index.html'), res.out);
    console.log(`${lang}/index.html written. Untranslated: ${res.missing.length ? res.missing.join(' | ') : 'none'}${res.jsMissing.length ? ' · JS keys not found: ' + res.jsMissing.join(' | ') : ''}`);
  }
  await browser.close();
})();
