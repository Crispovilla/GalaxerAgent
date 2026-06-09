using Base_MVC_Core9.Data;
using Base_MVC_Core9.Dtos;
using Base_MVC_Core9.Entities;
using Base_MVC_Core9.Interfaces;
using Microsoft.AspNetCore.Identity;

using System;
using System.Linq;
using System.Threading.Tasks;

namespace Base_MVC_Core9.Services;

public class IdentityService : IIdentityService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly IPersonaRepository _personaRepository; // Usamos la Interfaz, no el DbContext

    public IdentityService(
        UserManager<ApplicationUser> userManager,
        IPersonaRepository personaRepository,
        SignInManager<ApplicationUser> signInManager)
    {
        _userManager = userManager;
        _personaRepository = personaRepository;
        _signInManager = signInManager;
    }

    public async Task<IdentityResult> ResetPasswordWithAuditAsync(ResetPasswordDto dto, string ipAddress)
    {
        var user = await _userManager.FindByEmailAsync(dto.Email);
        if (user == null)
            return IdentityResult.Failed(new IdentityError { Description = "Usuario no encontrado." });

        // 1. Ejecución del cambio (Misión Crítica)
        var result = await _userManager.ResetPasswordAsync(user, dto.Code, dto.Password);

        if (result.Succeeded)
        {
            // 2. Forzar confirmación de cuenta (Para evitar el error "Invalid Login" después del reset)
            if (!await _userManager.IsEmailConfirmedAsync(user))
            {
                var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
                await _userManager.ConfirmEmailAsync(user, token);
            }

            // 3. Auditoría Proactiva (Pilar A: Conversión del fracaso en activo)
            await RegistrarAuditoria(user, ipAddress);

            // 4. Seguridad Operacional: Limpiar marcadores temporales
            await LimpiarClaimsTemporales(user);

            // 5. MISION CRÍTICA: Refrescar la cookie de autenticación
            // Sin esto, el Middleware seguirá viendo el claim antiguo y redirigiendo al usuario
            await _signInManager.RefreshSignInAsync(user);
        }
        return result;
    }

    private async Task RegistrarAuditoria(ApplicationUser user, string ipAddress)
    {
        // El servicio no sabe CÓMO se guarda, solo le pide al repositorio que lo haga
        var personaId = await _personaRepository.GetPersonaIdByTokenAsync(user.Id);

        // El repositorio ya maneja el error de bool? con '== true' internamente
        bool yaExisteRegistro = await _personaRepository.ExistePrimerCambioAsync(user.Id);

        var nuevoLog = new LogCambioClave
        {
            UsuarioId = user.Id,
            Correo = user.Email,
            PersonaId = personaId,
            FechaCambio = DateTime.Now,
            IpAddress = ipAddress,
            // Si ya existe un registro de "primer cambio", este nuevo debe ser false (0)
            EsPrimerCambio = !yaExisteRegistro
        };

        await _personaRepository.RegistrarLogCambioClaveAsync(nuevoLog);
    }

    private async Task LimpiarClaimsTemporales(ApplicationUser user)
    {
        var claims = await _userManager.GetClaimsAsync(user);
        var tempClaim = claims.FirstOrDefault(c => c.Type == "IsTemporaryPassword");
        if (tempClaim != null)
        {
            await _userManager.RemoveClaimAsync(user, tempClaim);
        }
    }
}