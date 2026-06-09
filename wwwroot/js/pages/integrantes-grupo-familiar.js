let listaIntegrantes = [];        // estado temporal (solo dentro del modal)
let listaIntegrantesGuardados = []; // estado real persistido

function abrirModalIntegrantes() {
    // Siempre partir desde lo guardado — descarta cualquier cambio previo sin guardar
    listaIntegrantes = listaIntegrantesGuardados.map(i => ({ ...i }));
    renderizarFilasModal();
    actualizarBotonGuardar();
    var myModal = new bootstrap.Modal(document.getElementById('modalIntegrantes'));
    myModal.show();
}

function agregarFilaIntegrante() {
    listaIntegrantes.push({ edad: "" });
    renderizarFilasModal();
    actualizarBotonGuardar();
}

function quitarIntegrante(index) {
    listaIntegrantes.splice(index, 1);
    renderizarFilasModal();
    actualizarBotonGuardar();
}

function actualizarEdadLocal(index, valor) {
    listaIntegrantes[index].edad = valor;
    actualizarBotonGuardar();
}

function actualizarBotonGuardar() {
    const btn = document.getElementById('btn-guardar-integrantes');
    // Bloqueado solo si hay alguna fila con edad vacía o inválida
    // Lista vacía (0 integrantes) SÍ es válida → permite guardar y limpiar el contador
    const hayInvalidos = listaIntegrantes.some(i => i.edad === "" || i.edad === null || i.edad === undefined);
    btn.disabled = hayInvalidos;
}

async function validarIntegrantes() {
    for (let i = 0; i < listaIntegrantes.length; i++) {
        const edad = listaIntegrantes[i].edad;

        if (edad === "" || edad === null || edad === undefined) {
            await Swal.fire({
                icon: 'warning',
                title: 'Edad requerida',
                text: `El integrante ${i + 1} no tiene una edad ingresada.`,
                confirmButtonText: 'Entendido'
            });
            return false;
        }

        const edadNum = Number(edad);
        if (!Number.isInteger(edadNum) || edadNum < 0 || edadNum > 130) {
            await Swal.fire({
                icon: 'error',
                title: 'Edad inválida',
                text: `La edad del integrante ${i + 1} debe ser un número entero entre 0 y 130.`,
                confirmButtonText: 'Entendido'
            });
            return false;
        }
    }
    return true;
}

function renderizarFilasModal() {
    const container = document.getElementById('lista-integrantes-container');
    container.innerHTML = "";

    if (listaIntegrantes.length === 0) {
        container.innerHTML = `<div class="text-center p-4 text-muted border rounded">No hay integrantes. Haga clic en "Añadir Miembro".</div>`;
        return;
    }

    listaIntegrantes.forEach((int, index) => {
        const div = document.createElement('div');
        div.className = "row g-2 mb-2 align-items-center animate__animated animate__fadeIn";
        div.innerHTML = `
            <div class="col-6">
                <span class="fw-bold text-secondary">Integrante ${index + 1}</span>
            </div>
            <div class="col-4">
                <input type="number" class="form-control form-control-sm" 
                       placeholder="Edad (0-130)" 
                       value="${int.edad}" 
                       min="0" max="130" step="1"
                       oninput="actualizarEdadLocal(${index}, this.value)">
            </div>
            <div class="col-2 text-end">
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="quitarIntegrante(${index})">
                    <i data-lucide="eraser"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function guardarIntegrantes() {
    if (!await validarIntegrantes()) return;

    // Persistir solo al confirmar
    listaIntegrantesGuardados = listaIntegrantes.map(i => ({ ...i }));

    const total = listaIntegrantesGuardados.length;
    document.getElementById('contador-integrantes').innerText = total;
    document.getElementById('num-integrantes-input').value = total;

    const edadesString = listaIntegrantesGuardados.map(i => i.edad).join(", ");
    document.getElementById('input-edades-resumen').value = edadesString;

    const modalElement = document.getElementById('modalIntegrantes');
    bootstrap.Modal.getInstance(modalElement).hide();
}