using Base_MVC_Core9.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Base_MVC_Core9.Persistence.Configurations
{
    public class PersonaConfiguration : IEntityTypeConfiguration<Persona>
    {
        public void Configure(EntityTypeBuilder<Persona> builder)
        {
            builder.ToTable("persona", "dbo");
            builder.HasKey(e => e.Id);

            // Mapeo de columnas específicas
            builder.HasKey(e => e.Id);
            builder.Property(e => e.Id).HasColumnName("id").ValueGeneratedOnAdd();
            builder.Property(e => e.Rut).HasColumnName("rut");
            builder.Property(e => e.Dv).HasColumnName("dv");
            builder.Property(e => e.Token).HasColumnName("token");
            builder.Property(e => e.Nombre1).HasColumnName("nombre1");
            builder.Property(e => e.Nombre2).HasColumnName("nombre2");
            builder.Property(e => e.Apellido1).HasColumnName("apellido1");
            builder.Property(e => e.Apellido2).HasColumnName("apellido2");
            builder.Property(e => e.Genero).HasColumnName("genero");
            builder.Property(e => e.FechaNacimiento).HasColumnName("fecha_nacimiento");
            builder.Property(e => e.Uname).HasColumnName("uname");
            builder.Property(e => e.Correo).HasColumnName("correo");
            builder.Property(e => e.Telefono).HasColumnName("telefono");
            builder.Property(e => e.Celular).HasColumnName("celular");
            builder.Property(e => e.Vigente).HasColumnName("vigente");

            builder.Property(e => e.FechaCreacion).HasColumnName("fecha_creacion");
            builder.Property(e => e.CreadoPorId).HasColumnName("creador_id").HasColumnType("int"); ;
        }
    }
}