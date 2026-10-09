---
name: visualizar-pantalla
description: Use when the user asks to see, view, screenshot, capture or visually verify the UI of this ASP.NET MVC project (screenshot, pantalla, capturar, visualizar, ver la interfaz, revisar render, constelación, /Agent, verificar vista). Takes headless Edge screenshots of the running app on localhost:5031, handles the Identity login automatically, reports console/JS errors, and returns a PNG the model can read.
---

# Skill: visualizar-pantalla

Workflow para ver en pantalla la app del proyecto (MVC + Three.js "Halcón Milenario")
sin depender de que el usuario describa lo que ve.

## 1. Precondición: la app corriendo

URL base: `http://localhost:5031` (perfil `http` de `Properties/launchSettings.json`).
Redirige a HTTPS (`https://localhost:7196`) — el script lo sigue solo.

Verificar/levantar:

```powershell
if (-not (Get-NetTCPConnection -LocalPort 5031 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process dotnet -ArgumentList "run","--launch-profile","http" -WorkingDirectory (Get-Location)
    Start-Sleep -Seconds 10   # esperar a que escuche
}
```

Si el proyecto cambió en C#/vistas hay que **reiniciar** la app (no hay Razor runtime
compilation). JS/estáticos: solo refresco, no hace falta reiniciar.

## 2. Captura con login (método principal)

```powershell
node .opencode\skills\visualizar-pantalla\scripts\capturar.mjs /Agent --wait=7000
```

- Ruta por defecto `/Agent`; otras: `/`, `/Ejemplo`, `/Identity/Account/Login`.
- `--out=C:\...\otro.png` cambia el destino (default `%TEMP%\opencode\pantalla.png`).
- `--wait=ms` espera tras cargar (default 6000 en /Agent, 2500 en otras rutas) para que
  la constelación termine de montarse.
- `--anon` fuerza no-login (útil para capturar el login tal cual).
- La **primera vez** instala `playwright-core` en `%TEMP%\opencode\ui-captura` (~2 s,
  usa el Edge ya instalado vía `channel: 'msedge'`, no descarga navegadores).

Salidas por stdout: `OK <png>`, `URL`, `TITLE` y bloque `PROBLEMAS:` con errores de
consola/JS de la página (`pageerror` + `console.error`). Códigos de salida:
`0` ok · `2` requiere login sin credenciales · `3` login fallido · `4` app no responde.

**Códigos de salida**: interpretar siempre `$LASTEXITCODE`; si es 4, levantar la app (paso 1).

## 3. Leer el resultado

Pasar el PNG al tool `Read` — se muestra como imagen y se puede analizar
(layout, render, bloom, estados del HUD, textos, errores visibles).

## 4. Credenciales

Guardadas en `%USERPROFILE%\.config\opencode\agent-ui-creds.json`
(**fuera del repo, nunca commitear**):

```json
{ "user": "usuario@derecho.uchile.cl", "pass": "..." }
```

Alternativa: env `AGENT_UI_USER` / `AGENT_UI_PASS`. Si el login falla (código 3),
pedir credenciales actualizadas al usuario con `question`.

## 5. Alternativa sin Node (solo pantallas anónimas)

Edge headless directo, para login o páginas sin sesión:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu `
  --enable-unsafe-swiftshader --screenshot="$env:TEMP\opencode\pantalla.png" `
  --window-size=1600,900 --virtual-time-budget=15000 --hide-scrollbars `
  "http://localhost:5031/Identity/Account/Login"
```

Para `/Agent` **no** sirve (exige sesión: `AuthorizeFilter` global en `Program.cs`).

## 6. Cuándo usarlo

- Tras tocar CSS/JS/vistas: verificar visualmente en vez de preguntar "¿se ve bien?".
- Para comprobar estados (constelación montada, modal del explorador, log de errores,
  bloom/FXAA activos, estaciones de skills).
- Para diagnosticar: si la captura sale negra/vacía, revisar el bloque `PROBLEMAS`
  (faltan scripts CDN, error JS, canvas no montado).
