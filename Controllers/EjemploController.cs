using Base_MVC_Core9.Constants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Base_MVC_Core9.Controllers
{
    [Authorize(Roles = Roles.User)]
    public class EjemploController : BaseController
    {
        // GET: /Ejemplo
        public IActionResult Index()
        {
            return View();
        }
    }
}
