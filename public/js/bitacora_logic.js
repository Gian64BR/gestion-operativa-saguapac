/**
 * bitacora_logic.js
 * Lógica de la página de Bitácora (acceso solo por enlace directo /bitacora.html).
 * Consulta /api/audit-system (movimientos) y /api/bitacora/papelera (eliminados).
 */

(function () {
    'use strict';

    // ---------- Acceso denegado (no administrador) ----------
    if (window.__bitacoraDenied) {
        document.addEventListener('DOMContentLoaded', function () {
            document.body.innerHTML = `
                <div class="denied">
                    <h2 style="color:#dc2626; margin-top:0;">Acceso restringido</h2>
                    <p style="color:#475569;">Esta página solo está disponible para administradores.</p>
                    <a href="dashboard.html" class="btn-bit" style="text-decoration:none; display:inline-block; margin-top:1rem;">Volver al panel</a>
                </div>`;
        });
        return;
    }

    // ---------- Utilidades ----------
    async function fetchJSON(url, options) {
        const res = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options && options.headers) }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Error de conexión con el servidor');
        }
        return res.json();
    }

    function escapeHtml(v) {
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fmtFecha(fecha) {
        if (!fecha) return '—';
        const d = new Date(fecha);
        if (isNaN(d.getTime())) return String(fecha);
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }

    function jsonPretty(obj) {
        if (obj === null || obj === undefined) return '—';
        try {
            const value = typeof obj === 'string' ? JSON.parse(obj) : obj;
            return JSON.stringify(value, null, 2);
        } catch (e) {
            return String(obj);
        }
    }

    // ---------- Estado ----------
    let catalogosCargados = false;
    let movRows = [];
    let papRows = [];

    // ---------- Movimientos ----------
    async function loadMovimientos() {
        const container = document.getElementById('movimientosContainer');
        container.innerHTML = '<div class="bit-empty">Cargando bitácora...</div>';

        const params = new URLSearchParams();
        const accion = document.getElementById('fAccion').value;
        const tabla = document.getElementById('fTabla').value;
        const search = document.getElementById('fSearch').value.trim();
        const desde = document.getElementById('fDesde').value;
        const hasta = document.getElementById('fHasta').value;

        if (accion) params.set('accion', accion);
        if (tabla) params.set('tabla', tabla);
        if (search) params.set('search', search);
        if (desde) params.set('desde', desde);
        if (hasta) params.set('hasta', hasta + 'T23:59:59');

        try {
            const response = await fetchJSON('/api/audit-system?' + params.toString());
            const rows = response.data || [];
            movRows = rows;

            if (!catalogosCargados && response.catalogos) {
                fillSelect('fAccion', response.catalogos.acciones || []);
                fillSelect('fTabla', response.catalogos.tablas || []);
                catalogosCargados = true;
            }

            if (rows.length === 0) {
                container.innerHTML = '<div class="bit-empty">No hay movimientos que coincidan con los filtros.</div>';
                return;
            }

            const filas = rows.map((r, idx) => `
                <tr onclick="verDetalleIdx(${idx})">
                    <td style="white-space:nowrap;">${fmtFecha(r.fecha_exac)}</td>
                    <td><span class="badge badge-${escapeHtml(r.accion)}">${escapeHtml(r.accion)}</span></td>
                    <td>${escapeHtml(r.tabla_origen)}</td>
                    <td>${escapeHtml(r.descripcion)}</td>
                    <td>${escapeHtml(r.operador_nombre)}</td>
                    <td>${r.id_registro != null ? escapeHtml(r.id_registro) : '—'}</td>
                </tr>`).join('');

            container.innerHTML = `
                <div style="overflow:auto; max-height:65vh;">
                    <table class="bit-table">
                        <thead>
                            <tr>
                                <th>Fecha / Hora</th>
                                <th>Acción</th>
                                <th>Tabla</th>
                                <th>Descripción</th>
                                <th>Operador</th>
                                <th>ID Reg.</th>
                            </tr>
                        </thead>
                        <tbody>${filas}</tbody>
                    </table>
                </div>
                <div style="margin-top:0.6rem; color:#94a3b8; font-size:0.78rem;">${rows.length} registro(s). Haz clic en una fila para ver el detalle.</div>`;
        } catch (err) {
            container.innerHTML = `<div class="bit-empty" style="color:#dc2626;">Error: ${escapeHtml(err.message)}</div>`;
        }
    }

    function fillSelect(id, valores) {
        const sel = document.getElementById(id);
        if (!sel) return;
        const actual = sel.value;
        sel.innerHTML = '<option value="">Todas</option>' +
            valores.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
        sel.value = actual;
    }

    // ---------- Detalle ----------
    window.verDetalleIdx = function (idx) {
        const r = movRows[idx];
        if (r) verDetalle(r);
    };

    function verDetalle(r) {
        const modal = document.getElementById('bitModal');
        const content = document.getElementById('bitModalContent');
        content.innerHTML = `
            <h3>Detalle del movimiento</h3>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem 1rem; font-size:0.85rem; color:#334155; margin-bottom:1rem;">
                <div><strong>Acción:</strong> <span class="badge badge-${escapeHtml(r.accion)}">${escapeHtml(r.accion)}</span></div>
                <div><strong>Tabla:</strong> ${escapeHtml(r.tabla_origen)}</div>
                <div><strong>Operador:</strong> ${escapeHtml(r.operador_nombre)}</div>
                <div><strong>ID Registro:</strong> ${r.id_registro != null ? escapeHtml(r.id_registro) : '—'}</div>
                <div><strong>Fecha:</strong> ${fmtFecha(r.fecha_exac)}</div>
                <div><strong>IP:</strong> ${escapeHtml(r.ip_cliente || '—')}</div>
            </div>
            <p style="font-size:0.85rem; color:#334155; margin:0 0 1rem;"><strong>Descripción:</strong> ${escapeHtml(r.descripcion)}</p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                <div>
                    <div style="font-size:0.75rem; font-weight:700; color:#166534; text-transform:uppercase; margin-bottom:0.3rem;">Datos nuevos</div>
                    <pre class="bit-json">${escapeHtml(jsonPretty(r.datos_nuevos))}</pre>
                </div>
                <div>
                    <div style="font-size:0.75rem; font-weight:700; color:#991b1b; text-transform:uppercase; margin-bottom:0.3rem;">Datos anteriores</div>
                    <pre class="bit-json">${escapeHtml(jsonPretty(r.datos_anteriores))}</pre>
                </div>
            </div>
            <div style="margin-top:1rem; text-align:right;">
                <button class="btn-bit ghost" onclick="cerrarModal()">Cerrar</button>
            </div>`;
        modal.classList.add('show');
    }

    window.cerrarModal = function () {
        document.getElementById('bitModal').classList.remove('show');
    };

    document.addEventListener('click', function (e) {
        const modal = document.getElementById('bitModal');
        if (e.target === modal) cerrarModal();
    });

    // ---------- Papelera ----------
    async function loadPapelera() {
        const container = document.getElementById('papeleraContainer');
        container.innerHTML = '<div class="bit-empty">Cargando papelera...</div>';

        try {
            const response = await fetchJSON('/api/bitacora/papelera');
            const rows = response.data || [];
            papRows = rows;

            if (rows.length === 0) {
                container.innerHTML = '<div class="bit-empty">No hay registros eliminados.</div>';
                return;
            }

            const filas = rows.map((r, idx) => `
                <tr>
                    <td style="white-space:nowrap;">${fmtFecha(r.deleted_at)}</td>
                    <td>${escapeHtml(r.tabla_label)}</td>
                    <td>${escapeHtml(r.resumen)}</td>
                    <td>${escapeHtml(r.deleted_by_nombre || '—')}</td>
                    <td>
                        <button class="btn-bit" style="padding:0.35rem 0.8rem;" onclick="restaurarIdx(${idx})">
                            Restaurar
                        </button>
                    </td>
                </tr>`).join('');

            container.innerHTML = `
                <div style="overflow:auto; max-height:65vh;">
                    <table class="bit-table">
                        <thead>
                            <tr>
                                <th>Fecha de eliminación</th>
                                <th>Tabla</th>
                                <th>Registro</th>
                                <th>Eliminado por</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>${filas}</tbody>
                    </table>
                </div>
                <div style="margin-top:0.6rem; color:#94a3b8; font-size:0.78rem;">${rows.length} registro(s) en la papelera.</div>`;
        } catch (err) {
            container.innerHTML = `<div class="bit-empty" style="color:#dc2626;">Error: ${escapeHtml(err.message)}</div>`;
        }
    }

    window.restaurarIdx = function (idx) {
        const r = papRows[idx];
        if (r) restaurar(r.tabla, r.id, r.resumen);
    };

    async function restaurar(tabla, id, resumen) {
        if (!confirm(`¿Restaurar el registro "${resumen}"?\n\nVolverá a estar activo en el sistema.`)) return;

        try {
            const idOperador = parseInt(localStorage.getItem('userId')) || null;
            const response = await fetchJSON('/api/bitacora/restaurar', {
                method: 'POST',
                body: JSON.stringify({ tabla, id, id_operador_log: idOperador })
            });
            alert('🟢 ' + (response.message || 'Registro restaurado'));
            await Promise.all([loadPapelera(), loadMovimientos()]);
        } catch (err) {
            alert('Error al restaurar: ' + err.message);
        }
    }

    // ---------- Filtros / pestañas ----------
    window.resetFiltros = function () {
        document.getElementById('fSearch').value = '';
        document.getElementById('fAccion').value = '';
        document.getElementById('fTabla').value = '';
        document.getElementById('fDesde').value = '';
        document.getElementById('fHasta').value = '';
        loadMovimientos();
    };

    window.loadBitacora = function () {
        loadMovimientos();
        loadPapelera();
    };

    document.addEventListener('DOMContentLoaded', function () {
        // Pestañas
        const tabs = document.querySelectorAll('.bit-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const view = tab.getAttribute('data-view');
                document.getElementById('view-movimientos').style.display = view === 'movimientos' ? '' : 'none';
                document.getElementById('view-papelera').style.display = view === 'papelera' ? '' : 'none';
                if (view === 'papelera') loadPapelera();
            });
        });

        // Enter en el buscador
        document.getElementById('fSearch').addEventListener('keydown', e => {
            if (e.key === 'Enter') loadMovimientos();
        });

        loadMovimientos();
    });

})();
