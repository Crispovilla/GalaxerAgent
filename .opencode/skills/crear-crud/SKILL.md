---
name: crear-crud
description: Use when the user asks to create a new module or generate a CRUD ("crear un módulo", "generar el CRUD para [Entidad]", "nueva entidad", "agregar tabla X a la interfaz"). Enforces the strict Entities -> Dtos -> Interfaces -> Services -> Controllers -> build order for this .NET 9 MVC project.
---

# Skill: Flujo para Crear un Nuevo Módulo / CRUD

Cuando el usuario pida "crear un nuevo módulo" o "generar el CRUD para [NombreEntidad]", debes seguir ESTE ORDEN ESTRICTO:

1. **Entidad (`Entities/`):**
   - Crear el modelo en C# 13 dentro de `Entities/[NombreEntidad].cs`.
   - Incluir campos base: `Id` (int), `FechaCreacion` (DateTime), `Vigente` (bool).

2. **DTOs (`Dtos/`):**
   - Crear `[NombreEntidad]Dto.cs` con las propiedades requeridas para las vistas.

3. **Interfaz y Servicio (`Interfaces/` y `Services/`):**
   - Crear `I[NombreEntidad]Service.cs` en `Interfaces/`.
   - Crear `[NombreEntidad]Service.cs` en `Services/` e implementar la interfaz.

4. **Controlador (`Controllers/`):**
   - Crear `[NombreEntidad]Controller.cs`.
   - Inyectar el servicio en el constructor.
   - Definir las acciones: `Index`, `Details`, `Create`, `Edit`, `Delete`.

5. **Registro en DI:**
   - Registrar el servicio en `Program.cs` (`builder.Services.AddScoped<...>`).
   - Los controladores quedan delgados: toda lógica en el servicio.

6. **Verificación:**
   - Ejecutar `dotnet build` (previo: `taskkill /F /IM Base-MVC-Core9.exe` si la app corre)
     y confirmar 0 errores antes de dar por terminado el módulo.

Nota: si la entidad viene del scaffolding DB-First, aplicar también las reglas de la
skill `db-scaffold-workflow` (nunca editar la entidad generada; usar clases parciales).
