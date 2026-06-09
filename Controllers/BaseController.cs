using Microsoft.AspNetCore.Mvc;

namespace Base_MVC_Core9.Controllers
{
    public abstract class BaseController : Controller
    {
        public void NotifySuccess(string message) => TempData["Success"] = message;
        public void NotifyError(string message) => TempData["Error"] = message;
        public void NotifyWarning(string message) => TempData["Warning"] = message;
    }
}
