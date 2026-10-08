using Microsoft.SemanticKernel;
using Base_MVC_Core9.Dtos;
using Base_MVC_Core9.Interfaces;

namespace Base_MVC_Core9.Services.AgentEngine;

public class AiWorkflowSkill : IAiWorkflowSkill
{
    private const int MaxAttemptsPerProvider = 4;

    private readonly IConfiguration _configuration;

    public AiWorkflowSkill(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task<string?> RunAsync(
        string prompt,
        Func<string, string, Task>? notify = null,
        IFunctionInvocationFilter? filter = null,
        string? workspaceRoot = null)
    {
        var providers = LoadProviders();

        if (providers.Count == 0)
        {
            await Notify(notify, "Config", "Falta ApiKey: configura AiProviders o OpenRouter:ApiKey en appsettings.Development.json");
            return null;
        }

        FunctionResult? result = null;
        var quotaExhausted = false;

        for (var p = 0; p < providers.Count && result is null; p++)
        {
            var provider = providers[p];
            await Notify(notify, "Proveedor", $"Conectando vía {provider.Name} · {provider.ModelId}");

            var kernel = BuildKernel(provider, filter, workspaceRoot);
            var arguments = new KernelArguments(new PromptExecutionSettings
            {
                FunctionChoiceBehavior = FunctionChoiceBehavior.Auto()
            });

            var waitSeconds = 6;

            for (var attempt = 1; attempt <= MaxAttemptsPerProvider && result is null; attempt++)
            {
                try
                {
                    result = await kernel.InvokePromptAsync(prompt, arguments);
                }
                catch (HttpOperationException ex)
                {
                    var code = (int?)ex.StatusCode ?? 0;
                    var isRateLimit = ex.StatusCode == System.Net.HttpStatusCode.TooManyRequests;
                    var isFreeModel = provider.ModelId.EndsWith(":free", StringComparison.OrdinalIgnoreCase);

                    if (isRateLimit && isFreeModel)
                    {
                        quotaExhausted = true;
                        await Notify(notify, "Cuota", $"429 en {provider.Name}: cuota diaria de modelos gratuitos agotada → siguiente proveedor");
                        break;
                    }

                    if (isRateLimit && attempt < MaxAttemptsPerProvider)
                    {
                        await Notify(notify, "Reintentando", $"429 en {provider.Name} — reintento {attempt}/{MaxAttemptsPerProvider - 1} en {waitSeconds}s");
                        await Task.Delay(TimeSpan.FromSeconds(waitSeconds));
                        waitSeconds = Math.Min(waitSeconds * 2, 60);
                        continue;
                    }

                    await Notify(notify, "Proveedor", $"{provider.Name} no disponible (HTTP {code}) → siguiente proveedor");
                }
                catch (HttpRequestException ex)
                {
                    await Notify(notify, "Proveedor", $"{provider.Name} sin conexión ({ex.Message}) → siguiente proveedor");
                }
            }
        }

        if (result is null)
        {
            var message = quotaExhausted
                ? "Cuota diaria de OpenRouter (modelos :free) agotada — se renueva a medianoche UTC. Agrega créditos en OpenRouter o una API key de Groq en appsettings.Development.json."
                : "Todos los proveedores de IA fallaron o no tienen cuota disponible.";
            await Notify(notify, "Error", message);
            return null;
        }

        return result.GetValue<string>() ?? result.ToString();
    }

    private static Kernel BuildKernel(AiProviderOptions provider, IFunctionInvocationFilter? filter, string? workspaceRoot)
    {
        var builder = Kernel.CreateBuilder();
        builder.AddOpenAIChatCompletion(provider.ModelId, new Uri(provider.Endpoint), provider.ApiKey);
        builder.Plugins.AddFromObject(new ProjectWorkspacePlugin(workspaceRoot));

        var kernel = builder.Build();

        if (filter is not null)
        {
            kernel.FunctionInvocationFilters.Add(filter);
        }

        return kernel;
    }

    private List<AiProviderOptions> LoadProviders()
    {
        var providers = _configuration.GetSection("AiProviders").Get<List<AiProviderOptions>>()
            ?.Where(p => !string.IsNullOrWhiteSpace(p.ApiKey)
                      && !string.IsNullOrWhiteSpace(p.Endpoint)
                      && !string.IsNullOrWhiteSpace(p.ModelId))
            .ToList() ?? new List<AiProviderOptions>();

        if (providers.Count == 0)
        {
            var legacyKey = _configuration["OpenRouter:ApiKey"];
            if (!string.IsNullOrWhiteSpace(legacyKey))
            {
                providers.Add(new AiProviderOptions
                {
                    Name = "OpenRouter",
                    Endpoint = _configuration["OpenRouter:Endpoint"] ?? "https://openrouter.ai/api/v1/",
                    ApiKey = legacyKey,
                    ModelId = _configuration["OpenRouter:ModelId"] ?? "nvidia/nemotron-3-super-120b-a12b:free"
                });
            }
        }

        return providers;
    }

    private static Task Notify(Func<string, string, Task>? notify, string skill, string target)
        => notify?.Invoke(skill, target) ?? Task.CompletedTask;
}
