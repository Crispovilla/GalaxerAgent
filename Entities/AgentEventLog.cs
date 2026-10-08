namespace Base_MVC_Core9.Entities;

public class AgentEventLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AgentSessionId { get; set; }
    public AgentSession? AgentSession { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string TargetNode { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}