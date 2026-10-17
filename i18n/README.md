# Idiomas de ferrarastudio.net

- `index.html` (raíz) es la versión en **inglés** y la única que se edita a mano.
- `es/index.html` e `it/index.html` se **generan** con `node i18n/build.js` a partir de `index.html` + `i18n/es.json` / `i18n/it.json`.
  No editarlas a mano: se sobrescriben.
- Cada vez que cambies un texto en `index.html`:
  1. Agrega la traducción en `i18n/es.json` e `i18n/it.json` (clave = texto en inglés exacto).
  2. `node i18n/build.js` → lista los textos que quedaron sin traducir.
  3. Commit de los 3 HTML.
- Botón EN · ES · IT en el encabezado. La primera visita desde un navegador en español o italiano va a su idioma;
  si la persona elige otro idioma en el botón, se respeta siempre (`localStorage.lang`).
- SEO: cada idioma tiene su URL, `hreflang` en el `<head>` y en `sitemap.xml`, y `canonical` propio.
- Otro idioma (p. ej. portugués): crear `i18n/pt.json` con la misma estructura, agregar el enlace `PT` en `.lang`
  y las líneas `hreflang` en `index.html` y `sitemap.xml`, y correr el build.
