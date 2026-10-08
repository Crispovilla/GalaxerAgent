using Base_MVC_Core9.Interfaces;
using Base_MVC_Core9.Services;
using Microsoft.AspNetCore.Mvc;

namespace Base_MVC_Core9.Controllers;

public class AgentController : Controller
{
    private readonly IAgentOrchestrator _orchestrator;

    public AgentController(IAgentOrchestrator orchestrator)
    {
        _orchestrator = orchestrator;
    }

    [HttpGet]
    public IActionResult Index()
    {
        return View();
    }

    [HttpPost("api/agent/start")]
    [IgnoreAntiforgeryToken]
    public async Task<IActionResult> Start([FromBody] StartAgentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TargetPath))
            return BadRequest(new { Message = "La ruta del proyecto es obligatoria." });

        string targetPath;
        try
        {
            targetPath = Path.GetFullPath(request.TargetPath.Trim());
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"Ruta inválida: {ex.Message}" });
        }

        try
        {
            if (!Directory.Exists(targetPath)) Directory.CreateDirectory(targetPath);
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"No se pudo crear la ruta '{targetPath}': {ex.Message}" });
        }

        try
        {
            var sessionId = await _orchestrator.StartSessionAsync(targetPath, request.Prompt);
            return Ok(new { SessionId = sessionId });
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"No se pudo iniciar la sesión del agente: {ex.Message}" });
        }
    }

    [HttpGet("api/agent/browse")]
    public IActionResult Browse([FromQuery] string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            var drives = DriveInfo.GetDrives()
                .Where(d => d.IsReady)
                .Select(d => new BrowseItem(d.Name.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar), d.Name));

            return Ok(new BrowseResult(null, null, drives, null));
        }

        string full;
        try
        {
            full = Path.GetFullPath(path.Trim());
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"Ruta inválida: {ex.Message}" });
        }

        if (!Directory.Exists(full))
            return Ok(new BrowseResult(full, GetParent(full), Array.Empty<BrowseItem>(), $"El directorio '{full}' no existe."));

        BrowseItem[] folders;
        try
        {
            folders = Directory.GetDirectories(full)
                .Select(d => new BrowseItem(Path.GetFileName(d), d))
                .OrderBy(i => i.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"No se pudo leer '{full}': {ex.Message}" });
        }

        return Ok(new BrowseResult(full, GetParent(full), folders, null));
    }

    private static string? GetParent(string path)
    {
        var parent = Directory.GetParent(path)?.FullName;
        return string.IsNullOrEmpty(parent) ? null : parent;
    }
}

public record StartAgentRequest(string TargetPath, string Prompt);

public record BrowseItem(string Name, string Path);

public record BrowseResult(string? Path, string? Parent, IEnumerable<BrowseItem> Folders, string? Error);
