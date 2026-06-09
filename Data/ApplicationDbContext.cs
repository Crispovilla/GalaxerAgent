using Base_MVC_Core9.Entities;
using Base_MVC_Core9.Interfaces;
using Base_MVC_Core9.Persistence.Configurations;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Base_MVC_Core9.Data;

// ── CONTEXTO DE IDENTIDAD ──────────────────────────────────
// Se encarga exclusivamente de la seguridad y usuarios.
public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public ApplicationDbContext(
        DbContextOptions<ApplicationDbContext> options,
        IHttpContextAccessor httpContextAccessor)
        : base(options)
    {
        _httpContextAccessor = httpContextAccessor;
    }



    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
    }
}