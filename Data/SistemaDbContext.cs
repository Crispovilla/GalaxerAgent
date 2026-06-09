using System;
using System.Collections.Generic;
using Base_MVC_Core9.Entities.sistema;
using Microsoft.EntityFrameworkCore;

namespace Base_MVC_Core9.Data;

public partial class SistemaDbContext : DbContext
{
    public SistemaDbContext()
    {
    }

    public SistemaDbContext(DbContextOptions<SistemaDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<EntradaMenu> EntradaMenus { get; set; }

    public virtual DbSet<RolPermiso> RolPermisos { get; set; }

    public virtual DbSet<Sistema> Sistemas { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
#warning To protect potentially sensitive information in your connection string, you should move it out of source code. You can avoid scaffolding the connection string by using the Name= syntax to read it from configuration - see https://go.microsoft.com/fwlink/?linkid=2131148. For more guidance on storing connection strings, see https://go.microsoft.com/fwlink/?LinkId=723263.
        => optionsBuilder.UseSqlServer("Server=172.16.213.23;Database=sistema;User Id=sa;Password=djpUTI03;TrustServerCertificate=True;");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<EntradaMenu>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__EntradaM__3214EC07810D7C37");

            entity.ToTable("EntradaMenu");

            entity.Property(e => e.Accion)
                .HasMaxLength(100)
                .IsUnicode(false);
            entity.Property(e => e.Controlador)
                .HasMaxLength(100)
                .IsUnicode(false);
            entity.Property(e => e.FechaCreacion)
                .HasDefaultValueSql("(getdate())")
                .HasColumnType("datetime");
            entity.Property(e => e.Icono)
                .HasMaxLength(50)
                .IsUnicode(false);
            entity.Property(e => e.Nombre)
                .HasMaxLength(100)
                .IsUnicode(false);
            entity.Property(e => e.Vigente).HasDefaultValue(true);

            entity.HasOne(d => d.Parent).WithMany(p => p.InverseParent)
                .HasForeignKey(d => d.ParentId)
                .HasConstraintName("FK__EntradaMe__Paren__619B8048");

            entity.HasOne(d => d.Sistema).WithMany(p => p.EntradaMenus)
                .HasForeignKey(d => d.SistemaId)
                .HasConstraintName("FK__EntradaMe__Siste__60A75C0F");
        });

        modelBuilder.Entity<RolPermiso>(entity =>
        {
            entity.HasKey(e => new { e.RolId, e.EntradaMenuId }).HasName("PK__RolPermi__ECC1AE815E0D38B7");

            entity.ToTable("RolPermiso");

            entity.Property(e => e.FechaCreacion)
                .HasDefaultValueSql("(getdate())")
                .HasColumnType("datetime");

            entity.HasOne(d => d.EntradaMenu).WithMany(p => p.RolPermisos)
                .HasForeignKey(d => d.EntradaMenuId)
                .HasConstraintName("FK_RolPermiso_EntradaMenu");
        });

        modelBuilder.Entity<Sistema>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Sistema__3214EC07F89883BB");

            entity.ToTable("Sistema");

            entity.Property(e => e.FechaCreacion)
                .HasDefaultValueSql("(getdate())")
                .HasColumnType("datetime");
            entity.Property(e => e.Icono)
                .HasMaxLength(50)
                .IsUnicode(false);
            entity.Property(e => e.Nombre)
                .HasMaxLength(100)
                .IsUnicode(false);
            entity.Property(e => e.Vigente).HasDefaultValue(true);
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
