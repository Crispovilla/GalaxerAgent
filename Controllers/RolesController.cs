using Base_MVC_Core9.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Base_MVC_Core9.Controllers
{
    [Authorize(Roles = Roles.Admin)] // Solo admins entran aquí
    public class RolesController : Controller
    {
        private readonly RoleManager<IdentityRole> _roleManager;

        public RolesController(RoleManager<IdentityRole> roleManager)
        {
            _roleManager = roleManager;
        }

        // GET: /Roles
        public async Task<IActionResult> Index()
        {
            var roles = await _roleManager.Roles.OrderByDescending(r => r.Id).ToListAsync();
            return View(roles);
        }

        // POST: /Roles/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(string roleName)
        {
            if (string.IsNullOrWhiteSpace(roleName))
            {
                TempData["Error"] = "El nombre del rol no puede estar vacío.";
                return RedirectToAction(nameof(Index));
            }

            // NORMALIZACIÓN: Evita "admin", "Admin", " ADMIN "
            var normalizedName = roleName.Trim();

            // VALIDACIÓN: ¿Ya existe?
            if (await _roleManager.RoleExistsAsync(normalizedName))
            {
                TempData["Error"] = $"El rol '{normalizedName}' ya existe en el sistema.";
                return RedirectToAction(nameof(Index));
            }

            var result = await _roleManager.CreateAsync(new IdentityRole(normalizedName));
            if (result.Succeeded)
            {
                TempData["Success"] = $"Rol '{normalizedName}' creado correctamente.";
            }
            else
            {
                TempData["Error"] = "Error al crear el rol: " + string.Join(", ", result.Errors.Select(e => e.Description));
            }

            return RedirectToAction(nameof(Index));
        }
    }
}
