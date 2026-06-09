using System.Collections.Generic;
using System.Threading.Tasks;

namespace Base_MVC_Core9.Interfaces // Ajusta a tu namespace
{
    public interface IEmailSenderCustom
    {
        // Tu método personalizado con la lista de correos
        Task<bool> SendEmailAsync(IEnumerable<string> emails, string subject, string htmlMessage);

        // La sobrecarga para un solo correo
        Task SendEmailAsync(string email, string subject, string htmlMessage);
    }
}