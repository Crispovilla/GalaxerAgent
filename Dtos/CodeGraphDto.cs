namespace Base_MVC_Core9.Dtos;

public class CodeNodeDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Type { get; set; } // 1: Generic, 2: Controller, 3: View, 4: Model
    public List<string> ExportedSymbols { get; set; } = new();
}

public class CodeLinkDto
{
    public string SourceId { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string RelationType { get; set; } = string.Empty; // "RendersView", "UsesModel", "Calls"
}

public class CodeGraphDto
{
    public List<CodeNodeDto> Nodes { get; set; } = new();
    public List<CodeLinkDto> Links { get; set; } = new();
}