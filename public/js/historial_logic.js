/**
 * historial_logic.js
 * Lógica específica para el módulo de Historial y Auditoría Global
 */

// Uses customRound from tareas_logic.js for consistency

// Funciones de Modal (abrir/cerrar)
window.openModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        // Agregar clase 'show' para activar la transición de opacidad
        modal.classList.add('show');
        // Permitir cerrar haciendo clic fuera del contenido
        if (!modal._hasCloseHandler) {
            modal.onclick = function (e) {
                if (e.target === modal) {
                    closeModal(modalId);
                }
            };
            modal._hasCloseHandler = true;
        }
    }
};

window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        // Remover clase 'show' para activar la transición de salida
        modal.classList.remove('show');
        // Esperar a que termine la transición antes de ocultar
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
};

// ========================================================
// HISTORIAL — Datos en tiempo real desde auditHistory
// Se inicia VACIO. Se puebla 100% desde localStorage.
// ========================================================
let historyData = []; // comienza limpio

const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const diasNombres = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

let currentAlmanacBaseDate = new Date();

// Mapeo de acciones a títulos legibles
function actionToTitle(action, modulo) {
    const actionMap = {
        'CREATE': 'Creación',
        'UPDATE': 'Actualización',
        'DELETE': 'Eliminación',
        'LOGIN_SUCCESS': 'Inicio de sesión',
        'LOGIN_FAILED': 'Intento de login fallido',
        'LOGOUT': 'Cierre de sesión',
        'ERROR': 'Error',
        'PERMISSION_DENIED': 'Permiso denegado'
    };

    const moduloMap = {
        'users': 'Usuarios',
        'contacts': 'Contactos',
        'socios': 'Socios',
        'zonas': 'Zonas',
        'medidores': 'Medidores',
        'facturas': 'Facturas',
        'events': 'Eventos/Cortes',
        'auth': 'Autenticación'
    };

    const actionStr = actionMap[action] || action;
    const moduloStr = moduloMap[modulo] || modulo;
    return `${actionStr} en ${moduloStr}`;
}

function tipoToTitle(type) {
    const map = {
        'base': 'Base (8.01)',
        '8.01': 'Arreglo de fuga (8.01)',
        '8.02': 'Promedio Elevado (8.02)',
        '8.03': 'Lectura errónea (8.03)',
        '8.04': 'Mala lectura (8.04)',
        '8.06': 'Medidor detenido (8.06)',
        '8.07': 'Medidor averiado (8.07)',
        'evento': 'Corte Programado',
        'factura_modificacion': 'Modificación de Factura',
        'CREATE': 'Creación',
        'UPDATE': 'Actualización',
        'DELETE': 'Eliminación',
        'LOGIN_SUCCESS': 'Inicio de sesión',
        'LOGIN_FAILED': 'Login fallido',
        'LOGOUT': 'Cierre de sesión'
    };
    return map[type] || ('Procedimiento ' + type);
}

function tipoToDotClass(type) {
    if (type === 'evento') return 'dot-cut';
    if (type === 'CREATE' || type === 'UPDATE' || type === 'DELETE' || type === 'activity') return 'dot-mod';
    return 'dot-mod';
}

let rawAudits = []; // Global cache for full audit records

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof setupHeader === 'function') setupHeader();

    try {
        console.log('📋 Cargando historial desde /api/audit-history...');
        const response = await apiFetch('/api/audit-history');
        console.log('📋 Respuesta del API:', response);

        rawAudits = response.data || response;
        console.log(`📋 Total de registros recibidos: ${rawAudits.length}`);

        const localAudits = rawAudits;

        if (localAudits.length === 0) {
            console.warn('⚠️ No hay registros de auditoría en la base de datos');
            // Mostrar mensaje al usuario
            const mainContainer = document.getElementById('historyListContainer');
            if (mainContainer) {
                mainContainer.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--color-text-muted);">No hay registros de auditoría disponibles. Los eventos aparecerán cuando se creen, modifiquen o eliminen cortes programados.</div>';
            }
            return;
        }

        // Ordenar del más reciente al más antiguo
        localAudits.sort((a, b) => new Date(b.fecha_exac || b.fechaExac) - new Date(a.fecha_exac || a.fechaExac));

        localAudits.forEach(rec => {
            // Usar rec.tipo en lugar de rec.type (el campo en la BD se llama 'tipo')
            const tipo = rec.tipo || rec.type || 'evento';

            // Construir dateObj preservando la hora real del registro
            let dateObj;
            const fechaRaw = rec.fecha_exac || rec.fechaExac;
            if (fechaRaw) {
                // Usar la fecha completa con hora para mostrar la hora real
                dateObj = new Date(fechaRaw);
                // Verificar que la fecha sea válida
                if (isNaN(dateObj.getTime())) {
                    console.error('⚠️ Fecha inválida:', fechaRaw);
                    dateObj = new Date();
                }
            } else {
                dateObj = new Date();
            }

            // IMPORTANTE: Usar la fecha local (convertida a timezone del navegador)
            // para que coincida con el filtro del calendario
            const dateStr = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
            // Mostrar la hora REAL del registro en formato 24 horas
            const timeStr = dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

            // Determinar si es de activity_log o audit_history
            const isActivity = rec.source === 'activity';
            const titulo = tipoToTitle(tipo);

            // Determinar si es tarea operativa
            const isTareaOperativa = ['base', '8.01', '8.02', '8.03', '8.04', '8.06', '8.07'].includes(tipo);

            // Construir body según el tipo de registro
            let bodyText = '';
            if (isActivity) {
                // activity_log: mostrar módulo y detalle
                const moduloStr = rec.modulo ? rec.modulo.toUpperCase() : 'SISTEMA';
                bodyText = `${moduloStr}: ${rec.resultado || rec.detalle || ''}`;
                if (rec.datos_nuevos) {
                    try {
                        const newData = typeof rec.datos_nuevos === 'string' ? JSON.parse(rec.datos_nuevos) : rec.datos_nuevos;
                        const changes = Object.entries(newData).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ');
                        if (changes) bodyText += ` [${changes}]`;
                    } catch (e) { }
                }
            } else {
                // audit_history: formato diferente para tareas operativas vs facturas/eventos
                if (isTareaOperativa) {
                    // Tareas operativas: extraer datos del campo detalle (tiene JSON embebido)
                    let datosParseados = null;
                    if (rec.detalle && rec.detalle.includes('__JSON__:')) {
                        try {
                            const jsonPart = rec.detalle.split('__JSON__:')[1];
                            datosParseados = JSON.parse(jsonPart);
                        } catch (e) {
                            console.error('❌ LISTA - JSON inválido:', rec.id, e.message);
                        }
                    }

                    // Extraer código de socio: prioridad JSON > campo directo > regex
                    let codSocioExtraido = null;
                    if (datosParseados && datosParseados.codSocio) {
                        codSocioExtraido = datosParseados.codSocio;
                    }
                    if (!codSocioExtraido) {
                        codSocioExtraido = rec.cod_socio || rec.codSocio || null;
                    }
                    if (!codSocioExtraido && rec.detalle) {
                        const matchSocio = rec.detalle.match(/[Ss]ocio:\s*([^\|]+)/);
                        if (matchSocio && matchSocio[1]) {
                            codSocioExtraido = matchSocio[1].trim();
                        }
                    }
                    codSocioExtraido = codSocioExtraido || 'N/A';

                    const resultadoTexto = rec.resultado || datosParseados?.resultado || '';
                    const formulaHtml = datosParseados?.formulaHtml || '';

                    // Construir body: SIEMPRE mostrar codSocio + recuadro visual de la calculadora
                    let bodyContent = '';

                    if (formulaHtml) {
                        // Hay formulaHtml → mostrar EXACTAMENTE el recuadro de la calculadora
                        bodyContent = `
                            <div style="border:2px solid #334155;border-radius:14px;background:white;overflow:hidden;">
                                <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.5rem;gap:1.5rem;">
                                    <div style="font-size:0.95rem;color:#1e293b;font-family:'Courier New',monospace;line-height:1.8;flex:1;">${formulaHtml}</div>
                                    <div style="border:3px solid #334155;border-radius:8px;padding:0.5rem 1rem;white-space:nowrap;font-size:1rem;font-weight:700;color:#1e293b;font-family:'Courier New',monospace;min-width:110px;text-align:center;">${resultadoTexto}</div>
                                </div>
                            </div>`;
                    } else {
                        // Sin formulaHtml → mostrar resultado como texto estilizado
                        bodyContent = `
                            <div style="display:flex;justify-content:center;align-items:center;background:#eff6ff;padding:0.6rem 0.8rem;border-radius:8px;">
                                <span style="color:#1d4ed8;font-weight:700;font-size:1rem;">${resultadoTexto || 'Sin resultado'}</span>
                            </div>`;
                    }

                    bodyText = `<div style="display:flex;flex-direction:column;gap:0.5rem;">
                        <div style="display:flex;justify-content:space-between;align-items:center;background:#f0f9ff;padding:0.6rem 0.8rem;border-radius:8px;">
                            <span style="color:#64748b;font-size:0.75rem;text-transform:uppercase;font-weight:600;">Socio / Usuario</span>
                            <span style="font-weight:700;color:#1e293b;font-size:0.95rem;">${codSocioExtraido}</span>
                        </div>
                        ${bodyContent}
                    </div>`;
                } else if (tipo === 'evento') {
                    // Eventos/Cortes: mostrar título y detalle limpio
                    const tituloEvento = (rec.resultado || '').replace('Corte programado: ', '').replace('Evento modificado: ', '').replace('Evento eliminado: ', '');
                    // Limpiar el detalle: quitar "Evento ID: X" que es información interna
                    let detalleLimpio = rec.detalle || '';
                    detalleLimpio = detalleLimpio.replace(/Evento ID:\s*\d+\.?\s*/g, '');
                    detalleLimpio = detalleLimpio.replace(/\.\s*\./g, '.').replace(/\.\s*$/g, '').trim();
                    bodyText = `<strong>${tituloEvento}</strong><br><small style="color:var(--color-text-muted)">${detalleLimpio}`;
                } else {
                    // Facturas y otros: formato original
                    bodyText = `Socio: ${rec.cod_socio || rec.codSocio || 'N/A'}. Resultado: ${rec.resultado}. ${rec.detalle || ''}`;
                }
            }

            historyData.push({
                id: rec.id,
                dateObj: dateObj,
                group: dateStr,
                type: tipo === 'evento' ? 'Corte' : 'Modificación',
                isNavigable: tipo === '8.01',
                dotClass: tipoToDotClass(tipo),
                title: isActivity ? actionToTitle(tipo, rec.modulo) : titulo,
                time: timeStr,
                body: bodyText,
                user: rec.operador_nombre || rec.operador || 'Sistema',
                userType: isActivity ? 'operator' : 'system',
                source: isActivity ? 'activity' : 'audit',
                modulo: rec.modulo,
                datos_nuevos: rec.datos_nuevos,
                datos_anteriores: rec.datos_anteriores,
                // Guardar el tipo original para referencia
                tipoOriginal: tipo
            });
        });

        console.log(`✅ Historial cargado exitosamente: ${historyData.length} registros procesados`);
    } catch (err) {
        console.error('❌ Error al cargar historial:', err);
        console.error('❌ Detalle del error:', err.message);
        console.error('❌ Stack trace:', err.stack);

        // Mostrar mensaje de error al usuario
        const mainContainer = document.getElementById('historyListContainer');
        if (mainContainer) {
            mainContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #dc2626;">
                    <h3>Error al cargar el historial</h3>
                    <p>No se pudo conectar con el servidor. Verifique que:</p>
                    <ul style="text-align: left; display: inline-block; margin-top: 1rem;">
                        <li>El servidor esté en ejecución</li>
                        <li>Tenga conexión a la base de datos</li>
                        <li>La API esté respondiendo correctamente</li>
                    </ul>
                    <p style="margin-top: 1rem; font-size: 0.85rem; color: var(--color-text-muted);">
                        Error: ${err.message}
                    </p>
                </div>
            `;
        }
    }

    setupHistoryFilters();

    // Show ALL records initially, then goToToday for calendar selection
    renderHistory(historyData);
    goToToday(); // This will initialize stats for current month
});

// Calculate monthly statistics
function updateMonthlyStats(year, month) {
    const cutsCount = historyData.filter(item =>
        item.type === 'Corte' &&
        item.dateObj.getFullYear() === year &&
        item.dateObj.getMonth() === month
    ).length;

    const modsCount = historyData.filter(item =>
        item.type === 'Modificación' &&
        item.dateObj.getFullYear() === year &&
        item.dateObj.getMonth() === month
    ).length;

    const cutsEl = document.getElementById('monthlyCutsCount');
    const modsEl = document.getElementById('monthlyModsCount');
    if (cutsEl) cutsEl.textContent = cutsCount;
    if (modsEl) modsEl.textContent = modsCount;
}

window.changeAlmanacMonthYear = function () {
    const m = document.getElementById('almanacMonthSelect').value;
    const ySelect = document.getElementById('almanacYearSelect');
    const yInput = document.getElementById('almanacYearInput');

    // Si hay un valor en el input manual, usarlo; sino usar el select
    let y = yInput && yInput.value ? yInput.value : (ySelect ? ySelect.value : new Date().getFullYear());

    if (m && y) {
        // Limpiar input manual si se usa el select
        if (yInput && !yInput.value) {
            yInput.value = '';
        }
        currentAlmanacBaseDate = new Date(parseInt(y), parseInt(m), 1);
        updateMonthlyStats(parseInt(y), parseInt(m));
        initCalendarFocus(currentAlmanacBaseDate, null);
    }
};

// Manejar ingreso manual de año (tecla Enter)
window.handleYearInput = function (event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleYearInputChange();
    }
};

// Manejar cambio en el input manual de año
window.handleYearInputChange = function () {
    const yInput = document.getElementById('almanacYearInput');
    const ySelect = document.getElementById('almanacYearSelect');
    const mSelect = document.getElementById('almanacMonthSelect');

    if (yInput && yInput.value) {
        const year = parseInt(yInput.value);
        if (year >= 2000 && year <= 2100) {
            // Año válido, actualizar
            if (ySelect) ySelect.value = year;
            currentAlmanacBaseDate = new Date(year, parseInt(mSelect.value), 1);
            updateMonthlyStats(year, parseInt(mSelect.value));
            initCalendarFocus(currentAlmanacBaseDate, null);
        }
    }
};

window.goToToday = function () {
    const today = new Date();
    currentAlmanacBaseDate = new Date(today);

    const mSelect = document.getElementById('almanacMonthSelect');
    const ySelect = document.getElementById('almanacYearSelect');
    if (mSelect && ySelect) {
        mSelect.value = today.getMonth();
        ySelect.value = today.getFullYear();
    }

    updateMonthlyStats(today.getFullYear(), today.getMonth());
    initCalendarFocus(today, today);
};

window.scrollCalendar = function (offset) {
    const container = document.getElementById('calendarDaysContainer');
    if (container) {
        container.scrollBy({ left: offset, behavior: 'smooth' });
    }
};

window.initCalendarFocus = function (baseDate = new Date(), focusDate = new Date()) {
    const container = document.getElementById('calendarDaysContainer');
    if (!container) return;
    container.innerHTML = '';

    const targetYear = baseDate.getFullYear();
    const targetMonth = baseDate.getMonth();
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

    const focusYear = focusDate ? focusDate.getFullYear() : targetYear;
    const focusMonth = focusDate ? focusDate.getMonth() : targetMonth;
    const focusDay = focusDate ? focusDate.getDate() : 1;

    let boxToSelect = null;
    let dateToSelect = null;

    for (let day = 1; day <= daysInMonth; day++) {
        let loopDate = new Date(targetYear, targetMonth, day);

        let div = document.createElement('div');
        div.className = 'day-box';

        let spans = `
            <span class="day-name">${diasNombres[loopDate.getDay()]}</span>
            <span class="day-number">${day}</span>
        `;
        div.innerHTML = spans;

        div.onclick = () => selectCalendarDay(new Date(loopDate), div);
        container.appendChild(div);

        if (targetYear === focusYear && targetMonth === focusMonth && day === focusDay) {
            boxToSelect = div;
            dateToSelect = loopDate;
            const rt = new Date();
            if (targetYear === rt.getFullYear() && targetMonth === rt.getMonth() && day === rt.getDate()) {
                div.style.minWidth = '60px'; // highlight today
            }
        } else if (!boxToSelect && day === 1) {
            boxToSelect = div;
            dateToSelect = loopDate;
        }
    }

    if (boxToSelect) {
        selectCalendarDay(dateToSelect, boxToSelect);
        setTimeout(() => {
            if (container && boxToSelect) {
                const scrollLeft = boxToSelect.offsetLeft - (container.clientWidth / 2) + (boxToSelect.clientWidth / 2);
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }, 150);
    }
};

window.selectCalendarDay = function (dateObj, elementHtml) {
    const container = document.getElementById('calendarDaysContainer');
    if (container) {
        Array.from(container.children).forEach(child => child.classList.remove('active'));
    }
    if (elementHtml) elementHtml.classList.add('active');

    const label = document.getElementById('almanacCurrentDate');
    if (label) {
        label.textContent = `${dateObj.getDate()} de ${meses[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;
    }

    const headerLabel = document.getElementById('timelineHeaderLabel');
    if (headerLabel) {
        const rt = new Date();
        const mesCapitalizado = meses[dateObj.getMonth()].charAt(0).toUpperCase() + meses[dateObj.getMonth()].slice(1);
        if (dateObj.getDate() === rt.getDate() && dateObj.getMonth() === rt.getMonth() && dateObj.getFullYear() === rt.getFullYear()) {
            headerLabel.textContent = `Hoy - ${dateObj.getDate()} de ${mesCapitalizado}`;
        } else {
            headerLabel.textContent = `${dateObj.getDate()} de ${mesCapitalizado} ${dateObj.getFullYear()}`;
        }
    }

    // Update monthly stats when selecting a day
    updateMonthlyStats(dateObj.getFullYear(), dateObj.getMonth());

    filterHistoryByDate(dateObj);
};

function filterHistoryByDate(targetDate) {
    const tYear = targetDate.getFullYear();
    const tMonth = targetDate.getMonth();
    const tDay = targetDate.getDate();

    console.log(`📅 Filtrando historial por fecha: ${tDay}/${tMonth + 1}/${tYear}`);
    console.log(`📊 Total de registros antes del filtro: ${historyData.length}`);

    // Guardar el filtro de fecha actual
    window.currentDateFilter = { year: tYear, month: tMonth, day: tDay };

    // Aplicar filtros combinados
    applyCombinedFilters();
}

// Función para aplicar filtros combinados (usuario + fecha + tipo)
window.applyCombinedFilters = function () {
    let filtered = historyData;

    console.log(`🔍 Aplicando filtros combinados. Total inicial: ${filtered.length}`);

    // Filtro por tipo (tabs)
    const activeTab = document.querySelector('.status-btn.active');
    const typeFilter = activeTab ? activeTab.getAttribute('data-filter') : 'all';
    if (typeFilter !== 'all') {
        console.log(`   Filtro por tipo: ${typeFilter}`);
        filtered = filtered.filter(h => h.type === typeFilter);
        console.log(`   Después del filtro por tipo: ${filtered.length}`);
    }

    // Filtro por fecha (si hay)
    if (window.currentDateFilter) {
        const { year, month, day } = window.currentDateFilter;
        console.log(`   Filtro por fecha: ${day}/${month + 1}/${year}`);

        const beforeFilter = filtered.length;
        filtered = filtered.filter(item => {
            if (!item.dateObj) return false;
            const itemYear = item.dateObj.getFullYear();
            const itemMonth = item.dateObj.getMonth();
            const itemDay = item.dateObj.getDate();

            const matches = itemYear === year && itemMonth === month && itemDay === day;

            if (matches) {
                console.log(`      ✓ Coincide: ${item.title} - ${item.dateObj.toLocaleString('es-AR')}`);
            }

            return matches;
        });
        console.log(`   Después del filtro por fecha: ${filtered.length} (de ${beforeFilter})`);
    }

    // Filtro por usuario (si hay)
    if (window.currentUserFilter && window.currentUserFilter !== 'all') {
        console.log(`   Filtro por usuario: ${window.currentUserFilter}`);
        filtered = filtered.filter(h => h.user === window.currentUserFilter);
        console.log(`   Después del filtro por usuario: ${filtered.length}`);
    }

    console.log(`✅ Total después de filtros combinados: ${filtered.length}`);
    renderHistory(filtered);
};

// Show all history records (no date filter)
window.showAllHistory = function () {
    // Remove calendar active selection
    const container = document.getElementById('calendarDaysContainer');
    if (container) {
        Array.from(container.children).forEach(child => child.classList.remove('active'));
    }
    const label = document.getElementById('almanacCurrentDate');
    if (label) label.textContent = 'Mostrando todos los registros';

    // Reset filters
    window.currentDateFilter = null;
    window.currentUserFilter = 'all';
    const userSelect = document.getElementById('userFilterSelect');
    if (userSelect) userSelect.value = 'all';

    // Update stats for currently selected month
    const m = document.getElementById('almanacMonthSelect');
    const y = document.getElementById('almanacYearSelect');
    if (m && y) {
        updateMonthlyStats(parseInt(y.value), parseInt(m.value));
    }

    renderHistory(historyData);
};

function setupHistoryFilters() {
    const searchInput = document.getElementById('globalSearchInput');
    const globalDropdown = document.getElementById('searchResultsDropdown');

    if (searchInput) {
        // Clone input to remove global search listeners
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);

        if (globalDropdown) globalDropdown.style.display = 'none';

        newSearchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase().trim();
            if (val.length === 0) {
                renderHistory(historyData);
                return;
            }

            const filtered = historyData.filter(item =>
                item.title.toLowerCase().includes(val) ||
                item.body.toLowerCase().includes(val) ||
                item.user.toLowerCase().includes(val) ||
                item.type.toLowerCase().includes(val) ||
                item.group.toLowerCase().includes(val)
            );
            renderHistory(filtered);
        });
    }

    // Add Tabs Filtering
    const pageHeader = document.querySelector('.page-header');
    if (pageHeader && !document.getElementById('historyTabs')) {
        const tabsContainer = document.createElement('div');
        tabsContainer.id = 'historyTabs';
        tabsContainer.style.cssText = 'display: flex; gap: 1rem; margin-top: 1.5rem;';

        tabsContainer.innerHTML = `
            <button class="status-btn active" data-filter="all" style="padding: 0.5rem 1rem; border: none; border-radius: 20px; font-weight: 500; cursor: pointer; background: var(--color-sidebar); color: white;">Todo</button>
            <button class="status-btn" data-filter="Corte" style="padding: 0.5rem 1rem; border: 1px solid var(--color-border); border-radius: 20px; font-weight: 500; cursor: pointer; background: white; color: var(--color-text-muted);">Historial de Cortes</button>
            <button class="status-btn" data-filter="Modificación" style="padding: 0.5rem 1rem; border: 1px solid var(--color-border); border-radius: 20px; font-weight: 500; cursor: pointer; background: white; color: var(--color-text-muted);">Historial de Modificaciones</button>
        `;
        pageHeader.appendChild(tabsContainer);

        // User Filter Dropdown
        const userFilterContainer = document.createElement('div');
        userFilterContainer.style.cssText = 'display: flex; gap: 0.8rem; margin-top: 0.8rem; align-items: center;';

        // Build unique user list from API — only active/existing users
        let userOptions = '<option value="all">Todos los usuarios</option>';
        apiFetch('/api/users').then(response => {
            const users = response.data || response;
            if (Array.isArray(users)) {
                users.forEach(u => {
                    const nameToDisplay = u.full_name || u.username;
                    if (nameToDisplay) {
                        userOptions += `<option value="${nameToDisplay}">${nameToDisplay}</option>`;
                    }
                });
            }
            const userSelect = userFilterContainer.querySelector('#userFilterSelect');
            if (userSelect) userSelect.innerHTML = userOptions;
        }).catch(err => {
            console.error('Error fetching users for filter:', err);
            // Do NOT fall back to history data — only show active users from API
            const userSelect = userFilterContainer.querySelector('#userFilterSelect');
            if (userSelect) userSelect.innerHTML = '<option value="all">Todos los usuarios</option>';
        });

        userFilterContainer.innerHTML = `
            <label style="font-size:0.85rem; font-weight:600; color:var(--color-sidebar); white-space:nowrap;">Filtrar por Usuario:</label>
            <select id="userFilterSelect" class="form-input" style="padding:0.4rem 0.8rem; border-radius:20px; font-size:0.85rem; border:1px solid var(--color-border); min-width:180px;">
                <option value="all">Cargando...</option>
            </select>
        `;
        pageHeader.appendChild(userFilterContainer);

        const userSelect = userFilterContainer.querySelector('#userFilterSelect');

        // Variable global para almacenar el filtro de fecha actual
        window.currentDateFilter = null;
        window.currentUserFilter = 'all';

        userSelect.addEventListener('change', () => {
            const selectedUser = userSelect.value;
            window.currentUserFilter = selectedUser;

            // Aplicar filtro combinado: usuario + fecha (si hay fecha seleccionada)
            applyCombinedFilters();
        });

        const buttons = tabsContainer.querySelectorAll('.status-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                buttons.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'white';
                    b.style.color = 'var(--color-text-muted)';
                    b.style.border = '1px solid var(--color-border)';
                });
                const target = e.target;
                target.classList.add('active');
                target.style.background = 'var(--color-sidebar)';
                target.style.color = 'white';
                target.style.border = 'none';

                // Apply combined filters WITHOUT resetting user filter
                applyCombinedFilters();
            });
        });
    }

    // Export functionality — to be implemented with actual Excel/CSV export
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.onclick = () => {
            console.log('Exportar historial — función pendiente de implementación');
        };
    }
}

const HISTORY_PAGE_SIZE = 13;
let historyCurrentPage = 0;
let historyCurrentData = [];

function renderHistory(data) {
    historyCurrentData = data;
    historyCurrentPage = 0;
    renderHistoryPage();
}

function renderHistoryPage() {
    const mainContainer = document.getElementById('historyListContainer');
    if (!mainContainer) return;

    let contentArea = document.getElementById('historyContentArea');
    if (!contentArea) {
        contentArea = document.createElement('div');
        contentArea.id = 'historyContentArea';
        mainContainer.appendChild(contentArea);
    }
    contentArea.innerHTML = '';

    const data = historyCurrentData;
    const totalPages = Math.ceil(data.length / HISTORY_PAGE_SIZE);
    const start = historyCurrentPage * HISTORY_PAGE_SIZE;
    const pageData = data.slice(start, start + HISTORY_PAGE_SIZE);

    if (pageData.length === 0) {
        contentArea.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--color-text-muted);">No se encontraron registros de auditoría para esta fecha.</div>';
    } else {
        // Grouping
        const groups = {};
        pageData.forEach(item => {
            if (!groups[item.group]) groups[item.group] = [];
            groups[item.group].push(item);
        });

        Object.keys(groups).forEach(groupName => {
            const h3 = document.createElement('h3');
            h3.style.cssText = 'margin-bottom: 1.5rem; color: var(--color-sidebar); border-bottom: 1px solid var(--color-border); padding-bottom: 0.5rem; display:none;';
            h3.textContent = groupName;
            contentArea.appendChild(h3);

            const timelineDiv = document.createElement('div');
            timelineDiv.className = 'history-timeline';

            groups[groupName].forEach(event => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'history-item';

                let userIcon = event.userType === 'system'
                    ? `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`
                    : `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

                itemDiv.style.cursor = 'pointer';
                itemDiv.title = 'Ver detalle de esta operación';
                itemDiv.onmouseover = () => { itemDiv.style.background = '#f8fafc'; itemDiv.style.borderRadius = '8px'; };
                itemDiv.onmouseout = () => { itemDiv.style.background = 'transparent'; };
                const eventSnap = { ...event };
                itemDiv.onclick = () => abrirDetalleHistorial(eventSnap);

                itemDiv.innerHTML = `
                    <div class="history-dot ${event.dotClass}"></div>
                    <div class="history-content" style="padding: 0.5rem;">
                        <div class="history-header">
                            <span class="history-title">${event.title}</span>
                            <span class="history-time">${event.time}</span>
                        </div>
                        <div class="history-body">${event.body}</div>
                        <div class="history-user">
                            ${userIcon} <span style="margin-left:5px;">${event.user}</span>
                        </div>
                    </div>
                `;
                timelineDiv.appendChild(itemDiv);
            });
            contentArea.appendChild(timelineDiv);
        });
    }

    // Pagination controls
    if (totalPages > 1) {
        const pagDiv = document.createElement('div');
        pagDiv.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:1rem;margin-top:1.5rem;padding:0.5rem;';
        pagDiv.innerHTML = `
            <button onclick="changeHistoryPage(-1)" style="padding:0.5rem 1rem;border:1px solid var(--color-border);border-radius:20px;background:white;cursor:pointer;font-size:0.85rem;" ${historyCurrentPage === 0 ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>&#8592; Anterior</button>
            <span style="font-size:0.85rem;color:var(--color-text-muted);">Página <strong>${historyCurrentPage + 1}</strong> de <strong>${totalPages}</strong></span>
            <button onclick="changeHistoryPage(1)" style="padding:0.5rem 1rem;border:1px solid var(--color-border);border-radius:20px;background:white;cursor:pointer;font-size:0.85rem;" ${historyCurrentPage >= totalPages - 1 ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>Siguiente &#8594;</button>
        `;
        contentArea.appendChild(pagDiv);
    }
}

window.changeHistoryPage = function (delta) {
    const totalPages = Math.ceil(historyCurrentData.length / HISTORY_PAGE_SIZE);
    historyCurrentPage = Math.max(0, Math.min(historyCurrentPage + delta, totalPages - 1));
    renderHistoryPage();
    document.getElementById('historyListContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ============================================================
// MODAL DE DETALLE (Solo lectura) — abre al clic en cualquier registro
// ============================================================
function abrirDetalleHistorial(rec) {
    console.log('📋 ABRIR DETALLE HISTORIAL - rec:', rec);

    // Si es un evento de Corte, usar showCorteDetail si está disponible
    const original = rawAudits.find(r => r.id === rec.id) || {};
    console.log('📄 Registro original encontrado:', original);

    // ============================================================
    // CASO 1: Tareas operativas (8.01, 8.02, etc.) — mostrar cálculo completo
    // ============================================================
    const isTareaOperativa = ['base', '8.01', '8.02', '8.03', '8.04', '8.06', '8.07'].includes(original.tipo || rec.type);
    if (isTareaOperativa) {
        // Extraer datos JSON del detalle
        let datosParseados = null;
        if (original.detalle && original.detalle.includes('__JSON__:')) {
            try {
                const jsonPart = original.detalle.split('__JSON__:')[1];
                datosParseados = JSON.parse(jsonPart);
            } catch (e) {
                console.error('❌ MODAL - No se pudo parsear JSON del detalle:', e);
            }
        }

        // Extraer código de socio: prioridad JSON > campo directo > regex
        const codSocio = datosParseados?.codSocio ||
            (original.detalle?.match(/[Ss]ocio:\s*([^\|]+)/)?.[1])?.trim() ||
            original.cod_socio ||
            original.codSocio ||
            'N/A';
        const resultadoTexto = original.resultado || rec.title || '';
        const formulaHtml = datosParseados?.formulaHtml || original.formula_html || original.formulaHtml || '';

        const id = 'histDetailModal';
        let modal = document.getElementById(id);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = id;
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
            // Allow closing by clicking outside the modal content
            modal.onclick = function (e) {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            };
            document.body.appendChild(modal);
        }

        // Construir contenido del modal: SIEMPRE codSocio + recuadro visual idéntico a la calculadora
        let calculoHtml = `
            <div style="display:flex;flex-direction:column;gap:0.8rem;">
                <!-- Código de asociado -->
                <div style="display:flex;justify-content:space-between;align-items:center;background:#f0f9ff;padding:0.8rem 1rem;border-radius:8px;">
                    <span style="color:#64748b;font-size:0.82rem;text-transform:uppercase;font-weight:600;">Socio / Usuario</span>
                    <span style="font-weight:700;color:#1e293b;font-size:1.05rem;">${codSocio}</span>
                </div>`;

        // Recuadro visual: EXACTAMENTE igual que mkResultBox() de la calculadora
        if (formulaHtml) {
            calculoHtml += `
                <div style="border:2px solid #334155;border-radius:14px;background:white;overflow:hidden;">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:1.4rem 2rem;gap:2rem;">
                        <div style="font-size:1.05rem;color:#1e293b;font-family:'Courier New',monospace;line-height:2;flex:1;">${formulaHtml}</div>
                        <div style="border:3px solid #334155;border-radius:8px;padding:0.6rem 1.2rem;white-space:nowrap;font-size:1.1rem;font-weight:700;color:#1e293b;font-family:'Courier New',monospace;min-width:130px;text-align:center;">${resultadoTexto}</div>
                    </div>
                </div>`;
        }

        // Evaluación por factura (meses altos) — solo si existen
        if (datosParseados?.mesesAltos && datosParseados.mesesAltos.length > 0) {
            const resultadoNum = datosParseados.resultadoFinal || parseFloat(resultadoTexto) || 0;
            const filasMeses = datosParseados.mesesAltos.map(m => {
                const reduccion = m.reduccion || customRound(m.consumo - resultadoNum);
                let color, icono, etiqueta;
                if (reduccion >= 10) {
                    color = '#f0fdf4;color:#166534;border:1px solid #bbf7d0;';
                    icono = '🟢'; etiqueta = 'Procedente';
                } else if (reduccion >= 6) {
                    color = '#fefce8;color:#854d0e;border:1px solid #fde68a;';
                    icono = '🟡'; etiqueta = 'Reducción pequeña';
                } else {
                    color = '#fef2f2;color:#991b1b;border:1px solid #fecaca;';
                    icono = '🔴'; etiqueta = 'No procedente';
                }
                return `<div style="background:${color}border-radius:8px;padding:0.7rem 0.9rem;display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;">
                    <div><strong>${m.mes}</strong><br><small>Original: ${m.consumo} m³ → Ajustado: ${resultadoNum} m³</small></div>
                    <div style="text-align:right;">${icono} ${etiqueta}<br><small>Reducción: ${reduccion} m³</small></div>
                </div>`;
            }).join('');

            calculoHtml += `
                <div style="display:flex;flex-direction:column;gap:0.4rem;">
                    <span style="color:#64748b;font-size:0.75rem;text-transform:uppercase;font-weight:600;">Evaluación por factura</span>
                    ${filasMeses}
                </div>`;
        }

        // Resultado final destacado
        calculoHtml += `
                <div style="display:flex;justify-content:center;align-items:center;background:#eff6ff;padding:0.8rem;border-radius:8px;margin-top:0.5rem;">
                    <span style="color:#1d4ed8;font-weight:700;font-size:1.2rem;">${resultadoTexto}</span>
                </div>
            </div>`;

        modal.innerHTML = `
        <div class="audit-detail-modal">
            <div class="audit-detail-header">
                <h3 class="audit-detail-title">${rec.title}</h3>
                <button class="audit-detail-close" onclick="document.getElementById('histDetailModal').style.display='none'">&times;</button>
            </div>
            <div class="audit-detail-body-container" style="padding:1.2rem;">
                ${calculoHtml}
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0;border-top:1px solid #e2e8f0;margin-top:1rem;">
                    <span style="font-size:0.82rem;color:#64748b;display:flex;align-items:center;gap:0.3rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <strong>${rec.user || original.operador || 'Sistema'}</strong>
                    </span>
                    <span style="font-size:0.82rem;color:#64748b;display:flex;align-items:center;gap:0.3rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        ${rec.group} · ${rec.time}
                    </span>
                </div>
            </div>
            <div class="audit-detail-footer-actions">
                <button class="audit-detail-close-btn" onclick="document.getElementById('histDetailModal').style.display='none'">Cerrar</button>
            </div>
        </div>`;
        modal.style.display = 'flex';
        return;
    }

    // Verificar si el detalle tiene formato de evento de corte
    // Formato nuevo: "Zona: {nombre}. UV: Y. Fecha del corte: 2026-04-10. Detalle. Horario: HH:MM - HH:MM"
    // Formato viejo: "Zona ID: X. UV: Y. Fecha del corte: 2026-04-10. ..."
    const det = original.detalle || '';
    const resultado = original.resultado || '';

    // Detectar si es evento de corte por el resultado o el detalle
    const esEventoCorte = original.tipo === 'evento' ||
        resultado.includes('Corte programado') ||
        resultado.includes('Evento modificado') ||
        resultado.includes('Evento eliminado') ||
        (det.includes('Zona') && det.includes('Fecha del corte:'));

    console.log('🔍 ¿Es evento de corte?', esEventoCorte);
    console.log('📝 tipo:', original.tipo);
    console.log('📝 resultado:', resultado);
    console.log('📝 detalle:', det);

    if (esEventoCorte) {
        const isEliminacion = resultado.includes('Evento eliminado');

        // Parsear cada campo del detalle usando expresiones regulares más precisas
        // Soportar ambos formatos: "Zona: {nombre}" y "Zona ID: {id}"
        let zonaMatch = det.match(/Zona\s*(?:ID:\s*)?:\s*([^\.]+)/);
        if (!zonaMatch) zonaMatch = det.match(/Zona ID:\s*([^\.]+)/); // fallback formato viejo
        const uvMatch = det.match(/UV:\s*([^\.]+)/);
        const fechaMatch = det.match(/Fecha del corte:\s*(\d{4}-\d{2}-\d{2})/);
        // Soportar ambos formatos de horario: "Horario: HH:MM - HH:MM" y "Horario: HH:MM-HH:MM"
        const horarioMatch = det.match(/Horario:\s*([^\.\n]+)/);

        console.log('🔍 Matches:', { zonaMatch, uvMatch, fechaMatch, horarioMatch });

        // Extraer el detalle/motivo: está entre "Fecha del corte: YYYY-MM-DD. " y ". Horario:"
        let motivo = '';
        const fechaMatchFull = det.match(/Fecha del corte:\s*\d{4}-\d{2}-\d{2}\.\s*(.*?)\.\s*Horario:/s);
        if (fechaMatchFull && fechaMatchFull[1]) {
            motivo = fechaMatchFull[1].trim();
        }
        console.log('📝 Motivo extraído:', motivo);

        // Si showCorteDetail está disponible, intentar usarlo con los datos parseados
        if (typeof showCorteDetail === 'function') {
            // Primero intentar buscar por ID en window.allCuts
            const cutEncontrado = window.allCuts?.scheduled?.find(c => String(c.id) === String(original.id)) ||
                window.allCuts?.completed?.find(c => String(c.id) === String(original.id));

            if (cutEncontrado) {
                console.log('✅ Evento encontrado en caché, abriendo con showCorteDetail');
                showCorteDetail(original.id);
                return;
            }

            // Si no está en caché, construir datos temporales y mostrar
            console.log('⚠️ Evento no encontrado en caché, mostrando con datos parseados');
        }

        const body = document.getElementById('corteDetailBody');
        if (body) {
            // El título está en resultado: "Corte programado: {titulo}", "Evento modificado: {titulo}" o "Evento eliminado: {titulo}"
            let titulo = (resultado || 'Corte Programado').trim();
            titulo = titulo.replace('Corte programado: ', '').replace('Evento modificado: ', '').replace('Evento eliminado: ', '').trim();

            const zona = zonaMatch ? zonaMatch[1].trim() : '';
            const uv = uvMatch ? uvMatch[1].trim() : '';
            const fechaRaw = fechaMatch ? fechaMatch[1].trim() : '';
            const horario = horarioMatch ? horarioMatch[1].trim() : '';

            console.log('📋 Datos para modal:', { titulo, zona, uv, fechaRaw, horario, motivo });

            // Convert fecha YYYY-MM-DD to long Spanish format
            let fechaDisplay = fechaRaw;
            if (fechaRaw && fechaRaw.match(/^\d{4}-\d{2}-\d{2}$/)) {
                try {
                    fechaDisplay = new Date(fechaRaw + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
                } catch (e) { }
            }

            body.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:1rem;">
                    ${isEliminacion ? `
                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:0.75rem;">
                        <div style="color:#dc2626;font-size:0.78rem;text-transform:uppercase;font-weight:600;">⚠️ EVENTO ELIMINADO</div>
                        <div style="color:#dc2626;font-size:0.92rem;">Este evento fue eliminado del sistema</div>
                    </div>` : ''}
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;background:#f8fafc;padding:1.2rem;border-radius:10px;font-size:0.9rem;">
                        <!-- TÍTULO -->
                        <div style="grid-column:1/-1;">
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Título</span>
                            <div style="margin-top:0.3rem;font-size:1.05rem;font-weight:600;color:#1e293b;">${titulo}</div>
                        </div>
                        
                        <!-- ZONA -->
                        <div>
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Zona</span>
                            <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${zona || '—'}</div>
                        </div>
                        
                        <!-- UV AFECTADA -->
                        <div>
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">UV Afectada</span>
                            <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${uv || '—'}</div>
                        </div>
                        
                        <!-- FECHA DEL CORTE -->
                        <div>
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Día del Corte</span>
                            <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${fechaDisplay || '—'}</div>
                        </div>
                        
                        <!-- HORARIO -->
                        <div>
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Horario del Corte</span>
                            <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${horario || '—'}</div>
                        </div>
                        
                        <!-- DETALLE / MOTIVO -->
                        ${motivo ? `
                        <div style="grid-column:1/-1;border-top:1px solid #e2e8f0;padding-top:0.8rem;margin-top:0.3rem;">
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Detalle / Motivo</span>
                            <div class="detalle-scroll-container" style="margin-top:0.5rem;font-size:0.92rem;color:#475569;line-height:1.6;">${motivo}</div>
                        </div>
                        ` : ''}
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-top:1px solid #e2e8f0;">
                        <span style="font-size:0.82rem;color:#64748b;display:flex;align-items:center;gap:0.3rem;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <strong>${rec.user || original.operador || 'Sistema'}</strong>
                        </span>
                        <span style="font-size:0.82rem;color:#64748b;display:flex;align-items:center;gap:0.3rem;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            ${rec.group} · ${rec.time}
                        </span>
                    </div>
                </div>
            `;

            if (typeof openModal === 'function') {
                openModal('corteDetailModal');
            }
            return;
        }
    }

    // Default detail modal for non-event records
    const id = 'histDetailModal';
    let modal = document.getElementById(id);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = id;
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        // Allow closing by clicking outside the modal content
        modal.onclick = function (e) {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
        document.body.appendChild(modal);
    }

    const formulaHtml = original.formula_html || original.formulaHtml || '';
    const resultadoDefault = original.resultado || rec.title;
    const socioMatch = (rec.body || '').match(/Socio:\s*([^\.]+)/);
    const socio = socioMatch ? socioMatch[1].trim() : null;

    const bodyText = rec.body || '';
    const truncado = bodyText.length > 220;
    const bodyShort = truncado ? bodyText.slice(0, 220) + '…' : bodyText;

    // Build structured detail sections
    let detailSectionsHtml = '';

    if (socio) {
        detailSectionsHtml += `
            <div class="audit-detail-item">
                <div class="audit-detail-label">SOCIO / USUARIO</div>
                <div class="audit-detail-value">${socio}</div>
            </div>`;
    }

    detailSectionsHtml += `
        <div class="audit-detail-item">
            <div class="audit-detail-label">OPERADOR / RESPONSABLE</div>
            <div class="audit-detail-value">${rec.user || '–'}</div>
        </div>
        <div class="audit-detail-item">
            <div class="audit-detail-label">FECHA Y HORA DE REGISTRO</div>
            <div class="audit-detail-value">${rec.group} · ${rec.time}</div>
        </div>`;

    // Ticket box HTML (same style as tareas calculators)
    const ticketBox = formulaHtml ? `
        <div class="audit-detail-section" style="margin-top: 1.5rem;">
            <div class="audit-detail-label" style="margin-bottom: 0.75rem;">RESULTADO DEL CÁLCULO</div>
            <div class="audit-ticket-box">
                <div class="audit-ticket-content">
                    <div class="audit-ticket-formula">${formulaHtml}</div>
                    <div class="audit-ticket-result">${resultado}</div>
                </div>
            </div>
        </div>` : `
        <div class="audit-detail-section" style="margin-top: 1.5rem;">
            <div class="audit-detail-label" style="margin-bottom: 0.75rem;">DETALLE DE LA OPERACIÓN</div>
            <div class="audit-detail-body">
                <div class="audit-detail-text">${bodyShort}</div>
                ${truncado ? `<details class="audit-detail-expand"><summary>Ver completo</summary><div class="audit-detail-text">${bodyText}</div></details>` : ''}
            </div>
        </div>`;

    modal.innerHTML = `
    <div class="audit-detail-modal">
        <div class="audit-detail-header">
            <h3 class="audit-detail-title">${rec.title}</h3>
            <button class="audit-detail-close" onclick="document.getElementById('histDetailModal').style.display='none'">×</button>
        </div>
        <div class="audit-detail-body-container">
            <div class="audit-detail-sections">
                ${detailSectionsHtml}
            </div>
            ${ticketBox}
        </div>
        <div class="audit-detail-footer-actions">
            <button class="audit-detail-close-btn" onclick="document.getElementById('histDetailModal').style.display='none'">Cerrar</button>
        </div>
    </div>`;
    modal.style.display = 'flex';
}
