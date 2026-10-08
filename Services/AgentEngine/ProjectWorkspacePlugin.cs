using System.ComponentModel;
using Microsoft.SemanticKernel;

namespace Base_MVC_Core9.Services.AgentEngine;

public class ProjectWorkspacePlugin
{
    private readonly string? _workspaceRoot;

    public ProjectWorkspacePlugin(string? workspaceRoot = null)
    {
        _workspaceRoot = string.IsNullOrWhiteSpace(workspaceRoot)
            ? null
            : Path.GetFullPath(workspaceRoot.Trim());
    }

    [KernelFunction, Description("Lee el contenido de un archivo dentro del proyecto de código.")]
    public string ReadFile([Description("Ruta del archivo. Absoluta, o relativa a la ruta de trabajo del proyecto (ej: index.html)")] string filePath)
    {
        var resolved = ResolvePath(filePath);
        if (resolved.Error is not null) return resolved.Error;

        return File.Exists(resolved.Path)
            ? File.ReadAllText(resolved.Path)
            : $"Archivo no encontrado: {resolved.Path}";
    }

    [KernelFunction, Description("Escribe o crea un archivo del proyecto con el contenido indicado.")]
    public string WriteFile(
        [Description("Ruta del archivo INCLUYENDO nombre y extensión. Absoluta dentro de la ruta de trabajo, o relativa (ej: index.html). Nunca pases solo una carpeta.")] string filePath,
        [Description("Nuevo contenido completo del archivo")] string content)
    {
        var resolved = ResolvePath(filePath);
        if (resolved.Error is not null) return resolved.Error;

        var dir = Path.GetDirectoryName(resolved.Path);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);

        File.WriteAllText(resolved.Path, content);
        return $"Archivo {Path.GetFileName(resolved.Path)} escrito correctamente en {resolved.Path}.";
    }

    [KernelFunction, Description("Lista los archivos existentes en una carpeta del proyecto.")]
    public string ListFiles([Description("Ruta del directorio. Absoluta, o relativa a la ruta de trabajo del proyecto. Usa la raíz si no hay ruta.")] string folderPath)
    {
        var resolved = ResolvePath(string.IsNullOrWhiteSpace(folderPath) ? _workspaceRoot ?? "" : folderPath);
        if (resolved.Error is not null) return resolved.Error;

        if (!Directory.Exists(resolved.Path)) return $"Directorio no existe: {resolved.Path}";

        var files = Directory.GetFiles(resolved.Path, "*.*", SearchOption.TopDirectoryOnly);
        return files.Length == 0
            ? $"(carpeta vacía) {resolved.Path}"
            : string.Join("\n", files.Select(Path.GetFileName));
    }

    private (string Path, string? Error) ResolvePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return (_workspaceRoot ?? Environment.CurrentDirectory, null);

        try
        {
            var baseDir = _workspaceRoot ?? Environment.CurrentDirectory;
            var full = Path.GetFullPath(Path.IsPathRooted(path) ? path : Path.Combine(baseDir, path));

            if (_workspaceRoot is not null && !IsInsideWorkspace(full))
                return (full, $"Error: la ruta '{full}' está fuera de la ruta de trabajo '{_workspaceRoot}'. Usa una ruta dentro del proyecto.");

            return (full, null);
        }
        catch (Exception ex)
        {
            return (string.Empty, $"Error: ruta inválida '{path}' ({ex.Message}).");
        }
    }

    private bool IsInsideWorkspace(string fullPath)
    {
        var root = _workspaceRoot!.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return string.Equals(fullPath, root, StringComparison.OrdinalIgnoreCase)
            || fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            || fullPath.StartsWith(root + Path.AltDirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }
}
