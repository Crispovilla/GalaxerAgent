using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Base_MVC_Core9.Dtos;

    public record ResetPasswordDto(string Email, string Password, string Code);

