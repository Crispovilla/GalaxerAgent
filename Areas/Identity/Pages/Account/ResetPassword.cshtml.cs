using Base_MVC_Core9.Dtos;
using Base_MVC_Core9.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.Text;


namespace Base_MVC_Core9.Areas.Identity.Pages.Account;

[AllowAnonymous]
public class ResetPasswordModel : PageModel
{

    private readonly IIdentityService _identityService;
    //private readonly UserManager<ApplicationUser> _userManager;
    //private readonly PersonaDbContext _personaContext;

    public ResetPasswordModel( IIdentityService identityService)
    {
        //_userManager = userManager;
        //_personaContext = personaContext;
        _identityService = identityService;
    }

    [BindProperty]
    public InputModel Input { get; set; }

    public class InputModel
    {
        [Required]
        [EmailAddress]
        public string Email { get; set; }

        [Required]
        [StringLength(100, MinimumLength = 6)]
        [DataType(DataType.Password)]
        public string Password { get; set; }

        [DataType(DataType.Password)]
        [Compare("Password", ErrorMessage = "Las contraseñas no coinciden.")]
        public string ConfirmPassword { get; set; }

        public string Code { get; set; }
    }

    public IActionResult OnGet(string code = null, string email = null)
    {
        if (code == null || email == null) return BadRequest("Se debe proporcionar un código y email.");

        Input = new InputModel
        {
            Code = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code)),
            Email = email
        };
        return Page();
    }



    public async Task<IActionResult> OnPostAsync()
    {
        if (!ModelState.IsValid) return Page();

        // Creamos el DTO (la cajita de datos)
        var dto = new ResetPasswordDto(Input.Email, Input.Password, Input.Code);
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();

        // Llamamos al servicio. No sabemos qué pasa por dentro, solo que funciona.
        var result = await _identityService.ResetPasswordWithAuditAsync(dto, ip);

        if (result.Succeeded) return RedirectToPage("./ResetPasswordConfirmation");

        foreach (var error in result.Errors)
            ModelState.AddModelError(string.Empty, error.Description);

        return Page();
    }

}