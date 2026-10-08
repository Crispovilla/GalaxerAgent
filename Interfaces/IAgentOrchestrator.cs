namespace Base_MVC_Core9.Interfaces;

public interface IAgentOrchestrator
{
    Task<string> StartSessionAsync(string targetPath, string prompt);
}