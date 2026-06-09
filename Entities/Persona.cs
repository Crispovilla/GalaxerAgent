
using Base_MVC_Core9.Exceptions;
using Base_MVC_Core9.Helpers.ValidarRutNacional;
using Base_MVC_Core9.Interfaces;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Base_MVC_Core9.Entities
{
    public class Persona : IAuditableEntity
    {
        [Key]
        public int Id { get; set; }
        private string? _rut;
        public string? Rut
        {
            get => _rut;
            set => _rut = value?.Replace(".", "").Replace("-", "").Trim();
        }

        public string? Dv { get; set; }

        public void ValidarYCompletarRut()
        {
            if (string.IsNullOrWhiteSpace(Rut)) return;

            string todoJunto = $"{Rut}{Dv}".Replace(".", "").Replace("-", "").ToUpper().Trim();

            if (todoJunto.Length < 2)
                throw new DomainException("Formato de RUT incompleto.");

            string cuerpo = todoJunto[..^1];
            string dvEntregado = todoJunto[^1..];

            if (dvEntregado != RutValidator.CalcularDV(cuerpo))
                throw new DomainException($"La combinación RUT {cuerpo}-{dvEntregado} no es válida.");

            this.Rut = cuerpo;
            this.Dv = dvEntregado;
        }

        [Required]
        [StringLength(450)]
        public string Token { get; set; }
        public string? Nombre1 { get; set; }
        public string? Nombre2 { get; set; }
        public string? Apellido1 { get; set; } = null!;
        public string? Apellido2 { get; set; }
        public string? Genero { get; set; }
        public DateTime? FechaNacimiento { get; set; }
        public string? Uname { get; set; } = null!;
        public string? Correo { get; set; } = null!;
        public string? Telefono { get; set; }
        public string? Celular { get; set; }
        public bool Vigente { get; set; } = true;

        // Propiedades de la Interfaz IAuditableEntity

        [Column("creador_id")]
        public int? CreadoPorId { get; set; }

        [Column("fecha_creacion")]
        public DateTime? FechaCreacion { get; set; }

    }
}
