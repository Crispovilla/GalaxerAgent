using Base_MVC_Core9.Data;
using Base_MVC_Core9.Entities;
using Base_MVC_Core9.Hubs;
using Base_MVC_Core9.Interfaces;
using Base_MVC_Core9.Services;
using Base_MVC_Core9.Services.AgentEngine;
using Base_MVC_Core9.Services.CodeGraph;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.UI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var agentConnectionString = builder.Configuration.GetConnectionString("AgentEngineConnection");

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(agentConnectionString));

// ── 1. CONFIGURACIÓN DE BASES DE DATOS ──────────────────────
// Contexto para Identity
builder.Services.AddDbContext<ApplicationDbContext>(options =>
{
    options.UseSqlServer(builder.Configuration.GetConnectionString("LoginConnection"));
    options.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
});

// Contexto para Negocio (Persona)
builder.Services.AddDbContext<PersonaDbContext>(options =>
{
    options.UseSqlServer(builder.Configuration.GetConnectionString("PersonaConnection")
        ?? builder.Configuration.GetConnectionString("LoginConnection")); // Fallback al default si no existe
    options.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
});

builder.Services.AddDbContext<SistemaDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("SistemaConnection")));

builder.Services.AddScoped<IMenuNavegacionService, MenuNavegacionService>();

// ── 2. IDENTITY (Registro único y limpio) ──────────────────
builder.Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
{
    options.SignIn.RequireConfirmedAccount = true;
    options.Password.RequireDigit = true;
    options.Password.RequiredLength = 8;
    options.Password.RequireUppercase = true;
    options.Password.RequireNonAlphanumeric = false;
    options.User.RequireUniqueEmail = true;
})
.AddEntityFrameworkStores<ApplicationDbContext>()
.AddDefaultTokenProviders()
.AddDefaultUI();

// ── 3. SERVICIOS ADICIONALES ───────────────────────────────
builder.Services.AddTransient<IEmailSenderCustom, EmailSender>();
builder.Services.AddHttpContextAccessor();

builder.Services.AddScoped<IUserAppService, UserAppService>();
builder.Services.AddScoped<Base_MVC_Core9.Interfaces.IPersonaRepository, Base_MVC_Core9.Persistence.Repositories.PersonaRepository>();
// ── 4. SEGURIDAD, COOKIES Y TOKENS ─────────────────────────
builder.Services.Configure<DataProtectionTokenProviderOptions>(options =>
{
    options.TokenLifespan = TimeSpan.FromDays(30);
});

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "BaseMVC_Identity";
    options.LoginPath = "/Identity/Account/Login";
    options.LogoutPath = "/Identity/Account/Logout";
    options.AccessDeniedPath = "/Identity/Account/AccessDenied";
    options.ExpireTimeSpan = TimeSpan.FromHours(24);
    options.SlidingExpiration = true;
    options.Cookie.HttpOnly = true;
});

builder.Services.AddSignalR();
builder.Services.AddScoped<ICodeGraphService, CodeGraphService>();
builder.Services.AddScoped<IAgentOrchestrator, AgentOrchestrator>();
builder.Services.AddScoped<IAiWorkflowSkill, AiWorkflowSkill>();
builder.Services.AddSingleton<IAgentSessionRegistry, AgentSessionRegistry>();


builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(@"C:\temp\Keys-BaseMVC"));

// ── 5. MVC CON FILTROS GLOBALES ────────────────────────────
builder.Services.AddControllersWithViews(options =>
{
    // Bloqueo global: Autenticación requerida por defecto
    var policy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
    options.Filters.Add(new AuthorizeFilter(policy));

    // Validación automática de Antiforgery
    options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute());
});

// ── 6. RAZOR PAGES (Para Identity) ─────────────────────────
builder.Services.AddRazorPages(options =>
{
    options.Conventions.AllowAnonymousToAreaPage("Identity", "/Account/Login");
    options.Conventions.AllowAnonymousToAreaPage("Identity", "/Account/ForgotPassword");
    options.Conventions.AllowAnonymousToAreaPage("Identity", "/Account/ResetPassword");
    options.Conventions.AllowAnonymousToAreaPage("Identity", "/Account/ResetPasswordConfirmation");
    options.Conventions.AllowAnonymousToAreaPage("Identity", "/Account/ConfirmEmail");
});

var app = builder.Build();

// ── 7. INICIALIZACIÓN DE DATOS (Seeding) ───────────────────
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var identityContext = services.GetRequiredService<ApplicationDbContext>();
        await identityContext.Database.MigrateAsync();

        // Si usas migraciones en el contexto de personas, descomenta:
        // var personaContext = services.GetRequiredService<PersonaDbContext>();
        // await personaContext.Database.MigrateAsync();

        // Seed de Roles y Admin (Asegúrate de tener esta clase)
        // await DbInitializer.SeedRolesAndAdminAsync(services);
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "Error crítico en el arranque de la BD.");
    }
}

// ── 8. PIPELINE DE MIDDLEWARE ──────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseStatusCodePagesWithReExecute("/Home/Error", "?statusCode={0}");
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

// ── 9. RUTAS ───────────────────────────────────────────────
app.MapRazorPages();
app.MapHub<ConstellationHub>("/constellationHub");
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();