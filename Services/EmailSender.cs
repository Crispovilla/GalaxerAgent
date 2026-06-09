using Microsoft.AspNetCore.Identity.UI.Services;
using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Base_MVC_Core9.Interfaces;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Linq;
using Microsoft.Data.SqlClient; // Necesario para la contingencia SQL
using System.Data;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;

namespace Base_MVC_Core9.Services
{
    public class EmailSender : IEmailSenderCustom, IEmailSender
    {
        private readonly IConfiguration _config;
        private readonly string _connectionString;
        private readonly string _sistema = "Sistema Base";

        public EmailSender(IConfiguration config)
        {
            _config = config;
            // Obtenemos la conexión a la BD directamente desde tu configuración
            _connectionString = _config.GetConnectionString("SistemaConnection") ?? string.Empty;
        }

        // --- MÉTODO PRINCIPAL ---
        public async Task<bool> SendEmailAsync(IEnumerable<string> emails, string subject, string htmlMessage)
        {
            // Concatenamos el nombre del sistema al asunto para mantener consistencia y fácil identificación en la bandeja de entrada
            subject = $"[{_sistema}] {subject}";

            // Convertimos a lista para poder manipular los elementos cómodamente
            var listaDestinatarios = emails?.ToList() ?? new List<string>();

            // 🎯 TU NUEVO COMPORTAMIENTO DE RAÍZ:
            // Si no vienen correos, reescribimos los parámetros sobre la marcha
            if (!listaDestinatarios.Any())
            {
                // 1. Añadimos al equipo de desarrollo como destinatario principal
                listaDestinatarios.Add("desarrollo@derecho.uchile.cl");

                // 2. Modificamos el cuerpo inyectando el asunto original en el diseño
                htmlMessage = $@"
            <div style='border: 2px solid #ff9800; padding: 15px; font-family: Arial, sans-serif; border-radius: 5px;'>
                <h2 style='color: #d32f2f; margin-top: 0;'>🚨 ALERTA: Intento de envío sin destinatarios</h2>
                <p><strong>Asunto Original:</strong> {subject}</p>
                <hr style='border: 0; border-top: 1px solid #eee;' />
                <h3>Contenido original:</h3>
                {htmlMessage}
            </div>";

                // 3. Cambiamos el asunto del correo saliente
                subject = $"{_sistema} 🚨 Correo sin destinatarios";
            }

            // Si pasa el escudo, preparamos el envío SMTP tradicional
            var esProduccion = _config["EmailSettings:Servidor"] == "produccion";
            var correoPruebas = "desarrollo@derecho.uchile.cl";
            var usuarioSmtp = "dynamo@derecho.uchile.cl";
            var claveSmtp = "xana suub dipj qzom";

            using (var message = new MailMessage())
            {
                message.From = new MailAddress(usuarioSmtp, $"{_sistema} Derecho U. de Chile");
                message.Subject = esProduccion ? subject : $"[TEST] {subject}";
                message.Body = htmlMessage + "<br/><br/><hr/><i>Este correo ha sido generado automáticamente.</i>";
                message.IsBodyHtml = true;

                if (esProduccion)
                {
                    foreach (var email in emails)
                    {
                        if (!string.IsNullOrWhiteSpace(email))
                        {
                            message.To.Add(new MailAddress(email.Trim()));
                        }
                    }
                }
                else
                {
                    message.To.Add(new MailAddress(correoPruebas));
                    var correosOriginales = string.Join(", ", emails);
                    message.Body += $"<br/><strong>Nota:</strong> Este correo era originalmente para: {correosOriginales}";
                }

                // 🛡️ INTENTO DE ENVÍO CON PLAN DE CONTINGENCIA
                try
                {
                    using (var client = new SmtpClient("smtp.gmail.com", 587))
                    {
                        client.Credentials = new NetworkCredential(usuarioSmtp, claveSmtp);
                        client.EnableSsl = true;
                        await client.SendMailAsync(message);
                    }

                    return true; // Envío exitoso por SMTP
                }
                catch (Exception ex)
                {
                    // 💥 PLAN B: El SMTP falló (Caído, sin red, etc.)
                    // Formateamos un reporte del error con el mensaje original para no perder nada
                    var destinatariosFinales = string.Join(", ", emails);

                    string cuerpoAlerta = $@"
                        <p><strong>Error Técnico:</strong> {ex.Message}</p>
                        <hr/>
                        <h3>DATOS DEL CORREO PERDIDO:</h3>
                        <p><strong>Para:</strong> {destinatariosFinales}</p>
                        <p><strong>Asunto original:</strong> {message.Subject}</p>
                        <p><strong>Contenido original:</strong></p>
                        <div style='background:#f4f4f4; padding:15px; border:1px solid #ccc;'>
                            {message.Body}
                        </div>";

                    // Gatillamos el SP por base de datos de manera asíncrona
                    await EnviarAlertaPorSQLAsync($"[{_sistema}] 🚨 ALERTA: Caída de SMTP", cuerpoAlerta);

                    return false; // Retornamos false para avisar que el flujo principal mutó a contingencia
                }
            }
        }

        // --- MÉTODO PRIVADO CONTENEDOR (Solo se encarga de ejecutar el SP) ---
        private async Task EnviarAlertaPorSQLAsync(string asunto, string cuerpoHtml)
        {
            try
            {
                using (var connection = new SqlConnection(_connectionString))
                {
                    using (var command = new SqlCommand("sp_EnviarCorreoContingencia", connection))
                    {
                        command.CommandType = CommandType.StoredProcedure;
                        command.Parameters.AddWithValue("@Asunto", asunto);
                        command.Parameters.AddWithValue("@Cuerpo", cuerpoHtml);

                        await connection.OpenAsync();
                        await command.ExecuteNonQueryAsync();
                    }
                }
            }
            catch (Exception ex)
            {
                // Si la base de datos también fallara, lo ideal es escribir en el visor de eventos 
                // o un archivo de Log local (ej: Serilog) para no congelar el servidor.
                //throw new Exception($"Error al ejecutar Contingencia SQL: {ex.Message}", ex);
                System.Diagnostics.Debug.WriteLine($"[CONTINGENCIA CRÍTICA] No se pudo guardar en SQL: {ex.Message}");
            }
        }

        // --- SOBRECARGA OBLIGATORIA DE MICROSOFT IDENTITY ---
        public async Task SendEmailAsync(string email, string subject, string htmlMessage)
        {
            await SendEmailAsync(new List<string> { email }, subject, htmlMessage);
        }
    }
}