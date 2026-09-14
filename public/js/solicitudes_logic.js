'use strict';

let currentPage = 1;
let currentSearch = '';
let currentEstado = '';
let currentTipo = '';
let catalogos = { tipos: [], estados: [] };
let deleteTargetId = null;

// El rol se normaliza a 'admin' al iniciar sesión. isAdmin() viene de utils.js.

// Estados que se pueden asignar manualmente desde el modal de edición
const ESTADOS_EDITABLES = ['En proceso', 'Procedente', 'No procedente'];

const ESTADO_CLASSES = {
    'Pendiente': 'status-pendiente',
    'En proceso': 'status-proceso',
    'Procedente': 'status-procedente',
    'No procedente': 'status-no-procedente',
    'Cerrado': 'status-cerrado',
    'Cerrado - Procedente': 'status-cerrado',
    'Cerrado - No procedente': 'status-cerrado'
};

// Una solicitud cerrada es de solo lectura
function esCerrado(nombreEstado) {
    return /^cerrado/i.test(nombreEstado || '');
}

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof setupHeader === 'function') setupHeader();

    const operadorName = localStorage.getItem('userName') || 'Operador';
    const opField = document.getElementById('operadorSolicitud');
    if (opField) opField.value = operadorName;

    document.getElementById('searchSolicitudes').addEventListener('input', (e) => {
        currentSearch = e.target.value;
        currentPage = 1;
        loadSolicitudes();
    });

    document.getElementById('filterEstado').addEventListener('change', (e) => {
        currentEstado = e.target.value;
        currentPage = 1;
        loadSolicitudes();
    });

    document.getElementById('filterTipo').addEventListener('change', (e) => {
        currentTipo = e.target.value;
        currentPage = 1;
        loadSolicitudes();
    });

    document.getElementById('codigoAsociado').addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '').slice(0, 9);
    });

    await loadSolicitudes();
});

async function loadSolicitudes() {
    const tbody = document.getElementById('solicitudesTableBody');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--color-text-muted);">Cargando solicitudes...</td></tr>';

    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: 10,
            search: currentSearch,
            estado: currentEstado,
            tipo: currentTipo
        });

        const response = await apiFetch(`/api/solicitudes?${params}`);
        const data = response.data || [];
        const pagination = response.pagination || { page: 1, total: 0, totalPages: 0 };
        catalogos = response.catalogos || { tipos: [], estados: [] };

        renderFilters();
        renderTable(data, tbody);
        renderPagination(pagination);
    } catch (err) {
        console.error('Error loading solicitudes:', err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#ef4444;">Error al cargar solicitudes: ${err.message}</td></tr>`;
    }
}

function renderFilters() {
    const estadoSelect = document.getElementById('filterEstado');
    const tipoSelect = document.getElementById('filterTipo');
    const modalTipo = document.getElementById('tipoSolicitud');
    const modalEstado = document.getElementById('estadoSolicitud');

    // Reconstruir siempre para evitar opciones duplicadas
    const estadoActual = estadoSelect.value;
    estadoSelect.innerHTML = '<option value="">Todos los estados</option>';
    modalEstado.innerHTML = '';

    catalogos.estados.forEach(e => {
        estadoSelect.add(new Option(e.nombre, e.id));
        if (ESTADOS_EDITABLES.includes(e.nombre)) {
            modalEstado.add(new Option(e.nombre, e.id));
        }
    });
    estadoSelect.value = estadoActual;

    const tipoActual = tipoSelect.value;
    tipoSelect.innerHTML = '<option value="">Todos los tipos</option>';
    modalTipo.innerHTML = '';

    catalogos.tipos.forEach(t => {
        tipoSelect.add(new Option(t.nombre, t.id));
        modalTipo.add(new Option(t.nombre, t.id));
    });
    tipoSelect.value = tipoActual;
}

function renderTable(data, tbody) {
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8">
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                <h3>No se encontraron solicitudes</h3>
                <p>${currentSearch ? 'Intenta con otros términos de búsqueda.' : 'Las solicitudes se generan automáticamente desde el módulo de Tareas Operativas al calcular un resultado procedente.'}</p>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((s, index) => {
        const rowNum = ((currentPage - 1) * 10) + index + 1;
        const estadoClass = ESTADO_CLASSES[s.estado_nombre] || 'status-pendiente';
        const fecha = new Date(s.fecha_registro).toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const desc = s.descripcion || '—';
        const truncDesc = desc.length > 60 ? desc.substring(0, 60) + '...' : desc;
        const cerrada = esCerrado(s.estado_nombre);

        const btnVer = `
                <button class="action-btn" onclick="viewSolicitud(${s.id_solicitud})" title="Ver detalle">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>`;

        // Solo se puede editar si la solicitud no está cerrada
        const btnEditar = cerrada ? '' : `
                <button class="action-btn" onclick="openEditModal(${s.id_solicitud})" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>`;

        // Solo el administrador puede eliminar
        const btnEliminar = isAdmin() ? `
                <button class="action-btn danger" onclick="openDeleteModal(${s.id_solicitud})" title="Eliminar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>` : '';

        return `<tr>
            <td><strong>#${rowNum}</strong></td>
            <td><span class="codigo-display">${s.codigo_asociado}</span></td>
            <td>${s.tipo_solicitud}</td>
            <td><span class="status-badge ${estadoClass}">${s.estado_nombre}</span></td>
            <td><div class="desc-cell" title="${desc.replace(/"/g, '&quot;')}">${truncDesc}</div></td>
            <td>${s.operador_nombre || s.operador_usuario || '—'}</td>
            <td style="font-size:0.82rem;color:var(--color-text-muted);">${fecha}</td>
            <td style="text-align:center;white-space:nowrap;">${btnVer}${btnEditar}${btnEliminar}</td>
        </tr>`;
    }).join('');
}

function renderPagination(pagination) {
    const info = document.getElementById('paginationInfo');
    const controls = document.getElementById('paginationControls');

    const start = pagination.total === 0 ? 0 : (pagination.page - 1) * 10 + 1;
    const end = Math.min(pagination.page * 10, pagination.total);
    info.textContent = `Mostrando ${start}-${end} de ${pagination.total} solicitudes`;

    let html = '';
    html += `<button onclick="goToPage(${pagination.page - 1})" ${pagination.page <= 1 ? 'disabled' : ''}>‹ Anterior</button>`;

    for (let i = 1; i <= pagination.totalPages; i++) {
        if (i === 1 || i === pagination.totalPages || Math.abs(i - pagination.page) <= 2) {
            html += `<button class="${i === pagination.page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (Math.abs(i - pagination.page) === 3) {
            html += `<button disabled>…</button>`;
        }
    }

    html += `<button onclick="goToPage(${pagination.page + 1})" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>Siguiente ›</button>`;
    controls.innerHTML = html;
}

window.goToPage = function (page) {
    currentPage = page;
    loadSolicitudes();
};

// ==================== EDIT (LOAD) ====================
window.openEditModal = async function (id) {
    try {
        const response = await apiFetch(`/api/solicitudes/${id}`);
        const s = response.data;

        if (esCerrado(s.estado_nombre)) {
            alert(`La solicitud está ${s.estado_nombre} y ya no puede editarse. Solo puede consultarse.`);
            return;
        }

        document.getElementById('modalTitle').textContent = 'Editar Solicitud #' + id;
        document.getElementById('editId').value = s.id_solicitud;
        document.getElementById('codigoAsociado').value = s.codigo_asociado;
        document.getElementById('tipoSolicitud').value = s.id_tipo_solicitud;
        document.getElementById('estadoSolicitud').value = s.id_estado;
        document.getElementById('descripcionSolicitud').value = s.descripcion || '';
        document.getElementById('formError').style.display = 'none';
        document.getElementById('btnSaveSolicitud').textContent = 'Guardar Cambios';
        openModal('solicitudModal');
    } catch (err) {
        console.error('Error loading solicitud:', err);
        alert('Error al cargar la solicitud: ' + err.message);
    }
};

// ==================== SAVE (UPDATE only - estado and descripcion) ====================
window.saveSolicitud = async function () {
    const id = document.getElementById('editId').value;
    const estado = document.getElementById('estadoSolicitud').value;
    const descripcion = document.getElementById('descripcionSolicitud').value.trim();
    const errorEl = document.getElementById('formError');

    errorEl.style.display = 'none';

    if (!id) {
        showFormError('No se puede crear solicitudes desde aquí. Las solicitudes se generan automáticamente desde Tareas Operativas.');
        return;
    }

    if (!estado) {
        showFormError('Debe seleccionar un estado (En proceso, Procedente o No procedente).');
        return;
    }

    const userId = localStorage.getItem('userId');
    const payload = {
        id_estado: parseInt(estado),
        descripcion: descripcion || null,
        id_operador_log: userId ? parseInt(userId) : null
    };

    try {
        await apiFetch(`/api/solicitudes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });

        closeModal('solicitudModal');
        loadSolicitudes();
    } catch (err) {
        showFormError('Error al guardar: ' + err.message);
    }
};

function showFormError(msg) {
    const el = document.getElementById('formError');
    el.textContent = msg;
    el.style.display = 'block';
}

// ==================== DELETE ====================
window.openDeleteModal = function (id) {
    if (!isAdmin()) {
        alert('Solo un administrador puede eliminar solicitudes.');
        return;
    }
    deleteTargetId = id;
    document.getElementById('deleteInfo').textContent = `Se eliminará la solicitud #${id}. Esta acción no se puede deshacer.`;
    openModal('deleteModal');
};

window.confirmDelete = async function () {
    if (!deleteTargetId) return;

    const userId = localStorage.getItem('userId');

    try {
        await apiFetch(`/api/solicitudes/${deleteTargetId}`, {
            method: 'DELETE',
            body: JSON.stringify({ id_operador_log: userId ? parseInt(userId) : null })
        });

        closeModal('deleteModal');
        deleteTargetId = null;
        loadSolicitudes();
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
};

// ==================== VIEW DETAIL ====================
window.viewSolicitud = async function (id) {
    try {
        const response = await apiFetch(`/api/solicitudes/${id}`);
        const s = response.data;

        const fecha = new Date(s.fecha_registro).toLocaleDateString('es-ES', {
            day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const estadoClass = ESTADO_CLASSES[s.estado_nombre] || 'status-pendiente';

        document.getElementById('detailModalBody').innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;background:#f8fafc;padding:1.2rem;border-radius:10px;">
                <div style="grid-column:1/-1;">
                    <span style="color:#64748b;font-size:0.75rem;text-transform:uppercase;font-weight:600;">Solicitud</span>
                    <div style="margin-top:0.3rem;font-size:1.1rem;font-weight:700;color:#1e293b;">#${s.id_solicitud}</div>
                </div>
                <div>
                    <span style="color:#64748b;font-size:0.75rem;text-transform:uppercase;font-weight:600;">Código Socio</span>
                    <div style="margin-top:0.3rem;font-size:1rem;font-weight:600;color:var(--color-accent-teal);font-family:'Courier New',monospace;">${s.codigo_asociado}</div>
                </div>
                <div>
                    <span style="color:#64748b;font-size:0.75rem;text-transform:uppercase;font-weight:600;">Estado</span>
                    <div style="margin-top:0.3rem;"><span class="status-badge ${estadoClass}">${s.estado_nombre}</span></div>
                </div>
                <div>
                    <span style="color:#64748b;font-size:0.75rem;text-transform:uppercase;font-weight:600;">Tipo Solicitud</span>
                    <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${s.tipo_solicitud}</div>
                </div>
                <div>
                    <span style="color:#64748b;font-size:0.75rem;text-transform:uppercase;font-weight:600;">Operador</span>
                    <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${s.operador_nombre || s.operador_usuario || '—'}</div>
                </div>
                <div style="grid-column:1/-1;">
                    <span style="color:#64748b;font-size:0.75rem;text-transform:uppercase;font-weight:600;">Fecha de Registro</span>
                    <div style="margin-top:0.3rem;font-size:0.95rem;color:#334155;">${fecha}</div>
                </div>
                ${s.descripcion ? `
                <div style="grid-column:1/-1;border-top:1px solid #e2e8f0;padding-top:1rem;">
                    <span style="color:#64748b;font-size:0.75rem;text-transform:uppercase;font-weight:600;">Descripción</span>
                    <div style="margin-top:0.5rem;font-size:0.92rem;color:#475569;line-height:1.6;white-space:pre-wrap;">${s.descripcion}</div>
                </div>` : ''}
            </div>
        `;
        openModal('detailModal');
    } catch (err) {
        console.error('Error viewing solicitud:', err);
        alert('Error al cargar detalle: ' + err.message);
    }
};