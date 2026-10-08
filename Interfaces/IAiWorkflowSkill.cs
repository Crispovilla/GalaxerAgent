using Microsoft.SemanticKernel;

namespace Base_MVC_Core9.Interfaces;

/// <summary>
/// Workflow automático de proveedores de IA: recorre la lista de proveedores
/// configurada, reintenta ante 429 con backoff y hace failover al siguiente
/// proveedor cuando uno no está disponible.
/// </summary>
public interface IAiWorkflowSkill
{
    /// <summary>
    /// Ejecuta el prompt contra la cadena de proveedores hasta obtener una respuesta.
    /// Devuelve null si todos los proveedores fallaron (ya notificó el motivo via notify).
    /// </summary>
    /// <param name="prompt">Instrucción para el modelo.</param>
    /// <param name="notify">Callback (skill, target) para reportar el estado al HUD.</param>
    /// <param name="filter">Filtro de invocación opcional a adjuntar al kernel (ej: filtro SignalR).</param>
    /// <param name="workspaceRoot">Ruta absoluta sobre la que el agente puede leer/escribir archivos.</param>
    Task<string?> RunAsync(
        string prompt,
        Func<string, string, Task>? notify = null,
        IFunctionInvocationFilter? filter = null,
        string? workspaceRoot = null);
}
