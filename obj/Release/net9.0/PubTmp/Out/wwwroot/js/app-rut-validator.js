

// Validador RUT nacional


const RutValidatorUI = (function () {
    const init = () => {
        const txtRut = document.getElementById('txtRut');
        const txtDv = document.getElementById('txtDv');
        const lblStatus = document.getElementById('lblStatus');
        const form = document.querySelector('form.show-loader');

        if (!txtRut || !txtDv || !lblStatus) return;

        const calcularDV = (cuerpo) => {
            let suma = 0, multiplo = 2;
            for (let i = cuerpo.length - 1; i >= 0; i--) {
                suma += parseInt(cuerpo.charAt(i)) * multiplo;
                multiplo = (multiplo === 7) ? 2 : multiplo + 1;
            }
            let res = 11 - (suma % 11);
            return res === 11 ? '0' : res === 10 ? 'K' : res.toString();
        };

        
        const renderStatus = (colorClasses, iconName) => {
            lblStatus.className = `input-group-text ${colorClasses}`;

            lblStatus.innerHTML = `<i data-lucide="${iconName}" style="width: 16px;"></i>`;

            if (window.lucide) {
                lucide.createIcons();
            }
        };

        const validarRUT = () => {
            const cuerpo = txtRut.value.replace(/[^0-9]/g, '');
            const dvIngresado = txtDv.value.toUpperCase();

            if (cuerpo.length === 0 && dvIngresado.length === 0) {
                renderStatus("bg-light", "help-circle");
                return false;
            }

            if (cuerpo.length >= 7) {
                const dvCorrecto = calcularDV(cuerpo);
                if (dvIngresado === dvCorrecto) {
                    renderStatus("bg-success-subtle border-success text-success", "check-circle-2");
                    return true;
                }
            }

            renderStatus("bg-danger-subtle border-danger text-danger", "circle-x");
            return false;
        };

        const btnSubmit = form.querySelector('button[type="submit"]');
        if (btnSubmit) {
            btnSubmit.addEventListener('click', function (e) {
                const isRutValid = validarRUT();
                const isJqueryValid = $(form).valid();

                if (!isRutValid || !isJqueryValid) {
                    e.preventDefault();
                    e.stopImmediatePropagation();

                    if (typeof Swal !== 'undefined' && Swal.isVisible()) {
                        Swal.close();
                        document.body.classList.remove('swal2-shown', 'swal2-height-auto');
                    }
                    return false;
                }
            }, true);
        }

        txtRut.addEventListener('input', () => {
            txtRut.value = txtRut.value.replace(/[^0-9]/g, '');
            validarRUT();
        });

        txtDv.addEventListener('input', () => {
            txtDv.value = txtDv.value.replace(/[^0-9kK]/g, '').toUpperCase();
            validarRUT();
        });

        validarRUT();
    };

    return { init };
})();

document.addEventListener("DOMContentLoaded", RutValidatorUI.init);