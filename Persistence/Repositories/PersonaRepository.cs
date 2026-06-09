using Base_MVC_Core9.Data;
using Base_MVC_Core9.Entities;
using Base_MVC_Core9.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Base_MVC_Core9.Persistence.Repositories;

public class PersonaRepository : IPersonaRepository
{
    private readonly PersonaDbContext _context;
    public PersonaRepository(PersonaDbContext context) => _context = context;

    public async Task<Persona?> GetByIdAsync(int id) =>
        await _context.Personas.FindAsync(id);

    public async Task<Persona?> GetByTokenAsync(string token) =>
        await _context.Personas.FirstOrDefaultAsync(p => p.Token == token);

    public async Task AddAsync(Persona persona) =>
        await _context.Personas.AddAsync(persona);

    public async Task UpdateAsync(Persona persona)
    {
        _context.Personas.Update(persona);
        await Task.CompletedTask;
    }

    public async Task SaveChangesAsync() =>
        await _context.SaveChangesAsync();


    public async Task<int> GetPersonaIdByTokenAsync(string token)
    {
        return await _context.Personas
            .AsNoTracking()
            .Where(p => p.Token == token)
            .Select(p => p.Id)
            .FirstOrDefaultAsync();
    }
    public async Task<IEnumerable<Persona>> GetAllWithTokenAsync(List<string> tokens)
    {
        return await _context.Personas
            .AsNoTracking()
            .Where(p => tokens.Contains(p.Token))
            .ToListAsync();
    }

    public async Task<bool> ExistePrimerCambioAsync(string userId)
    {
        return await _context.LogCambioClaves
            .AnyAsync(l => l.UsuarioId == userId && l.EsPrimerCambio == true);
    }

    public async Task RegistrarLogCambioClaveAsync(LogCambioClave log)
    {
        _context.LogCambioClaves.Add(log);
        await _context.SaveChangesAsync();
    }
}