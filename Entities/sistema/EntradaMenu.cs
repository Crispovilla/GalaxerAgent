using System;
using System.Collections.Generic;

namespace Base_MVC_Core9.Entities.sistema;

public partial class EntradaMenu
{
    public int Id { get; set; }

    public int? SistemaId { get; set; }

    public int? ParentId { get; set; }

    public string Nombre { get; set; } = null!;

    public string? Controlador { get; set; }

    public string? Accion { get; set; }

    public string? Icono { get; set; }

    public int Orden { get; set; }

    public bool Vigente { get; set; }

    public DateTime? FechaCreacion { get; set; }

    public int? CreadorId { get; set; }

    public virtual ICollection<EntradaMenu> InverseParent { get; set; } = new List<EntradaMenu>();

    public virtual EntradaMenu? Parent { get; set; }

    public virtual ICollection<RolPermiso> RolPermisos { get; set; } = new List<RolPermiso>();

    public virtual Sistema? Sistema { get; set; }
}
