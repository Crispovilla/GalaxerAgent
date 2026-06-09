using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Base_MVC_Core9.Dtos;

public record UserRegistrationDto(
    string Rut, string Dv, string Nombre1, string? Nombre2,
    string Apellido1, string? Apellido2, string? Uname, 
    string? Genero, string Correo, string Password, string IpAddress);

public record UserUpdateDto(
    int Id, string Token, string Nombre1, string? Nombre2,
    string Apellido1, string? Apellido2, string Rut, string Dv,
    string Correo, string? Genero, string? Telefono, string? Celular,
    DateTime? FechaNacimiento, string? Uname);