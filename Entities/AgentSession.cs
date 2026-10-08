namespace Base_MVC_Core9.Entities;

public class AgentSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TargetProjectPath { get; set; } = string.Empty;
    public string UserPrompt { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? FinishedAt { get; set; }
    public ICollection<AgentEventLog> Logs { get; set; } = new List<AgentEventLog>();
}