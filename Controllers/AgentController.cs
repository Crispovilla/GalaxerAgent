using Base_MVC_Core9.Dtos;
using Base_MVC_Core9.Interfaces;
using Base_MVC_Core9.Services;
using Microsoft.AspNetCore.Mvc;

namespace Base_MVC_Core9.Controllers;

public class AgentController : Controller
{
    private readonly IAgentOrchestrator _orchestrator;
    private readonly IAgentSessionRegistry _sessions;

    public AgentController(IAgentOrchestrator orchestrator, IAgentSessionRegistry sessions)
    {
        _orchestrator = orchestrator;
        _sessions = sessions;
    }

    [HttpGet]
    public IActionResult Index()
    {
        return View();
    }

    [HttpGet("api/agent/sessions")]
    public IActionResult Sessions()
    {
        return Ok(_sessions.List());
    }

    [HttpPost("api/agent/sessions/{sessionId}/close")]
    [IgnoreAntiforgeryToken]
    public IActionResult CloseSession(string sessionId)
    {
        _sessions.SetStatus(sessionId, AgentSessionStatus.Closed);
        return Ok(new { SessionId = sessionId, Status = AgentSessionStatus.Closed });
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

    [HttpGet("api/agent/structure")]
    public IActionResult Structure([FromQuery] string? path, [FromQuery] int depth = 3)
    {
        if (string.IsNullOrWhiteSpace(path))
            return BadRequest(new { Message = "La ruta es obligatoria." });

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
        {
            var missingName = Path.GetFileName(full);
            return Ok(new FolderStructureDto { Name = string.IsNullOrEmpty(missingName) ? full : missingName, Path = full });
        }

        /* Límites duros: el diagrama es visual, no un inventario completo */
        depth = Math.Clamp(depth, 1, 6);
        const int maxNodes = 400;
        var budget = new[] { maxNodes };

        try
        {
            var root = BuildStructureNode(full, depth, budget);
            return Ok(root);
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"No se pudo leer '{full}': {ex.Message}" });
        }
    }

    private static readonly HashSet<string> IgnoredFolders = new(StringComparer.OrdinalIgnoreCase)
    {
        "bin", "obj", "node_modules", ".git", ".vs", ".idea", ".svn",
        "packages", "dist", "build", ".next", ".nuget", "target"
    };

    private static FolderStructureDto BuildStructureNode(string dir, int remainingDepth, int[] budget)
    {
        var clean = dir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var nodeName = Path.GetFileName(clean);
        var node = new FolderStructureDto
        {
            Name = string.IsNullOrEmpty(nodeName) ? clean : nodeName,
            Path = dir
        };

        if (remainingDepth <= 1 || budget[0] <= 0) return node;

        var children = Directory.GetDirectories(dir)
            .Where(d => !IgnoredFolders.Contains(Path.GetFileName(d)))
            .OrderBy(d => Path.GetFileName(d), StringComparer.OrdinalIgnoreCase);

        foreach (var child in children)
        {
            if (budget[0] <= 0) break;
            budget[0]--;
            node.Children.Add(BuildStructureNode(child, remainingDepth - 1, budget));
        }

        node.SubfolderCount = node.Children.Count;
        return node;
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
