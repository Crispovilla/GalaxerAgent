using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Base_MVC_Core9.Dtos;

namespace Base_MVC_Core9.Services.CodeGraph;

public class RoslynCodeVisitor : CSharpSyntaxWalker
{
    public List<CodeNodeDto> Nodes { get; } = new();
    public List<CodeLinkDto> Links { get; } = new();
    private string _currentClass = string.Empty;

    public override void VisitClassDeclaration(ClassDeclarationSyntax node)
    {
        _currentClass = node.Identifier.Text;
        int type = 1;

        if (_currentClass.EndsWith("Controller")) type = 2;
        else if (_currentClass.EndsWith("Model") || _currentClass.EndsWith("Dto") || _currentClass.EndsWith("ViewModel")) type = 4;

        if (!Nodes.Any(n => n.Id == _currentClass))
        {
            Nodes.Add(new CodeNodeDto { Id = _currentClass, Name = _currentClass, Type = type });
        }

        base.VisitClassDeclaration(node);
    }

    public override void VisitInvocationExpression(InvocationExpressionSyntax node)
    {
        if (!string.IsNullOrEmpty(_currentClass))
        {
            var methodName = node.Expression.ToString();

            // Inferencia de llamada a vistas Razor: View("NombreVista") o View()
            if (methodName == "View" || methodName.EndsWith(".View"))
            {
                var arg = node.ArgumentList.Arguments.FirstOrDefault();
                string viewName = arg != null ? arg.ToString().Replace("\"", "") : "Index";
                string targetViewId = $"{_currentClass.Replace("Controller", "")}/{viewName}";

                if (!Nodes.Any(n => n.Id == targetViewId))
                {
                    Nodes.Add(new CodeNodeDto { Id = targetViewId, Name = targetViewId, Type = 3 });
                }

                Links.Add(new CodeLinkDto { SourceId = _currentClass, TargetId = targetViewId, RelationType = "RendersView" });
            }
        }

        base.VisitInvocationExpression(node);
    }
}