using Microsoft.CodeAnalysis.CSharp;
using Base_MVC_Core9.Dtos;
using Base_MVC_Core9.Interfaces;

namespace Base_MVC_Core9.Services.CodeGraph;

public interface ICodeGraphService
{
    CodeGraphDto ScanProject(string projectPath);
}

public class CodeGraphService : ICodeGraphService
{
    public CodeGraphDto ScanProject(string projectPath)
    {
        var result = new CodeGraphDto();
        if (!Directory.Exists(projectPath)) return result;

        var visitor = new RoslynCodeVisitor();
        var csFiles = Directory.GetFiles(projectPath, "*.cs", SearchOption.AllDirectories)
                               .Where(f => !f.Contains("\\obj\\") && !f.Contains("\\bin\\"));

        foreach (var file in csFiles)
        {
            var code = File.ReadAllText(file);
            var tree = CSharpSyntaxTree.ParseText(code);
            visitor.Visit(tree.GetRoot());
        }

        var razorFiles = Directory.GetFiles(projectPath, "*.cshtml", SearchOption.AllDirectories)
                                  .Where(f => !f.Contains("\\obj\\") && !f.Contains("\\bin\\"));

        foreach (var file in razorFiles)
        {
            var fileName = Path.GetFileNameWithoutExtension(file);
            var parentDir = Path.GetFileName(Path.GetDirectoryName(file));
            var viewId = $"{parentDir}/{fileName}";

            if (!visitor.Nodes.Any(n => n.Id == viewId))
            {
                visitor.Nodes.Add(new CodeNodeDto { Id = viewId, Name = viewId, Type = 3 });
            }
        }

        result.Nodes = visitor.Nodes.DistinctBy(n => n.Id).ToList();
        result.Links = visitor.Links;
        return result;
    }
}