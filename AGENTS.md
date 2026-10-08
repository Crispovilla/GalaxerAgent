# Contexto del Proyecto: Base MVC Core 9

## Descripción
Proyecto web basado en .NET 9 con arquitectura MVC dividida en capas.

## Estructura del Proyecto
- `Controllers/`: Manejo de endpoints HTTP (controladores delgados).
- `Entities/`: Entidades de dominio para la base de datos.
- `Dtos/`: Objetos de transferencia de datos entre servicios y controladores.
- `Services/`: Lógica de negocio de la aplicación.
- `Persistence/` o `Data/`: DBContext y repositorios de Entity Framework Core.
- `Views/`: Vistas de Razor (HTML, CSS, JS).

## Convenciones de Código
- Usar C# 13 y características modernas de .NET 9.
- Aplicar Inyección de Dependencias en `Program.cs`.
- Mantener la lógica pesada fuera de los controladores (delegar siempre a `Services`).

## Comandos Útiles
- Compilar: `dotnet build`
- Ejecutar: `dotnet run`
- Restaurar paquetes: `dotnet restore`