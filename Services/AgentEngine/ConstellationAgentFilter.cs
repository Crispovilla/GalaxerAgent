using Microsoft.AspNetCore.SignalR;
using Microsoft.SemanticKernel;
using Base_MVC_Core9.Hubs;

namespace Base_MVC_Core9.Services.AgentEngine;

public class ConstellationAgentFilter : IFunctionInvocationFilter
{
    private readonly IHubContext<ConstellationHub> _hubContext;
    private readonly string _sessionId;
    private readonly Action<string, string>? _onState;

    public ConstellationAgentFilter(IHubContext<ConstellationHub> hubContext, string sessionId, Action<string, string>? onState = null)
    {
        _hubContext = hubContext;
        _sessionId = sessionId;
        _onState = onState;
    }

    public async Task OnFunctionInvocationAsync(FunctionInvocationContext context, Func<FunctionInvocationContext, Task> next)
    {
        // Solo las herramientas del workspace: las funciones prompt (InvokePromptAsync, etc.)
        // no deben generar eventos de navegación de la misión.
        if (!string.Equals(context.Function.PluginName, nameof(ProjectWorkspacePlugin), StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var skillName = context.Function.Name;
        var rawTarget = context.Arguments
            .FirstOrDefault(a => a.Key == "filePath" || a.Key == "folderPath")
            .Value?.ToString();

        var cleanTarget = string.IsNullOrWhiteSpace(rawTarget)
            ? "Workspace"
            : Path.GetFileNameWithoutExtension(rawTarget);

        _onState?.Invoke(skillName, cleanTarget);

        await _hubContext.Clients.Group(_sessionId).SendAsync("OnAgentStateChanged", new
        {
            SessionId = _sessionId,
            Skill = skillName,
            Target = cleanTarget
        });

        await next(context);
    }
}