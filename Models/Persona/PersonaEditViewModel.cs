
using System.ComponentModel.DataAnnotations;

namespace Base_MVC_Core9.Models.Persona;

public class PersonaEditViewModel
{
    public int Id { get; set; }
    public string? Token { get; set; }

    [Required(ErrorMessage = "El nombre de usuario no puede estar vacío")]

    public string? Uname { get; set; }

    public string FullName => $"{Nombre1} {Apellido1}";

    [Required(ErrorMessage = "El RUT es obligatorio y debe ser válido")]

    public required string Rut { get; set; }
    [Required(ErrorMessage = "El dígito verificador debe ser válido")]
    public required string Dv { get; set; }

    [Required(ErrorMessage = "El correo no puede estar vacío")]
    [EmailAddress(ErrorMessage = "Formato de correo inválido")]
    public string? Correo { get; set; }

    [Required(ErrorMessage = "El nombre no puede estar vacío")]
    [StringLength(30, ErrorMessage = "El nombre no puede exceder 30 caracteres")]
    public string? Nombre1 { get; set; }
    [StringLength(30, ErrorMessage = "El nombre no puede exceder 30 caracteres")]
    public string? Nombre2 { get; set; }

    [Required(ErrorMessage = "El apellido no puede estar vacío")]
    [StringLength(30, ErrorMessage = "El apellido no puede exceder 30 caracteres")]
    public string? Apellido1 { get; set; }

    [StringLength(30, ErrorMessage = "El apellido no puede exceder 30 caracteres")]
    public string? Apellido2 { get; set; }
    public string? Telefono { get; set; }
    public string? Celular { get; set; }
    
    [Required(ErrorMessage = "Seleccione una opción")]
    public string? Genero { get; set; }
    public DateTime? FechaNacimiento { get; set; }
}
