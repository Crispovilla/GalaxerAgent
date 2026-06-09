using System.ComponentModel.DataAnnotations;

namespace Base_MVC_Core9.Helpers.ValidarRutNacional;

public class ValidRutAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value == null || string.IsNullOrWhiteSpace(value.ToString()))
            return ValidationResult.Success;

        string rut = value.ToString()!.Replace(".", "").Replace("-", "");

        // Validación básica: que sean solo números
        if (!rut.All(char.IsDigit))
            return new ValidationResult("El cuerpo del RUT debe contener solo números.");

        return ValidationResult.Success;
    }
}