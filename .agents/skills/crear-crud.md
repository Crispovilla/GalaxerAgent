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

5. **Verificación:**
   - Indicar al usuario que ejecute `dotnet build` para confirmar que todo compile sin errores.