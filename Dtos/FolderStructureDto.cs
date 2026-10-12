namespace Base_MVC_Core9.Dtos;

/// <summary>
/// Nodo del árbol de carpetas devuelto por GET api/agent/structure.
/// Se consume desde el modal de diagrama de la consola /Agent.
/// </summary>
public class FolderStructureDto
{
    public string Name { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    /// <summary>Subcarpetas directas (antes del truncado por límite).</summary>
    public int SubfolderCount { get; set; }
    public List<FolderStructureDto> Children { get; set; } = new();
}
