namespace Base_MVC_Core9.Dtos;

public class AgentSessionDto
{
    public string SessionId { get; set; } = string.Empty;
    public string TargetPath { get; set; } = string.Empty;
    public string Prompt { get; set; } = string.Empty;
    public string Status { get; set; } = AgentSessionStatus.Working;
    public string? LastSkill { get; set; }
    public string? LastTarget { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public static class AgentSessionStatus
{
    public const string Working = "Working";
    public const string Done = "Done";
    public const string Error = "Error";
    public const string Closed = "Closed";
}
