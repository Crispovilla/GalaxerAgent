using Base_MVC_Core9.Dtos;

namespace Base_MVC_Core9.Interfaces;

public interface IAgentSessionRegistry
{
    AgentSessionDto Register(string sessionId, string targetPath, string prompt);
    void UpdateState(string sessionId, string skill, string target);
    void SetStatus(string sessionId, string status);
    IReadOnlyList<AgentSessionDto> List();
    IReadOnlyList<AgentSessionDto> Active();
}
