---
name: integrar-constelacion-agent
description: Use when wiring or debugging the in-app agent architecture (Semantic Kernel, SignalR ConstellationHub, Roslyn CodeGraph, AgentOrchestrator, orquestación en paralelo, eventos OnCodeGraphLoaded) or when integrating it with the 3D constellation UI. Provides the map of already-implemented components and the rules for extending them safely.
---

# Skill: Arquitectura del Agente Autónomo y la Constelación 3D

**Esta arquitectura YA está implementada en el proyecto.** Úsala como mapa antes de
tocar nada; no la reinstales desde cero.

## Componentes existentes (rutas reales)

- `Controllers/AgentController.cs` — endpoints HTTP de sesión/orquestación (delgado).
- `Hubs/ConstellationHub.cs` — hub SignalR, mapeado en `/constellationHub` (`Program.cs`).
- `Services/AgentOrchestrator.cs` — orquesta skills en paralelo; emite eventos al hub
  vía `IHubContext<ConstellationHub>` (ej. `OnCodeGraphLoaded`).
- `Services/AgentSessionRegistry.cs` — registro de sesiones activas por cliente.
- `Services/AgentEngine/AiWorkflowSkill.cs` + `Interfaces/IAiWorkflowSkill.cs` —
  skills de flujo de trabajo sobre Semantic Kernel.
- `Services/AgentEngine/ProjectWorkspacePlugin.cs` — plugin SK del workspace del proyecto.
- `Services/AgentEngine/ConstellationAgentFilter.cs` — filtro SK que notifica cambios
  de estado al hub para animar la UI.
- `Services/CodeGraph/CodeGraphService.cs` (`ICodeGraphService.ScanProject`) +
  `Services/CodeGraph/RoslynCodeVisitor.cs` — análisis del código con Roslyn.
- `Dtos/CodeGraphDto.cs` — contrato del grafo consumido por el cliente.
- `wwwroot/js/constellation.js` — cliente 3D que consume los eventos SignalR
  (ver skill `editar-escena-3d` para el loop de edición y verificación).

## Reglas al extender

1. Controladores delgados; la lógica siempre en `Services/`.
2. Registrar todo en `Program.cs` vía DI.
3. C# 13 / .NET 9; respeta `AGENTS.md`.
4. No romper la firma de eventos SignalR que `constellation.js` ya escucha
   (busca `hubConnection.on(` en el JS antes de renombrar payloads).
5. Tras cambios en C#: `taskkill /F /IM Base-MVC-Core9.exe` → `dotnet build` → relanzar.
6. Verificar visualmente con la skill `visualizar-pantalla` (consola `/Agent`).

## Instalación de paquetes (solo si faltan)

```bash
dotnet add package Microsoft.SemanticKernel
dotnet add package Microsoft.CodeAnalysis.CSharp
```

## Diagnóstico conocido

- La app puede morir en silencio al lanzar orquestadores (causa raíz pendiente;
  dumps en `%TEMP%\opencode`). Si ocurre: verificar puerto 5031, revisar log de la app
  y reducir el trabajo en paralelo para aislar el disparador.
- OpenRouter puede tener cuota diaria agotada (~reset 21:00 hora Chile); fallback:
  AIHubMix (`google/gemma-4-26b-a4b-it:free`).
