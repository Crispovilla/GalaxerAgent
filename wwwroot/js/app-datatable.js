$(function () {
    // Configuración estándar para cualquier tabla con la clase .custom-dt
    $('.default-datatable').each(function () {
        const table = $(this);
        const title = table.data('dt-title') || 'Reporte_Sistema';
        const length = table.data('dt-length') || 10;

        table.DataTable({
            pageLength: length,
            responsive: true,
            dom: '<"html5buttons"B>lTfgitp',
            buttons: [
                //{ extend: 'excel', title: title, className: 'btn btn-white btn-sm' },
                //{ extend: 'pdf', title: title, className: 'btn btn-white btn-sm' },
                //{
                //    extend: 'print',
                //    className: 'btn btn-white btn-sm',
                //    customize: function (win) {
                //        $(win.document.body).addClass('white-bg');
                //        $(win.document.body).css('font-size', '10px');
                //        $(win.document.body).find('table').addClass('compact').css('font-size', 'inherit');
                //    }
                //}
            ],
            scrollCollapse: true,
            scrollY: '350px',
            language: {
                // Traducción manual para evitar el error de CORS y dependencias
                "processing": "Procesando...",
                "lengthMenu": "Mostrar _MENU_ registros",
                "zeroRecords": "No se encontraron resultados",
                "emptyTable": "Ningún dato disponible en esta tabla",
                "info": "Mostrando _START_ a _END_ de _TOTAL_ entradas",
                "infoEmpty": "Mostrando 0 a 0 de 0 entradas",
                "infoFiltered": "(filtrado de un total de _MAX_ entradas)",
                "search": "Buscar:",
                "loadingRecords": "Cargando...",
                "paginate": {
                    "first": '<i class="ti ti-chevrons-left"></i>',
                    "previous": '<i class="ti ti-chevron-left"></i>',
                    "next": '<i class="ti ti-chevron-right"></i>',
                    "last": '<i class="ti ti-chevrons-right"></i>'
                }
            }
        });
    });
});