---
name: integrar-constelacion-agent
description: "Crea e integra automáticamente la arquitectura de agentes Semantic Kernel, SignalR, Roslyn CodeGraph y la interfaz 3D en Three.js/GSAP en el proyecto Base-MVC-Core9."
---

# Skill: Integración Automática de Workspace 3D y Agente Autónomo

## Contexto y Restricciones del Proyecto
- Sigue las convenciones expuestas en `AGENTS.md` (C# 13, .NET 9 MVC, controladores delgados, inyección de dependencias).
- Mantiene la capa de autenticación, la plantilla Inspinia y las rutas existentes intactas.
- Genera todo el código necesario en la estructura MVC nativa del proyecto.

---

## PASO 1: INSTALACIÓN DE DEPENDENCIAS
Ejecuta los siguientes comandos en la terminal del proyecto:
```bash
dotnet add package Microsoft.SemanticKernel
dotnet add package Microsoft.CodeAnalysis.CSharp