

$(function () {
    // 1. NOTIFICACIONES AUTOMÁTICAS (TempData)
    const successMsg = $('#tempSuccess').val();
    const errorMsg = $('#tempError').val();
    const warningMsg = $('#tempWarning').val();

    if (successMsg) {
        Swal.fire({ icon: 'success', title: 'Éxito', text: successMsg, confirmButtonColor: '#1ab394', timer: 3000 });
    }
    if (errorMsg) {
        Swal.fire({ icon: 'error', title: 'Error', text: errorMsg, confirmButtonColor: '#ed5565' });
    }
    if (warningMsg) {
        Swal.fire({ icon: 'warning', title: 'Atención', text: warningMsg, confirmButtonColor: '#f8ac59' });
    }

    // 2. CONFIRMACIÓN GENÉRICA (swal-confirm)
    $(document).on('click', '.swal-confirm', function (e) {
        e.preventDefault();
        const button = $(this);
        const text = button.data('swal-text') || "¿Deseas procesar esta acción?";

        confirmAndSubmit(button, {
            title: 'Confirmar acción',
            text: text,
            icon: 'question',
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#1ab394'
        });
    });

    // 3. CONFIRMACIÓN DE ELIMINACIÓN (swal-delete)
    $(document).on('click', '.swal-delete', function (e) {
        e.preventDefault();
        const button = $(this);

        confirmAndSubmit(button, {
            title: '¿Estás seguro?',
            text: "Esta acción no se puede deshacer.",
            icon: 'warning',
            confirmButtonText: 'Sí, eliminar/desactivar',
            confirmButtonColor: '#ed5565'
        });
    });

    // 4. CONFIRMACIÓN CRÍTICA (swal-critical)
    $(document).on('click', '.swal-critical', function (e) {
        e.preventDefault();
        const button = $(this);

        confirmAndSubmit(button, {
            title: '¿Desactivar de forma permanente?',
            text: "El usuario perderá el acceso a todos los sistemas vinculados.",
            icon: 'error', // Icono de error para denotar gravedad
            confirmButtonText: 'Sí, desactivar ahora',
            confirmButtonColor: '#d33' // Rojo intenso
        });
    });
    // 5. CARGA AUTOMÁTICA PARA FORMULARIOS SIMPLES (NUEVO)
    // Úsalo agregando class="show-loader" a cualquier <form>
    $(document).on('submit', '.show-loader', function (e) {
        var form = $(this);

        // Verificamos si el formulario es válido (integración con jquery.validate)
        if (form.valid()) {
            Swal.fire({
                title: 'Procesando...',
                text: 'Creando cuenta y enviando correo de activación.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
        } else {
            // Si no es válido, no hacemos nada y dejamos que se vean los errores
            return false;
        }
    });

    // FUNCIÓN AUXILIAR PARA HACER EL SUBMIT
    function confirmAndSubmit(button, options) {
        Swal.fire({
            title: options.title,
            text: options.text,
            icon: options.icon,
            showCancelButton: true,
            confirmButtonColor: options.confirmButtonColor,
            cancelButtonColor: '#6c757d',
            confirmButtonText: options.confirmButtonText,
            cancelButtonText: 'Cancelar',
            allowOutsideClick: () => !Swal.isLoading()
        }).then((result) => {
            if (result.isConfirmed) {
                // MOSTRAR BARRA DE CARGA
                Swal.fire({
                    title: 'Procesando...',
                    text: 'Por favor, espera un momento.',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    didOpen: () => {
                        Swal.showLoading(); // Muestra el spinner animado
                    }
                });
                const form = button.closest('form');
                // Si el botón tiene un formaction (como el de RemoveRole), lo aplicamos al form
                const action = button.attr('formaction');
                if (action) form.attr('action', action);

                form.submit();
            }
        });
    }
});