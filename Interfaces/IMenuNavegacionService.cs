using Base_MVC_Core9.Dtos;

namespace Base_MVC_Core9.Interfaces
{
    public interface IMenuNavegacionService
    {
        Task<List<SistemaDto>> GetMenuPorRolesAsync(List<string> rolIds);
    }
}
