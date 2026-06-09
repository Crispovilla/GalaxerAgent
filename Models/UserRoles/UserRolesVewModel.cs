namespace Base_MVC_Core9.Models.UserRoles;

public class UserRolesViewModel
{
    public required string UserId { get; set; }
    public int PersonaId { get; set; }
    public string? FullName { get; set; }
    public required string Email { get; set; }
    public required IEnumerable<string> Roles { get; set; }

    public bool Vigente { get; set; }
}

