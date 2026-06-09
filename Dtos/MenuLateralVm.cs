namespace Base_MVC_Core9.Dtos
{
    public class MenuSistemaViewModel
    {
        public int SistemaId { get; set; }
        public string SistemaNombre { get; set; }
        public string SistemaIcono { get; set; }

        public List<MenuPadreViewModel> Padres { get; set; } = new List<MenuPadreViewModel>();
    }

    public class MenuPadreViewModel
    {
        public int ActionPadreId { get; set; }
        public string ActionPadreNombre { get; set; }
        public string ActionPadreIcono { get; set; }
        public string ControladorPadre { get; set; }
        public List<MenuHijoViewModel> Hijos { get; set; } = new List<MenuHijoViewModel>();
    }

    public class MenuHijoViewModel
    {
        public int ActionHijoId { get; set; }
        public string ActionHijoNombre { get; set; }
        public string ControladorHijo { get; set; }
        public string ActionHijoMetodo { get; set; }
    }
}
