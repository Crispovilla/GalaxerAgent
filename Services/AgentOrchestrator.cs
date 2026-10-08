using Microsoft.AspNetCore.SignalR;
using Base_MVC_Core9.Hubs;
using Base_MVC_Core9.Services.CodeGraph;
using Base_MVC_Core9.Services.AgentEngine;
using Base_MVC_Core9.Interfaces;

namespace Base_MVC_Core9.Services;



public class AgentOrchestrator : IAgentOrchestrator
{
    private readonly ICodeGraphService _codeGraphService;
    private readonly IHubContext<ConstellationHub> _hubContext;
    private readonly IAiWorkflowSkill _aiWorkflow;

    public AgentOrchestrator(ICodeGraphService codeGraphService, IHubContext<ConstellationHub> hubContext, IAiWorkflowSkill aiWorkflow)
    {
        _codeGraphService = codeGraphService;
        _hubContext = hubContext;
        _aiWorkflow = aiWorkflow;
    }

    public Task<string> StartSessionAsync(string targetPath, string prompt)
    {
        var sessionId = Guid.NewGuid().ToString();

        var graph = _codeGraphService.ScanProject(targetPath);

        _ = Task.Run(async () => {
            await Task.Delay(800);
            await _hubContext.Clients.Group(sessionId).SendAsync("OnCodeGraphLoaded", graph);

            Task SendState(string skill, string target) =>
                _hubContext.Clients.Group(sessionId).SendAsync("OnAgentStateChanged", new
                {
                    Skill = skill,
                    Target = target
                });

            await SendState("Agente", "Analizando la petición...");

            try
            {
                var workspaceRoot = Path.GetFullPath(targetPath.Trim());
                var effectivePrompt = $"""
                    Ruta de trabajo absoluta del proyecto: {workspaceRoot}
                    Toda lectura y escritura de archivos debe hacerse dentro de esa ruta usando rutas absolutas (ej: {Path.Combine(workspaceRoot, "index.html")}).
                    Si la ruta indicada no existe, créala con la herramienta WriteFile.

                    Instrucción del usuario:
                    {prompt}
                    """;

                var filter = new ConstellationAgentFilter(_hubContext, sessionId);
                var reply = await _aiWorkflow.RunAsync(effectivePrompt, SendState, filter, workspaceRoot);

                if (string.IsNullOrWhiteSpace(reply))
                {
                    return;
                }

                await _hubContext.Clients.Group(sessionId).SendAsync("OnAgentResponse", new
                {
                    Text = reply
                });
            }
            catch (Exception ex)
            {
                await SendState("Error", ex.Message);
            }
        });

        return Task.FromResult(sessionId);
    }
}
