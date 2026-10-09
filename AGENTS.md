# Contexto del Proyecto: Base MVC Core 9 ("Halcón Milenario")

## Descripción
Proyecto web .NET 9 con arquitectura MVC en capas, envuelto en una consola de mando
"Halcón Milenario": una constelación 3D (Three.js + GSAP) donde las carpetas del
proyecto son estaciones espaciales, un agente IA viaja hacia los archivos y la UI
muestra radar, bitácora y paneles de estado. Idioma: **español** (UI, mensajes y
respuestas del agente). Sin emojis.

## Estructura del Proyecto
- `Controllers/`: endpoints HTTP (controladores delgados). clave: `AgentController.cs`.
- `Entities/`: entidades de dominio.
- `Dtos/`: objetos de transferencia entre servicios y controladores.
- `Services/`: lógica de negocio. clave: `AgentOrchestrator.cs` (orquesta skills en
  paralelo), `AgentSessionRegistry.cs`, `AgentEngine/` (Semantic Kernel),
  `CodeGraph/` (escaneo Roslyn).
- `Hubs/ConstellationHub.cs`: SignalR mapeado en `/constellationHub`.
- `Interfaces/`: contratos de servicios.
- `Persistence/` o `Data/`: DBContext y repositorios EF Core.
- `Views/`: vistas Razor. `Views/Agent/Index.cshtml` es la consola principal.
- `wwwroot/js/constellation.js`: **núcleo 3D** (~4000 líneas; naves, sol, asteroide,
  constelación de carpetas). Ver skill `editar-escena-3d`.
- `wwwroot/scss/`: estilos (Inspinia).

## Convenciones de Código
- C# 13 y características modernas de .NET 9.
- Inyección de Dependencias en `Program.cs`; toda lógica pesada en `Services`.
- Controladores siempre delgados.
- Validar JS tras cada edición: `node --check wwwroot/js/constellation.js`.

## Comandos Útiles
- Compilar: `dotnet build`
- Ejecutar: `dotnet run --launch-profile http` (http://localhost:5031 → redirect
  https://localhost:7196; login obligatorio vía AuthorizeFilter global)
- Restaurar paquetes: `dotnet restore`
- Captura de pantalla con login: `node .opencode/skills/visualizar-pantalla/scripts/capturar.mjs /Agent --wait=7000`
- Cámara libre sobre la escena: `node .opencode/scripts/capturar-cam.mjs --view=folders --cam=... --tgt=... --out=x.png`
- Empaquetado de contexto para refactors grandes: `npx --no-install repomix`
  (salida local `repomix-output.xml`, no versionada)

## Reglas Operativas (lecciones aprendidas — NO olvidar)
- **Antes de compilar**: `taskkill /F /IM Base-MVC-Core9.exe` si la app está corriendo.
  Evita errores MSB3021/3027 (archivos de `bin/` bloqueados) y builds eternos.
- **Nunca usar sleeps largos** en comandos de lanzamiento/monitoreo: un timeout largo
  mata el árbol de procesos y la app (incidente real que obligó a reinstalar opencode).
  Preferir comandos cortos y verificación por puerto (`Get-NetTCPConnection -LocalPort 5031`).
- Cambios en **C#/vistas** requieren `dotnet build` + reinicio de la app (no hay Razor
  runtime compilation). **JS/estáticos**: solo refresco del navegador.
- `curl`/`Invoke-WebRequest` contra la app requiere seguir redirects (307 a HTTPS).
- Credenciales de prueba en `%USERPROFILE%\.config\opencode\agent-ui-creds.json`
  y API keys en `appsettings.Development.json` (gitignorado): **nunca commitear**.
- Git: rama `main`. No hacer commit/push sin petición explícita del usuario.
- La app puede morir en silencio al lanzar orquestadores de agentes (causa raíz
  pendiente; dumps en `%TEMP%\opencode`). Si la app no responde, verificar el puerto.
- Cuota de proveedores IA: OpenRouter puede agotarse diario (~reset 21:00 hora Chile);
  fallback conocido: AIHubMix (`google/gemma-4-26b-a4b-it:free`).

## Skills y Agentes del Repo
- `.opencode/skills/visualizar-pantalla/`: captura headless con login (verificar UI).
- `.opencode/skills/editar-escena-3d/`: loop de edición de `constellation.js` + cámara.
- `.opencode/skills/crear-crud/`: flujo estricto de creación de módulos.
- `.opencode/skills/db-scaffold-workflow/`: reglas DB-First con EF Core.
- `.opencode/skills/integrar-constelacion-agent/`: mapa de la arquitectura de agentes.
- `.opencode/agents/verificador-ui.md`: subagente que captura y reporta la UI.
- `.opencode/plugins/js-syntax-check.js`: valida `.js` con `node --check` tras cada edit.
- `opencode.json`: permisos, instrucciones y MCP Playwright.
