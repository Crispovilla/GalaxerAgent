namespace Base_MVC_Core9.Interfaces
{
    public interface IAuditableEntity
    {
        int? CreadoPorId { get; set; }
        DateTime? FechaCreacion { get; set; }
    }
}