---
name: editar-escena-3d
description: Use when editing or debugging the 3D constellation scene in wwwroot/js/constellation.js (constelación, Three.js, naves, Star Destroyer, base de control, Nebulon-B, destino final, Estrella de la Muerte, superlaser, sol, asteroide, renderFolderBases, VIEW_PRESETS, cámara, GSAP). Documents the edit-validate-capture loop, the page globals reachable via page.evaluate, and the camera helper scripts.
---

# Skill: editar-escena-3d

Loop de trabajo para modificar la escena 3D (`wwwroot/js/constellation.js`, ~4000 líneas,
script clásico sin módulos) sin romper nada.

## 1. Loop obligatorio tras cada edición

1. Editar `wwwroot/js/constellation.js`.
2. Validar sintaxis: `node --check wwwroot/js/constellation.js`
   (el plugin `.opencode/plugins/js-syntax-check.js` ya lo ejecuta automático tras
   cada edit/write sobre `.js`; si el check falla, arreglar antes de continuar).
3. JS estático: **no** requiere rebuild ni reinicio de la app — basta recargar la
   página en el navegador/Playwright.
4. Verificar visualmente (paso 3) y leer el PNG con la tool `Read`.

## 2. Posiciones y vistas clave

- `BASE_POSITION` (0, 5, 70) — Star Destroyer (base de control).
- `PORTAL_POSITION` (0, 34, -95) — EF76 Nebulon-B (destino final).
- `FOLDER_ZONE` (0, 90, 0) — Estrella de la Muerte (base central) + lunas-carpetas.
- `VIEW_PRESETS`: `base` pos(82,52,168) tgt(0,16,55) ·
  `folders` pos(0,112,92) tgt(0,88,0) · `solar` (sistema solar).
- `setViewMode('base'|'solar'|'folders')` cambia de vista con tween de GSAP.

## 3. Globals accesibles desde `page.evaluate()`

Al ser script clásico, `let/const/function` de nivel superior quedan accesibles en el
contexto de la página: `camera`, `controls`, `camTween`, `viewMode`, `setViewMode`,
`renderFolderBases`, `folderBasesList`, `VIEW_PRESETS`, `hubConnection`, etc.
Funciona leerlos **y escribirlos** desde evaluate (así se congeló el giro de la
Estrella de la Muerte para fotografiar el superláser).

Patrón de cámara (aplicar **dos veces** con ~300 ms en medio para ganarle al tween de
GSAP, y con `camTween = false` para que no lo sobrescriba):

```js
await page.evaluate(([a,b,c,d,e,f]) => {
    camTween = false;
    camera.position.set(a, b, c);
    controls.target.set(d, e, f);
    controls.update();
}, [px, py, pz, tx, ty, tz]);
```

Congelar el giro de una base de carpeta:

```js
window.__lock = setInterval(() => { folderBasesList[0].core.rotation.y = 0.25; }, 25);
// al terminar: clearInterval(window.__lock)
```

Montar la vista de carpetas si aún no está:

```js
renderFolderBases('C:/Proyecto/Core-9-IA', ['Controllers', 'Dtos', /* ... */]);
setViewMode('folders');
```

## 4. Scripts de captura con cámara

- Genérico (recomendado):

  ```powershell
  node .opencode/scripts/capturar-cam.mjs --view=folders --setup=deathstar `
    --cam=14,101,18 --tgt=3.5,94.5,2.5 --out=ds4.png --lock=0:0.25
  ```

  Flags: `--view base|solar|folders` · `--setup deathstar|none` · `--cam/--tgt` con
  `x,y,z` (obligatorios) · `--out` (rutas relativas van a `%TEMP%\opencode\`) ·
  `--wait=ms` (default 2500) · `--lock=indiceBase:rotY` congela el giro ·
  `--eval="js()"` ejecuta JS en la página tras el setup (p. ej.
  `--eval="spawnFlybyAsteroid();"` para forzar un asteroide de paso).
  Maneja login automáticamente y loguea errores JS de la página (`[JS] ...`).
- Ejemplo completo multi-toma: `.opencode/scripts/ejemplos/deathstar-laser.mjs`.
- Captura simple sin cámara: skill `visualizar-pantalla`.

## 5. Errores comunes

- `X no está definido` en evaluate: el identificador no existe en la página (p. ej.
  `const` interno no expuesto) — usar otra global o agregar `window.X = X` en el JS.
- La cámara "no hace nada": tween de GSAP aún corriendo — esperar ~2.5 s tras
  `setViewMode` y repetir el set (patrón de doble set del paso 3).
- Canvas negro: `pageerror` indicará CDN caído (three r128 / GSAP) o error de runtime.
- No olvidar: subcarpetas usan variante `'moon'`, la central `'deathstar'`
  (`buildFolderBase(name, color, scale, variant)`).
