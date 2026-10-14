# Auditoría de `index.html` (SEO + accesibilidad)

Fecha: 2026-10-14. Hecha con las skills `seo` y `accessibility` copiadas desde
[affaan-m/ECC](https://github.com/affaan-m/ECC) (MIT) a `.claude/skills/`.

## Crítico: los leads no te llegan

1. **El formulario no envía nada.** `action="https://formspree.io/f/YOUR_FORM_ID"`
   sigue con el placeholder y `handleSubmit` solo hace `fetch` si no lo contiene.
   El lead se guarda en `localStorage` **del navegador del visitante**, que tú
   nunca ves. El usuario ve "Quote received!" pero tú no recibes nada.
2. **El popup de salida (20% off) tampoco envía nada.** `submitExit()` solo
   llama a `saveLead()` (localStorage) y promete un código por email que nunca
   se manda.
3. **Shift+A abre el panel "Leads Captured"** en cualquier momento, incluso al
   escribir una "A" mayúscula en el formulario (p. ej. el nombre "Ana"). Y aunque
   no lo hiciera, ese panel solo muestra los datos del propio visitante.

Arreglo: crear el formulario en Formspree (u otro backend), poner el ID real,
enviar también el popup y quitar el atajo/panel o filtrar `e.target` en inputs.

## Alto

- **La fuente Satoshi no carga.** No está en Google Fonts (es de Fontshare);
  la respuesta de Google solo devuelve Instrument Serif y DM Mono. Todo el texto
  base sale en la `sans-serif` del sistema. Cargarla desde
  `api.fontshare.com` o autoalojarla.
- **Prueba social falsa.** Los toasts "Miguel R. from Miami just requested a
  quote… 2 min ago" son una lista fija en bucle, y "Only 2 spots left for June
  projects" está fijo (además, ya no es junio). Vendes a negocios de EE. UU.: la
  FTC sanciona testimonios y actividad inventada (regla de 2024 sobre reseñas
  falsas). Sustituir por datos reales o quitarlos.
- **Sin teclado en el FAQ.** Los ítems son `<div onclick>`: no se pueden
  enfocar ni abrir con teclado. Usar `<button aria-expanded>` o
  `<details><summary>`.
- **Labels no asociados a sus campos.** En el formulario, los `<label>` no
  tienen `for` ni envuelven el input, así que un lector de pantalla no los
  vincula (y varios campos no tienen `id`). El email del popup (`#exit-email`)
  no tiene label. Añadir `for="<id>"` o `aria-label`.
- **`cursor:none` en todo el `body`** con cursor personalizado: en táctil o si el
  JS falla, no hay cursor. Limitarlo a `@media (hover:hover) and (pointer:fine)`.
- **Sin `prefers-reduced-motion`** pese a Three.js, cursor animado y
  transiciones. Añadir un bloque que desactive animaciones.
- **Foco invisible:** varios inputs usan `outline:none` y solo cambian el borde.
  Añadir `:focus-visible` con contorno claro, también en botones.
- **Contraste bajo:** textos en `rgba(255,255,255,.2–.3)` sobre `#040404`
  (`.ld-time`, placeholders, `.ld-close`) quedan por debajo de 4.5:1.

## SEO

- Hay un `<h1>` (bien), pero hay `<h2>` en modales antes del `<h1>` en el DOM
  (líneas ~433 y ~448). Mover los modales al final o usar otro elemento.
- El `<title>` (43 caracteres) está bien. La meta description es corta (~90);
  ampliarla a 120–160.
- Faltan: `<link rel="canonical">`, Open Graph y Twitter card (para cuando
  compartan el enlace), favicon y JSON-LD `Organization`/`ProfessionalService`.
  Como el FAQ es real, también encaja `FAQPage`.
- Three.js r128 (≈600 KB) se carga de forma bloqueante en el `<head>`: añadir
  `defer` o cargarlo tras el primer render para mejorar el LCP.
- Faltan `robots.txt` y `sitemap.xml` al publicar.
