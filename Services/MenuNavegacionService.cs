using Base_MVC_Core9.Data;
using Base_MVC_Core9.Dtos;
using Base_MVC_Core9.Entities.sistema;
using Base_MVC_Core9.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Base_MVC_Core9.Services
{
    public class MenuNavegacionService : IMenuNavegacionService
    {
        private readonly SistemaDbContext _context;

        public MenuNavegacionService(SistemaDbContext context)
        {
            _context = context;
        }

        public async Task<List<SistemaDto>> GetMenuPorRolesAsync(List<string> rolIds) // <-- Cambiado a List<string>
        {
            // 1. LINQ Puro: Traemos de un solo golpe todas las entradas que corresponden a los roles del usuario
            var entradasPermitidas = await _context.RolPermisos
                .Where(rp => rolIds.Contains(rp.RolId) && rp.EntradaMenu.Vigente == true)
                .Select(rp => rp.EntradaMenu)
                .Distinct()
                .OrderBy(e => e.Orden)
                .ToListAsync();

            // 2. Traemos los sistemas involucrados en esas entradas
            var sistemaIds = entradasPermitidas.Select(e => e.SistemaId).Distinct();

            var sistemas = await _context.Sistemas
                .Where(s => sistemaIds.Contains(s.Id) && s.Vigente == true)
                .OrderBy(s => s.Orden)
                .ToListAsync();

            // 3. Armamos el árbol estructurado
            var menuFinal = sistemas.Select(s => new SistemaDto
            {
                SistemaId = s.Id,
                SistemaNombre = s.Nombre,
                SistemaIcono = s.Icono,
                // Filtramos las entradas raíz de este sistema (las que no tienen ParentId)
                SubMenus = ConstruirArbolRecursivo(entradasPermitidas.Where(e => e.SistemaId == s.Id).ToList(), null)
            }).ToList();

            return menuFinal;
        }

        // Recuerda tener también el método recursivo auxiliar debajo en la misma clase:
        private List<MenuNodoDto> ConstruirArbolRecursivo(List<EntradaMenu> todas, int? parentId)
        {
            return todas
                .Where(e => e.ParentId == parentId)
                .Select(e => new MenuNodoDto
                {
                    Id = e.Id,
                    Nombre = e.Nombre,
                    Controlador = e.Controlador,
                    Accion = e.Accion,
                    Icono = e.Icono,
                    Hijos = ConstruirArbolRecursivo(todas, e.Id)
                }).ToList();
        }
    }
}
