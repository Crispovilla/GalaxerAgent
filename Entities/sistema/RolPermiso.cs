using System;
using System.Collections.Generic;

namespace Base_MVC_Core9.Entities.sistema;

public partial class RolPermiso
{
    public string RolId { get; set; } = null!;

    public int EntradaMenuId { get; set; }

    public DateTime? FechaCreacion { get; set; }

    public int? CreadorId { get; set; }

    public virtual EntradaMenu EntradaMenu { get; set; } = null!;
}
