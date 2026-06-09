namespace Base_MVC_Core9.Dtos
{
    public class SistemaDto
    {
        public int SistemaId { get; set; }
        public string SistemaNombre { get; set; } = string.Empty;
        public string? SistemaIcono { get; set; }

        // Aquí caen todos los submenús raíz de este sistema
        public List<MenuNodoDto> SubMenus { get; set; } = new();
    }

    // 2. La clase mágica autorreferencial (Nodos del menú)
    public class MenuNodoDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string? Icono { get; set; }

        // Propiedades de enrutamiento de ASP.NET Core
        public string? Controlador { get; set; }
        public string? Accion { get; set; }

        // El secreto de la recursividad: un nodo contiene una lista de sí mismo
        public List<MenuNodoDto> Hijos { get; set; } = new();

        // Propiedad auxiliar muy útil para saber si este nodo es una vista clickeable 
        // o si es solo un contenedor colapsable (un submenú)
        public bool EsSubMenu => string.IsNullOrEmpty(Controlador) && string.IsNullOrEmpty(Accion);
    }
}
