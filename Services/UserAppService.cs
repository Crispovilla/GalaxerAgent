using Base_MVC_Core9.Dtos;
using Base_MVC_Core9.Entities;
using Base_MVC_Core9.Interfaces;
using Base_MVC_Core9.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;



namespace Base_MVC_Core9.Services;

public class UserAppService : IUserAppService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IPersonaRepository _personaRepo;
    private readonly IEmailSender _emailSender;
    private readonly RoleManager<IdentityRole> _roleManager;

    public UserAppService(
        UserManager<ApplicationUser> userManager,
        IPersonaRepository personaRepo,
        IEmailSender emailSender,
        RoleManager<IdentityRole> roleManager)
    {
        _userManager = userManager;
        _personaRepo = personaRepo;
        _emailSender = emailSender;
        _roleManager = roleManager;
    }

    public async Task<List<UserRolesDto>> GetUsersListAsync()
    {
        var users = await _userManager.Users
            .Where(u => u.Email != "admin@derecho.uchile.cl")
            .ToListAsync();

        var userIds = users.Select(u => u.Id).ToList();

        var personasData = await _personaRepo.GetAllWithTokenAsync(userIds);

        var result = new List<UserRolesDto>();

        foreach (var user in users)
        {
            var persona = personasData.FirstOrDefault(p => p.Token == user.Id);
            var roles = await _userManager.GetRolesAsync(user);
            result.Add(new UserRolesDto(
                user.Id,
                persona?.Id ?? 0,
                persona != null ? $"{persona.Nombre1} {persona.Apellido1}" : user.FullName,
                user.Email!,
                roles.Where(r => !r.Equals("User", StringComparison.OrdinalIgnoreCase)).ToList(),
                persona?.Vigente ?? false
            ));
        }

        return result;
    }


    // --- ACTUALIZACIÓN ---
    public async Task<UserUpdateDto?> GetUserForEditAsync(int personaId)
    {
        var p = await _personaRepo.GetByIdAsync(personaId);
        if (p == null) return null;

        return new UserUpdateDto(
            Id: p.Id,
            Token: p.Token,
            Nombre1: p.Nombre1,
            Nombre2: p.Nombre2,
            Apellido1: p.Apellido1,
            Apellido2: p.Apellido2,
            Rut: p.Rut,
            Dv: p.Dv,
            Correo: p.Correo,
            Genero: p.Genero,
            Telefono: p.Telefono,
            Celular: p.Celular,
            FechaNacimiento: p.FechaNacimiento,
            Uname: p.Uname
        );
    }
    public async Task<(bool Success, string Error)> UpdateStaffAsync(UserUpdateDto dto)
    {
        try
        {
            var persona = await _personaRepo.GetByIdAsync(dto.Id);
            if (persona == null) return (false, "Persona no encontrada");

            persona.Nombre1 = dto.Nombre1;
            persona.Nombre2 = dto.Nombre2;
            persona.Apellido1 = dto.Apellido1;
            persona.Apellido2 = dto.Apellido2;
            persona.Correo = dto.Correo;
            persona.Rut = dto.Rut;
            persona.Dv = dto.Dv;
            persona.Genero = dto.Genero;
            persona.Telefono = dto.Telefono;
            persona.Celular = dto.Celular;
            persona.FechaNacimiento = dto.FechaNacimiento;

            await _personaRepo.UpdateAsync(persona);
            await _personaRepo.SaveChangesAsync();

            var user = await _userManager.FindByIdAsync(dto.Token);
            if (user != null)
            {
                user.Email = dto.Correo;
                user.UserName = dto.Correo;
                user.FullName = $"{dto.Nombre1} {dto.Apellido1}";
                await _userManager.UpdateAsync(user);
            }

            return (true, string.Empty);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    // --- ESTADO (Vigente/No Vigente) ---
    public async Task<(bool Success, string Error)> ToggleStatusAsync(int id, bool active)
    {
        var persona = await _personaRepo.GetByIdAsync(id);
        if (persona == null) return (false, "No existe");

        persona.Vigente = active;
        await _personaRepo.UpdateAsync(persona);
        await _personaRepo.SaveChangesAsync();

        var user = await _userManager.FindByIdAsync(persona.Token);
        if (user != null)
        {
            var lockout = active ? null : (DateTimeOffset?)DateTimeOffset.MaxValue;
            await _userManager.SetLockoutEndDateAsync(user, lockout);
        }

        return (true, string.Empty);
    }


    public async Task<(bool Success, string Error)> RegisterStaffAsync(UserRegistrationDto dto, IUrlHelper urlHelper, string scheme)
    {
        var newUser = new ApplicationUser
        {
            UserName = dto.Correo,
            Email = dto.Correo,
            FullName = $"{dto.Nombre1} {dto.Apellido1}",
            EmailConfirmed = false
        };

        var result = await _userManager.CreateAsync(newUser, dto.Password);

        if (!result.Succeeded)
        {
            return (false, "Error Identity: " + string.Join(", ", result.Errors.Select(e => e.Description)));
        }

        try
        {
            await _userManager.AddClaimAsync(newUser, new Claim("IsTemporaryPassword", "true"));

            var persona = new Persona
            {
                Rut = dto.Rut,
                Dv = dto.Dv,
                Nombre1 = dto.Nombre1,
                Nombre2 = dto.Nombre2,
                Apellido1 = dto.Apellido1,
                Apellido2 = dto.Apellido2,
                Uname = dto.Uname,
                Genero = dto.Genero,
                Correo = dto.Correo,
                Token = newUser.Id,
                Vigente = true
            };

            await _personaRepo.AddAsync(persona);
            await _personaRepo.SaveChangesAsync();

            var log = new LogCambioClave
            {
                UsuarioId = newUser.Id,
                Correo = dto.Correo,
                PersonaId = persona.Id,
                FechaCambio = DateTime.Now,
                IpAddress = dto.IpAddress,
                EsPrimerCambio = null 
            };
            await _personaRepo.RegistrarLogCambioClaveAsync(log);

            var code = await _userManager.GenerateEmailConfirmationTokenAsync(newUser);
            code = Microsoft.AspNetCore.WebUtilities.WebEncoders.Base64UrlEncode(System.Text.Encoding.UTF8.GetBytes(code));

            var callbackUrl = urlHelper.Page(
                "/Account/ConfirmEmail",
                pageHandler: null,
                values: new { area = "Identity", userId = newUser.Id, code = code },
                protocol: scheme);

            await SendActivationEmail(dto.Correo, dto.Password, callbackUrl!);

            return (true, string.Empty);
        }
        catch (Exception ex)
        {
            await _userManager.DeleteAsync(newUser);
            return (false, "Error de Persistencia: " + ex.Message);
        }
    }

    private async Task SendActivationEmail(string email, string pass, string url)
    {
        string mensajeHtml = $@"
            <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;'>
                <h2 style='color: #1a73e8; text-align: center;'>¡Bienvenido a Clínicas jurídicas!</h2>
                <p>Se ha creado una cuenta administrativa para ti.</p>
                <hr>
                <h3 style='color: #1a73e8;'>Credenciales temporales:</h3>
                <p><strong>Usuario:</strong> {email}</p>
                <p><strong>Contraseña Temporal:</strong> <span style='background: #f1f1f1; padding: 2px 5px;'>{pass}</span></p>
                <br>
                <p>Por razones de seguridad, <strong>debes activar tu cuenta y cambiar esta contraseña</strong> haciendo clic en el siguiente botón:</p>
                <div style='text-align: center; margin: 30px 0;'>
                    <a href='{url}' style='background-color: #1a73e8; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;'>Activar Cuenta y Cambiar Clave</a>
                </div>
                <p style='font-size: 0.8em; color: #777;'>Si el botón no funciona, copia y pega este enlace en tu navegador:<br>{url}</p>
            </div>";

        await _emailSender.SendEmailAsync(email, "Activación de Cuenta - Acceso Requerido", mensajeHtml);
    }

    public async Task<List<string>> GetRoleNamesAsync()
    {
        return await _roleManager.Roles
            .Where(r => r.Name != "User")
            .Select(r => r.Name!)
            .ToListAsync();
    }

    public async Task<(bool Success, string Error)> AssignRoleAsync(string userId, string roleName)
    {
        if (string.IsNullOrWhiteSpace(roleName))
        {
            return (false, "Seleccione un rol válido.");
        }

        var user = await _userManager.FindByIdAsync(userId);
        if (user == null) return (false, "Usuario no encontrado.");

        var roles = await _userManager.GetRolesAsync(user);
        roles = roles.Where(r => !r.Equals("User", StringComparison.OrdinalIgnoreCase)).ToList();

        // Validar si el rol existe en el sistema antes de intentar asignarlo
        var roleExists = await _roleManager.RoleExistsAsync(roleName);
        if (!roleExists)
        {
            return (false, $"El rol '{roleName}' no existe en el sistema.");
        }

        //// Validar si ya lo tiene para no duplicar
        //if (await _userManager.IsInRoleAsync(user, roleName))
        //{
        //    return (false, $"El usuario ya posee el rol {roleName}.");
        //}

        // Validar si ya lo tiene para no duplicar
        if (roles.Count > 0)
        {
            return (false, $"El usuario ya posee el rol {roles[0].ToString()}.");
        }

        var result = await _userManager.AddToRoleAsync(user, roleName);
        return result.Succeeded ? (true, string.Empty) : (false, "Error al asignar el rol.");
    }

    public async Task<(bool Success, string Error)> RemoveRoleAsync(string userId, string roleName)
    {
        // 1. Validación de entrada (Evita el ArgumentNullException que viste)
        if (string.IsNullOrWhiteSpace(roleName))
        {
            return (false, "El nombre del rol no puede estar vacío.");
        }

        // 2. Verificar existencia del usuario
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
        {
            return (false, "Usuario no encontrado.");
        }

        // 3. Verificar si el usuario realmente TIENE el rol (Tu validación original)
        // Esto evita llamadas innecesarias a la BD y errores de Identity
        var hasRole = await _userManager.IsInRoleAsync(user, roleName);
        if (!hasRole)
        {
            return (false, $"El usuario no tiene asignado el rol {roleName}.");
        }

        // 4. Intento de eliminación
        var result = await _userManager.RemoveFromRoleAsync(user, roleName);

        if (result.Succeeded)
        {
            return (true, string.Empty);
        }

        // 5. Captura de errores específicos de Identity si fallara por otra razón
        var errorMsg = string.Join(", ", result.Errors.Select(e => e.Description));
        return (false, $"Error al quitar rol: {errorMsg}");
    }
}