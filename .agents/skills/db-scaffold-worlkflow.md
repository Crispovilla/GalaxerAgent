# Skill: Flujo de Trabajo para Scaffolding de Base de Datos (DB-First)

Cuando se realice o actualice un scaffolding de la Base de Datos con Entity Framework Core, sigue estas reglas:

## 1. Reglas de Scaffolding
- Las entidades autogeneradas en `Entities/` (o `Data/`) **NUNCA se deben modificar manualmente**. Si la BD cambia, se volverá a ejecutar `dotnet ef dbcontext scaffold`.
- Toda lógica adicional o campos calculados para una entidad deben agregarse en una **clase parcial** (`partial class`) dentro de una carpeta separada para evitar que el scaffolding los borre.

## 2. Creación de Capas sobre la Entidad Generada
Cuando el usuario pida trabajar con una tabla existente en la BD (ej. "Prepara la lógica para la tabla 'Clientes'"):
1. **Revisar:** Confirmar que la entidad exista en `Entities/`.
2. **Crear DTO (`Dtos/`):** Crear `[Tabla]Dto.cs` asignando únicamente las propiedades necesarias para la interfaz gráfica.
3. **Crear Servicio (`Interfaces/` y `Services/`):** Crear la interfaz y la implementación inyectando el `DbContext` existente para consultar la base de datos mediante LINQ.
4. **Crear Controlador (`Controllers/`):** Conectar las acciones HTTP al servicio.

## 3. Verificación
- Confirmar siempre la compilación con `dotnet build`.