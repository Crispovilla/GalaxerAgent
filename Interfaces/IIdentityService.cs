using Base_MVC_Core9.Dtos;
using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Base_MVC_Core9.Interfaces;
public interface IIdentityService
{
    Task<IdentityResult> ResetPasswordWithAuditAsync(ResetPasswordDto dto, string ipAddress);
}
