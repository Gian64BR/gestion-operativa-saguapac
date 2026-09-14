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

    // ---------- Registrar ingreso a la bitácora ----------
    (function () {
        const userId = parseInt(localStorage.getItem('userId')) || null;
        try {
            fetch('/api/audit-view', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_operador: userId, modulo: 'Bitácora del Sistema', ruta: '/bitacora.html' })
            }).catch(function () { });
        } catch (e) { /* nunca bloquear por la bitácora */ }
    })();

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
    const PAGE_SIZE = 50;
    let movPage = 1;
    let papPage = 1;

    // ---------- Paginación (HTML reutilizable) ----------
    function paginacionHTML(total, totalPages, current, fnName) {
        if (totalPages <= 1) {
            return `<div style="margin-top:0.8rem; color:#94a3b8; font-size:0.78rem;">${total} registro(s).</div>`;
        }

        const inicio = total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
        const fin = Math.min(current * PAGE_SIZE, total);

        let botones = '';
        for (let p = 1; p <= totalPages; p++) {
            if (p === 1 || p === totalPages || Math.abs(p - current) <= 2) {
                botones += `<button class="bit-page ${p === current ? 'active' : ''}" onclick="${fnName}(${p})">${p}</button>`;
            } else if (Math.abs(p - current) === 3) {
                botones += `<span style="color:#94a3b8;">…</span>`;
            }
        }

        return `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-top:0.8rem;">
                <span style="color:#64748b; font-size:0.8rem;">Mostrando ${inicio}–${fin} de ${total} registro(s)</span>
                <div style="display:flex; gap:0.3rem; align-items:center; flex-wrap:wrap;">
                    <button class="bit-page" ${current <= 1 ? 'disabled' : ''} onclick="${fnName}(${current - 1})">‹ Anterior</button>
                    ${botones}
                    <button class="bit-page" ${current >= totalPages ? 'disabled' : ''} onclick="${fnName}(${current + 1})">Siguiente ›</button>
                </div>
            </div>`;
    }

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
        params.set('page', movPage);
        params.set('limit', PAGE_SIZE);

        try {
            const response = await fetchJSON('/api/audit-system?' + params.toString());
            const rows = response.data || [];
            const pag = response.pagination || { page: 1, total: rows.length, totalPages: 1 };
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
                ${paginacionHTML(pag.total, pag.totalPages, pag.page, 'irPaginaMov')}
                <div style="margin-top:0.4rem; color:#94a3b8; font-size:0.78rem;">Haz clic en una fila para ver el detalle.</div>`;
        } catch (err) {
            container.innerHTML = `<div class="bit-empty" style="color:#dc2626;">Error: ${escapeHtml(err.message)}</div>`;
        }
    }

    window.irPaginaMov = function (p) {
        movPage = p;
        loadMovimientos();
        document.getElementById('view-movimientos').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.aplicarFiltros = function () {
        movPage = 1;
        loadMovimientos();
    };

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
            papRows = response.data || [];
            papPage = 1;
            renderPapeleraPage();
        } catch (err) {
            container.innerHTML = `<div class="bit-empty" style="color:#dc2626;">Error: ${escapeHtml(err.message)}</div>`;
        }
    }

    function renderPapeleraPage() {
        const container = document.getElementById('papeleraContainer');

        if (papRows.length === 0) {
            container.innerHTML = '<div class="bit-empty">No hay registros eliminados.</div>';
            return;
        }

        const total = papRows.length;
        const totalPages = Math.ceil(total / PAGE_SIZE);
        if (papPage > totalPages) papPage = totalPages;
        const start = (papPage - 1) * PAGE_SIZE;
        const pageData = papRows.slice(start, start + PAGE_SIZE);

        const filas = pageData.map((r, i) => {
            const idx = start + i;
            return `
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
                </tr>`;
        }).join('');

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
            ${paginacionHTML(total, totalPages, papPage, 'irPaginaPap')}`;
    }

    window.irPaginaPap = function (p) {
        papPage = p;
        renderPapeleraPage();
        document.getElementById('view-papelera').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

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
        movPage = 1;
        loadMovimientos();
    };

    window.loadBitacora = function () {
        movPage = 1;
        papPage = 1;
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
            if (e.key === 'Enter') aplicarFiltros();
        });

        loadMovimientos();
    });

})();
