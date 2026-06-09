using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Base_MVC_Core9.Entities
{
    public class LogCambioClave
    {
        public int Id { get; set; }

        // El ID del usuario en AspNetUsers
        public string UsuarioId { get; set; } = null!;

        // El correo en ese momento (para auditoría rápida sin JOINS)
        public string Correo { get; set; } = null!;

        public DateTime FechaCambio { get; set; } = DateTime.Now;

        // 'true' si es el cambio forzado inicial tras confirmación de email
        public bool? EsPrimerCambio { get; set; }

        // IP desde donde se realizó el cambio (buena práctica)
        public string? IpAddress { get; set; }

        // Relación opcional con Persona para consultas directas
        public int PersonaId { get; set; }
        public virtual Persona Persona { get; set; } = null!;
    }
}