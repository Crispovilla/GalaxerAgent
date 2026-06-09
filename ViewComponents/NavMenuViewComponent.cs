using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory; // <-- Asegúrate de tener este using para la caché
using Base_MVC_Core9.Interfaces;
using Base_MVC_Core9.Dtos;
using System.Security.Claims;

namespace Base_MVC_Core9.ViewComponents
{
    public class NavMenuViewComponent : ViewComponent
    {
        private readonly IMenuNavegacionService _menuNavegacionService;
        private readonly IMemoryCache _cache; // <-- 1. Declaramos la caché

        // 2. Inyectamos ambos servicios en el constructor
        public NavMenuViewComponent(IMenuNavegacionService menuService, IMemoryCache cache)
        {
            _menuNavegacionService = menuService;
            _cache = cache;
        }

        public async Task<IViewComponentResult> InvokeAsync()
        {
            // 3. Obtenemos los roles reales del usuario autenticado
            var rolesUsuario = ObtenerRolesDelUsuario();

            // Si el usuario no está logueado o no tiene roles, devolvemos una vista con un menú vacío
            if (rolesUsuario == null || !rolesUsuario.Any())
            {
                return View(new List<SistemaDto>());
            }

            // Generamos una llave única para esta combinación de roles (ej: "Menu_admin_director")
            string cacheKey = $"Menu_{string.Join("_", rolesUsuario.OrderBy(r => r))}";

            // 4. Buscamos en caché o consultamos a la BD si no existe
            var miMenu = await _cache.GetOrCreateAsync(cacheKey, async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(8); // Expira al terminar la jornada
                return await _menuNavegacionService.GetMenuPorRolesAsync(rolesUsuario);
            });

            return View(miMenu);
        }

        // 5. Lógica real para extraer los roles de ASP.NET Core Identity Claims
        private List<string> ObtenerRolesDelUsuario()
        {
            if (UserClaimsPrincipal == null) return new List<string>();

            // Identity guarda los roles bajo el claim de tipo 'Role'
            return UserClaimsPrincipal.Claims
                .Where(c => c.Type == ClaimTypes.Role)
                .Select(c => c.Value)
                .ToList();
        }
    }
}