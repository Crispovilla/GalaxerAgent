using Base_MVC_Core9.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace Base_MVC_Core9.Services;

public interface IUserAppService
{
    Task<List<UserRolesDto>> GetUsersListAsync();
    //Task<(bool Success, string Error)> RegisterStaffAsync(UserRegistrationDto dto, string callbackUrl);
    Task<(bool Success, string Error)> RegisterStaffAsync(UserRegistrationDto dto, IUrlHelper urlHelper, string scheme);
    Task<(bool Success, string Error)> UpdateStaffAsync(UserUpdateDto dto);
    Task<(bool Success, string Error)> ToggleStatusAsync(int id, bool active);
    Task<UserUpdateDto?> GetUserForEditAsync(int personaId);
    Task<List<string>> GetRoleNamesAsync();
    Task<(bool Success, string Error)> AssignRoleAsync(string userId, string roleName);
    Task<(bool Success, string Error)> RemoveRoleAsync(string userId, string roleName);
}