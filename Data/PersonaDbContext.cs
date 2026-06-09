using Base_MVC_Core9.Entities;
using Base_MVC_Core9.Interfaces;
using Base_MVC_Core9.Persistence.Configurations;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Base_MVC_Core9.Data;

public class PersonaDbContext : DbContext
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public PersonaDbContext(DbContextOptions<PersonaDbContext> options, IHttpContextAccessor httpContextAccessor)
        : base(options)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public DbSet<Persona> Personas { get; set; }
    public DbSet<LogCambioClave> LogCambioClaves { get; set; }
    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        // 1. Obtenemos el GUID del usuario logueado desde Identity
        var userGuid = _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        int? personaId = null;

        if (!string.IsNullOrEmpty(userGuid))
        {
            // 2. Buscamos el ID numérico en ESTA base de datos
            // Usamos Select para evitar el error de Cast en otras columnas
            personaId = await Personas
                .AsNoTracking()
                .Where(p => p.Token == userGuid)
                .Select(p => (int?)p.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

        foreach (var entry in ChangeTracker.Entries<IAuditableEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Entity.FechaCreacion = DateTime.Now;
                    entry.Entity.CreadoPorId = personaId;
                    break;
                case EntityState.Modified:
                    entry.Property(x => x.FechaCreacion).IsModified = false;
                    entry.Property(x => x.CreadoPorId).IsModified = false;
                    break;
            }
        }
        return await base.SaveChangesAsync(cancellationToken);
    }
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfiguration(new PersonaConfiguration());
    }
}
