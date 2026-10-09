using System.Collections.Concurrent;
using Base_MVC_Core9.Dtos;
using Base_MVC_Core9.Interfaces;

namespace Base_MVC_Core9.Services;

public class AgentSessionRegistry : IAgentSessionRegistry
{
    private readonly ConcurrentDictionary<string, AgentSessionDto> _sessions = new();

    public AgentSessionDto Register(string sessionId, string targetPath, string prompt)
    {
        var now = DateTime.UtcNow;
        var session = new AgentSessionDto
        {
            SessionId = sessionId,
            TargetPath = targetPath,
            Prompt = prompt,
            Status = AgentSessionStatus.Working,
            CreatedAt = now,
            UpdatedAt = now
        };

        _sessions[sessionId] = session;
        return session;
    }

    public void UpdateState(string sessionId, string skill, string target)
    {
        if (_sessions.TryGetValue(sessionId, out var session))
        {
            session.LastSkill = skill;
            session.LastTarget = target;
            session.UpdatedAt = DateTime.UtcNow;
        }
    }

    public void SetStatus(string sessionId, string status)
    {
        if (_sessions.TryGetValue(sessionId, out var session))
        {
            /* Una sesión cerrada desde la UI no se reabre al terminar la tarea */
            if (session.Status == AgentSessionStatus.Closed) return;
            session.Status = status;
            session.UpdatedAt = DateTime.UtcNow;
        }
    }

    public IReadOnlyList<AgentSessionDto> List() =>
        _sessions.Values.OrderByDescending(s => s.CreatedAt).ToList();

    public IReadOnlyList<AgentSessionDto> Active() =>
        _sessions.Values
            .Where(s => s.Status == AgentSessionStatus.Working)
            .OrderByDescending(s => s.CreatedAt)
            .ToList();
}
