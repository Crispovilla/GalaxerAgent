// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.
#nullable disable

using Base_MVC_Core9.Data;
using Base_MVC_Core9.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace Base_MVC_Core9.Areas.Identity.Pages.Account.Manage
{
    public class ChangePasswordModel : PageModel
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly ILogger<ChangePasswordModel> _logger;
        private readonly PersonaDbContext _personaContext;

        public ChangePasswordModel(
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            ILogger<ChangePasswordModel> logger,
            PersonaDbContext personaContext
            )
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _logger = logger;
            _personaContext = personaContext;
        }

        /// <summary>
        ///     This API supports the ASP.NET Core Identity default UI infrastructure and is not intended to be used
        ///     directly from your code. This API may change or be removed in future releases.
        /// </summary>
        [BindProperty]
        public InputModel Input { get; set; }

        /// <summary>
        ///     This API supports the ASP.NET Core Identity default UI infrastructure and is not intended to be used
        ///     directly from your code. This API may change or be removed in future releases.
        /// </summary>
        [TempData]
        public string StatusMessage { get; set; }

        /// <summary>
        ///     This API supports the ASP.NET Core Identity default UI infrastructure and is not intended to be used
        ///     directly from your code. This API may change or be removed in future releases.
        /// </summary>
        public class InputModel
        {
            /// <summary>
            ///     This API supports the ASP.NET Core Identity default UI infrastructure and is not intended to be used
            ///     directly from your code. This API may change or be removed in future releases.
            /// </summary>
            [Required]
            [DataType(DataType.Password)]
            [Display(Name = "Current password")]
            public string OldPassword { get; set; }

            /// <summary>
            ///     This API supports the ASP.NET Core Identity default UI infrastructure and is not intended to be used
            ///     directly from your code. This API may change or be removed in future releases.
            /// </summary>
            [Required]
            [StringLength(100, ErrorMessage = "The {0} must be at least {2} and at max {1} characters long.", MinimumLength = 6)]
            [DataType(DataType.Password)]
            [Display(Name = "New password")]
            public string NewPassword { get; set; }

            /// <summary>
            ///     This API supports the ASP.NET Core Identity default UI infrastructure and is not intended to be used
            ///     directly from your code. This API may change or be removed in future releases.
            /// </summary>
            [DataType(DataType.Password)]
            [Display(Name = "Confirm new password")]
            [Compare("NewPassword", ErrorMessage = "The new password and confirmation password do not match.")]
            public string ConfirmPassword { get; set; }
        }

        //public async Task<IActionResult> OnGetAsync()
        //{
        //    var user = await _userManager.GetUserAsync(User);
        //    if (user == null)
        //    {
        //        return NotFound($"Unable to load user with ID '{_userManager.GetUserId(User)}'.");
        //    }

        //    var hasPassword = await _userManager.HasPasswordAsync(user);
        //    if (!hasPassword)
        //    {
        //        return RedirectToPage("./SetPassword");
        //    }

        //    return Page();
        //}
        public bool EsCambioObligatorio { get; set; }

        public async Task<IActionResult> OnGetAsync()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return NotFound();

            var yaCambio = await _personaContext.LogCambioClaves
                .AnyAsync(l => l.UsuarioId == user.Id && l.EsPrimerCambio == true);

            if (!yaCambio)
            {
                EsCambioObligatorio = true;
                ViewData["HideNav"] = true;
            }

            return Page();
        }

        public async Task<IActionResult> OnPostAsync()
        {
            if (!ModelState.IsValid)
            {
                return Page();
            }

            var user = await _userManager.GetUserAsync(User);
            if (user == null)
            {
                return NotFound($"Unable to load user with ID '{_userManager.GetUserId(User)}'.");
            }

            var changePasswordResult = await _userManager.ChangePasswordAsync(user, Input.OldPassword, Input.NewPassword);

            if (!changePasswordResult.Succeeded)
            {
                foreach (var error in changePasswordResult.Errors)
                {
                    ModelState.AddModelError(string.Empty, error.Description);
                }
                return Page();
            }

            // 🔥 LOGICA DE LIBERACIÓN (STAFF LEVEL)
            // 1. Buscamos si el usuario tiene el claim de "clave temporal"
            var claims = await _userManager.GetClaimsAsync(user);
            var tempPasswordClaim = claims.FirstOrDefault(c => c.Type == "IsTemporaryPassword");
            var persona = await _personaContext.Personas.FirstOrDefaultAsync(p => p.Correo == user.Email);
            var log = new LogCambioClave
            {
                UsuarioId = user.Id,
                Correo = user.Email,
                FechaCambio = DateTime.Now,
                EsPrimerCambio = (tempPasswordClaim != null), // Si tenía el claim, es su primer cambio
                IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
                PersonaId = persona != null ? persona.Id : 0
            };

            _personaContext.LogCambioClaves.Add(log);
            await _personaContext.SaveChangesAsync();


            if (tempPasswordClaim != null)
            {
                // 2. Eliminamos el claim de la base de datos
                await _userManager.RemoveClaimAsync(user, tempPasswordClaim);
            }

            // 3. REFRESCAMOS LA SESIÓN
            // Esto es vital: actualiza la cookie en el navegador del usuario para que 
            // el Middleware vea que el claim ya no existe en su identidad actual.
            await _signInManager.RefreshSignInAsync(user);

            _logger.LogInformation("User changed their password successfully and is no longer temporary.");
            StatusMessage = "Tu contraseña ha sido actualizada. Ya puedes navegar por el sistema.";

            // 4. REDIRECCIÓN FINAL
            // En lugar de volver a la misma página (RedirectToPage()), lo mandamos al Home
            // porque ahora ya tiene permiso para ver todo.
            return RedirectToAction("Index", "Home", new { area = "" });
        }
    }
}
