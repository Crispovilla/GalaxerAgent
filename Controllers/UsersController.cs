using Base_MVC_Core9.Constants;
using Base_MVC_Core9.Dtos;
using Base_MVC_Core9.Models.Persona;
using Base_MVC_Core9.Models.UserRoles;
using Base_MVC_Core9.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Base_MVC_Core9.Controllers
{
    [Authorize(Roles = Roles.Admin)]
    public class UsersController : BaseController
    {

        private readonly IUserAppService _userAppService;

        public UsersController(IUserAppService userAppService) {
            _userAppService = userAppService;        
        }

        public async Task<IActionResult> Index()
        {
            var usersDto = await _userAppService.GetUsersListAsync();

            var viewModel = usersDto.Select(u => new UserRolesViewModel
            {
                UserId = u.UserId,
                PersonaId = u.PersonaId,
                FullName = u.FullName,
                Email = u.Email,
                Roles = u.Roles,
                Vigente = u.Vigente
            }).ToList();

            ViewBag.ListaRoles = await _userAppService.GetRoleNamesAsync();

            return View(viewModel);
        }

        [HttpGet]
        public IActionResult Create() => View();

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(PersonaCreateViewModel model)
        {
            if (!ModelState.IsValid)
            {
                NotifyError("Por favor, corrija los errores en el formulario.");
                return View(model);
            }

            var dto = new UserRegistrationDto(
                Rut: model.Rut,
                Dv: model.Dv,
                Nombre1: model.Nombre1,
                Nombre2: model.Nombre2,
                Apellido1: model.Apellido1,
                Apellido2: model.Apellido2,
                Uname: model.Uname,
                Genero: model.Genero,
                Correo: model.Correo,
                Password: model.Password,
                IpAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? "N/A"
            );

            var (success, error) = await _userAppService.RegisterStaffAsync(dto, Url, Request.Scheme);

            if (success)
            {
                NotifySuccess($"Usuario {model.Uname} registrado correctamente.");
                return RedirectToAction(nameof(Index));
            }

            NotifyError(error);
            return View(model);
        }

        [HttpGet]
        public async Task<IActionResult> Edit(int id)
        {
            var dto = await _userAppService.GetUserForEditAsync(id);
            if (dto == null) return NotFound();

            var model = new PersonaEditViewModel
            {
                Id = dto.Id,
                Token = dto.Token,
                Rut = dto.Rut,
                Dv = dto.Dv,
                Nombre1 = dto.Nombre1,
                Nombre2 = dto.Nombre2,
                Apellido1 = dto.Apellido1,
                Apellido2 = dto.Apellido2,
                Correo = dto.Correo,
                Genero = dto.Genero,
                Telefono = dto.Telefono,
                Celular = dto.Celular,
                FechaNacimiento = dto.FechaNacimiento,
                Uname = dto.Uname
            };

            return View(model);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(PersonaEditViewModel model)
        {
            if (!ModelState.IsValid) return View(model);

            var dto = new UserUpdateDto(
                Id: model.Id,
                Token: model.Token!,
                Nombre1: model.Nombre1!,
                Nombre2: model.Nombre2,
                Apellido1: model.Apellido1!,
                Apellido2: model.Apellido2,
                Rut: model.Rut,
                Dv: model.Dv,
                Correo: model.Correo!,
                Genero: model.Genero,
                Telefono: model.Telefono,
                Celular: model.Celular,
                FechaNacimiento: model.FechaNacimiento,
                Uname: model.Uname
            );

            var (success, error) = await _userAppService.UpdateStaffAsync(dto);

            if (success)
            {
                NotifySuccess("Usuario actualizado correctamente.");
                return RedirectToAction(nameof(Index));
            }

            NotifyError(error);
            return View(model);
        }

        [HttpPost]
        public async Task<IActionResult> AssignRole(string userId, string roleName)
        {
            var (success, error) = await _userAppService.AssignRoleAsync(userId, roleName);

            if (success) NotifySuccess($"Rol {roleName} asignado.");
            else NotifyError(error);

            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> RemoveRole(string userId, string roleName)
        {
            var (success, error) = await _userAppService.RemoveRoleAsync(userId, roleName);

            if (success) NotifySuccess($"Rol {roleName} quitado.");
            else NotifyError(error);

            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> DesactivaPersona(int id)
        {
            var (success, error) = await _userAppService.ToggleStatusAsync(id, false);
            if (success) NotifySuccess("Usuario desactivado.");
            else NotifyError(error);
            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> ActivaPersona(int id)
        {
            var (success, error) = await _userAppService.ToggleStatusAsync(id, true);
            if (success) NotifySuccess("Usuario activado.");
            else NotifyError(error);
            return RedirectToAction(nameof(Index));
        }

    }
}
