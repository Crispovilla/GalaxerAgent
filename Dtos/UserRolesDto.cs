namespace Base_MVC_Core9.Dtos;

public record UserRolesDto(
    string UserId,
    int PersonaId,
    string FullName,
    string Email,
    List<string> Roles,
    bool Vigente);