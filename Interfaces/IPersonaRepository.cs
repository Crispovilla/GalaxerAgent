using Base_MVC_Core9.Entities;

namespace Base_MVC_Core9.Interfaces;

//public interface IPersonaRepository
//{
//    Task<int> GetPersonaIdByTokenAsync(string token);
//    Task<bool> ExistePrimerCambioAsync(string userId);
//    Task RegistrarLogCambioClaveAsync(LogCambioClave log);
//}

public interface IPersonaRepository
{
    Task<IEnumerable<Persona>> GetAllWithTokenAsync(List<string> tokens);
    Task<Persona?> GetByIdAsync(int id);
    Task<Persona?> GetByTokenAsync(string token);
    Task AddAsync(Persona persona);
    Task UpdateAsync(Persona persona);
    Task SaveChangesAsync();
    Task<int> GetPersonaIdByTokenAsync(string token);
    Task<bool> ExistePrimerCambioAsync(string userId);
    Task RegistrarLogCambioClaveAsync(LogCambioClave log);
}