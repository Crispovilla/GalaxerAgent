using Microsoft.AspNetCore.Identity;

namespace Base_MVC_Core9.Entities;

public class ApplicationUser : IdentityUser
{
    // Aquí van tus campos personalizados
    public string FullName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.Now;

    // El 'IdentityUser' ya trae por defecto:
    // Id, UserName, Email, PasswordHash, PhoneNumber, etc.
}