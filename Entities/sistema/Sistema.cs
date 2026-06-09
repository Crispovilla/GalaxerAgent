using System;
using System.Collections.Generic;

namespace Base_MVC_Core9.Entities.sistema;

public partial class Sistema
{
    public int Id { get; set; }

    public string Nombre { get; set; } = null!;

    public string? Icono { get; set; }

    public int Orden { get; set; }

    public bool Vigente { get; set; }

    public DateTime? FechaCreacion { get; set; }

    public int? CreadorId { get; set; }

    public virtual ICollection<EntradaMenu> EntradaMenus { get; set; } = new List<EntradaMenu>();
}
