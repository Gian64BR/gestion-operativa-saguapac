/**
 * dashboard_logic.js
 * Lógica específica para dashboard.html
 */

// Global Store for generated dynamic cuts
window.allCuts = {
    scheduled: [],
    completed: []
};

// Formatter helper
const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

function formatDateFull(d) {
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Iniciar cabecera y variables globales (utils.js)
    if (typeof setupHeader === 'function') setupHeader();

    // Load zones into dropdown for event form
    try {
        const zonasResponse = await apiFetch('/api/zonas');
        const zonas = zonasResponse.data || [];
        const zonaSelect = document.getElementById('adminEventZonaSelect');
        if (zonaSelect) {
            zonaSelect.innerHTML = '<option value="">-- Seleccionar Zona --</option>';
            zonas.forEach(z => {
                const opt = document.createElement('option');
                opt.value = z.id;
                opt.textContent = z.nombre;
                zonaSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Error loading zones:', err);
    }

    try {
        // Fetch live stats from dedicated API
        const [statsResponse, eventsResponse] = await Promise.all([
            apiFetch('/api/dashboard/stats'),
            apiFetch('/api/events')
        ]);

        const stats = statsResponse.data || statsResponse;
        const events = eventsResponse.data || eventsResponse;

        // Update Internos Count
        const internosCountEl = document.getElementById('internosCount');
        if (internosCountEl) internosCountEl.textContent = stats.totalContactos;

        // Update Socios Count
        const sociosCountEl = document.getElementById('sociosCount');
        if (sociosCountEl) sociosCountEl.textContent = stats.totalSocios;

        // Update Today Stats
        const modTodayEl = document.getElementById('modificacionesHoy');
        if (modTodayEl) modTodayEl.textContent = stats.operacionesHoy;

        const cutsTodayEl = document.getElementById('cortesHoy');
        if (cutsTodayEl) cutsTodayEl.textContent = stats.eventosProximos;

        // Update active users
        const usersCountEl = document.getElementById('usuariosActivos');
        if (usersCountEl) usersCountEl.textContent = stats.totalUsuarios;

        // Populate the 3 Gestión de Cortes panels from events table
        const now = new Date();
        // Use LOCAL date to avoid UTC timezone shift (Bolivia = UTC-4)
        const todayLocalStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Rangos móviles de 30 días (1 mes hacia atrás y hacia adelante)
        const monthAgo = new Date(todayStart);
        monthAgo.setDate(monthAgo.getDate() - 30);

        const monthAhead = new Date(todayStart);
        monthAhead.setDate(monthAhead.getDate() + 30);

        // Store all events globally for calendar filtering
        window.allEvents = events;

        // Classify into 3 groups
        const cutsToday = [];
        const cutsMonth = []; // Programados del mes (próximos 30 días)
        const cutsCompletedMonth = []; // Realizados del mes (últimos 30 días)

        events.forEach(e => {
            // Extraer la porción de fecha YYYY-MM-DD de la API para evitar desfases de zona horaria
            const eventDateStr = e.fecha ? e.fecha.split('T')[0] : '';
            let eventDate = new Date();
            if (eventDateStr) {
                const [yyyy, mm, dd] = eventDateStr.split('-');
                eventDate = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
            } else if (e.fecha) {
                eventDate = new Date(e.fecha);
            }

            // Normalizar estado (puede venir en diferentes formatos)
            const estado = (e.estado || '').toLowerCase().trim();
            const esCompletado = estado === 'completado' || estado === 'realizado' || estado === 'ejecutado';
            const esProgramado = estado === 'programado' || estado === 'en_proceso' || estado === 'pendiente';

            console.log(`🔍 Evento: "${e.titulo}" | Fecha: ${eventDateStr} | Estado: "${estado}" | Es programado: ${esProgramado} | Es completado: ${esCompletado}`);

            if (eventDateStr === todayLocalStr) {
                // Eventos de hoy van a "Programados para hoy"
                console.log(`   → Va a "Programados para hoy"`);
                cutsToday.push(e);
            } else if (eventDate > todayStart && eventDate <= monthAhead) {
                // Eventos futuros dentro de los próximos 30 días van a "Programados del mes"
                console.log(`   → Va a "Programados del mes" (futuro: ${eventDate.toLocaleDateString()})`);
                cutsMonth.push(e);
            } else if (eventDate >= monthAgo && eventDate < todayStart) {
                // Eventos pasados dentro de los últimos 30 días van a "Realizados del mes"
                console.log(`   → Va a "Realizados del mes" (pasado: ${eventDate.toLocaleDateString()})`);
                cutsCompletedMonth.push(e);
            } else if (eventDate < monthAgo) {
                console.log(`   → NO se muestra en el panel: superó los 30 días de antigüedad`);
            } else if (eventDate > monthAhead) {
                console.log(`   → NO se muestra: es muy futuro (> 30 días)`);
            }
        });

        // Also populate legacy allCuts for calendar and modal references
        window.allCuts.scheduled = events
            .filter(e => {
                const estado = (e.estado || '').toLowerCase().trim();
                return estado === 'programado' || estado === 'en_proceso' || estado === 'pendiente';
            })
            .map(e => ({
                id: e.id,
                title: e.titulo,
                zona: e.zona_nombre || 'Sin zona',
                zone: e.zona_nombre || 'Sin zona',
                zona_id: e.zona_id || null,
                zona_nombre: e.zona_nombre || null,
                detail: e.detalle,
                detalle: e.detalle,
                uv_afectada: e.uv_afectada || '',
                fecha: e.fecha || '',
                time: (e.hora_inicio && e.hora_fin) ? `${e.hora_inicio} – ${e.hora_fin}` : 'Horario pendiente',
                dateObj: e.fecha ? (() => {
                    const [y, m, d] = e.fecha.split('T')[0].split('-');
                    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                })() : new Date()
            }));

        window.allCuts.completed = events
            .filter(e => {
                const estado = (e.estado || '').toLowerCase().trim();
                return estado === 'completado' || estado === 'realizado' || estado === 'ejecutado';
            })
            .map(e => ({
                id: e.id,
                title: e.titulo,
                zona: e.zona_nombre || 'Sin zona',
                zone: e.zona_nombre || 'Sin zona',
                zona_id: e.zona_id || null,
                zona_nombre: e.zona_nombre || null,
                detail: e.detalle,
                detalle: e.detalle,
                uv_afectada: e.uv_afectada || '',
                fecha: e.fecha || '',
                time: 'Ejecutado',
                relativeTime: '',
                dateObj: e.fecha ? (() => {
                    const [y, m, d] = e.fecha.split('T')[0].split('-');
                    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                })() : new Date()
            }));

        // Render the 3 panels
        console.log('📊 Eventos cargados:', events.length);
        console.log('📅 Rango Realizados:', monthAgo.toLocaleDateString(), 'a', todayStart.toLocaleDateString());
        console.log('📅 Rango Programados:', todayStart.toLocaleDateString(), 'a', monthAhead.toLocaleDateString());
        console.log('📅 Programados para hoy:', cutsToday.length);
        console.log('📅 Programados del mes (próximos 30 días):', cutsMonth.length);
        console.log('✅ Realizados del mes (últimos 30 días):', cutsCompletedMonth.length);

        renderCutsPanel('cutsToday', cutsToday, 'Sin cortes programados para hoy');
        renderCutsPanel('cutsWeek', cutsMonth, 'Sin cortes programados este mes');
        renderCutsPanel('cutsCompleted', cutsCompletedMonth, 'Sin cortes realizados este mes');

    } catch (err) {
        console.error('Error loading dashboard stats:', err);
    }

    // Load users panel from DB
    loadUsersPanel();

    // Auto-refresh users panel every 30s to update presence status
    setInterval(() => {
        loadUsersPanel();
    }, 30000);

    // 2. Renderizar saludo dinámico según la hora
    const profileName = localStorage.getItem('profileDisplayName') || localStorage.getItem('userName') || 'Usuario';
    const role = localStorage.getItem('userRole') || 'Usuario';

    // Saludo según hora del sistema
    const hora = new Date().getHours();
    let saludo;
    if (hora >= 4 && hora < 12) {
        saludo = '¡Buen día!';
    } else if (hora >= 12 && hora < 18) {
        saludo = '¡Buenas tardes!';
    } else {
        saludo = '¡Buenas noches!';
    }

    const greetingTextEl = document.getElementById('welcomeGreetingText');
    if (greetingTextEl) greetingTextEl.textContent = saludo;

    const welcomeNameEl = document.getElementById('welcomeName');
    if (welcomeNameEl) welcomeNameEl.textContent = profileName;

    const greetingEl = document.getElementById('dashboardGreeting');
    if (greetingEl) {
        greetingEl.textContent = `${saludo} ${profileName} – Cooperativa de Agua`;
    }

    // Insertar botón 'Crear evento' si es Admin
    if (role === 'admin' || role === 'administrador') {
        const adminEventCard = document.getElementById('adminEventSection');
        if (adminEventCard) {
            adminEventCard.style.display = 'flex';
            adminEventCard.style.flexDirection = 'column';
        }
    }

    // 3. Renderizar Data Inicial (Dashboard)
    setupSummaryPeriodSelector();
    renderSummaryBoxes();
    setupCutsPeriodSelector();

    // Iniciar Almanaque
    goToToday();
});

function setupSummaryPeriodSelector() {
    const btn = document.getElementById('summaryPeriodBtn');
    const menu = document.getElementById('summaryPeriodMenu');

    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });

    window.updateSummary = function (period) {
        btn.innerHTML = `${period} <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        menu.style.display = 'none';

        const data = summaryData[period];
        if (data) {
            const valGen = document.getElementById('valGeneradas');
            if (valGen) valGen.innerHTML = `<div class="indicator blue"></div> ${data.generadas}`;

            const valProg = document.getElementById('valProgreso');
            if (valProg) valProg.innerHTML = `<div class="indicator green"></div> ${data.progreso}`;

            const valRev = document.getElementById('valRevision');
            if (valRev) valRev.innerHTML = `<div class="indicator blue"></div> ${data.revision}`;

            const valPend = document.getElementById('valPendientes');
            if (valPend) valPend.innerHTML = `<div class="indicator blue"></div> ${data.pendientes}`;
        }
    };
}

function renderSummaryBoxes() {
    if (typeof updateSummary === 'function') {
        updateSummary('Esta semana');
    }
}

function setupCutsPeriodSelector() {
    const btn = document.getElementById('cutsPeriodBtn');
    const menu = document.getElementById('cutsPeriodMenu');

    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });

    window.updateCuts = function (period) {
        btn.innerHTML = `${period} <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        menu.style.display = 'none';

        const targetDate = new Date();
        if (period === 'Ayer') {
            targetDate.setDate(targetDate.getDate() - 1);
        } else if (period === 'Hace una semana') {
            targetDate.setDate(targetDate.getDate() - 7);
        } else if (period === 'Hace un mes') {
            targetDate.setMonth(targetDate.getMonth() - 1);
        }

        currentAlmanacBaseDate = new Date(targetDate);

        const mSelect = document.getElementById('almanacMonthSelect');
        const ySelect = document.getElementById('almanacYearSelect');
        if (mSelect && ySelect) {
            mSelect.value = currentAlmanacBaseDate.getMonth();
            ySelect.value = currentAlmanacBaseDate.getFullYear();
        }

        initCalendarFocus(currentAlmanacBaseDate, targetDate);
    };
}

// --- Dynamic Calendar & Filters ---

function generateDynamicCutsMock() {
    // Events are loaded from API via loadEvents()
}

window.scrollCalendar = function (offset) {
    const container = document.getElementById('calendarDaysContainer');
    if (container) {
        container.scrollBy({ left: offset, behavior: 'smooth' });
    }
};

let currentAlmanacBaseDate = new Date();

window.changeAlmanacMonthYear = function () {
    const m = document.getElementById('almanacMonthSelect').value;
    const y = document.getElementById('almanacYearSelect').value;
    if (m && y) {
        currentAlmanacBaseDate = new Date(parseInt(y), parseInt(m), 1);
        initCalendarFocus(currentAlmanacBaseDate, false);
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

    initCalendarFocus(today, today);
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

    // Generate accurate days for the selected month
    for (let day = 1; day <= daysInMonth; day++) {
        let loopDate = new Date(targetYear, targetMonth, day);

        let div = document.createElement('div');
        div.className = 'day-box';

        let dNum = String(day).padStart(2, '0');
        let dName = dias[loopDate.getDay()];

        div.innerHTML = `<h4>${dNum}</h4><span>${dName}</span>`;

        // Enclosure for click event
        div.onclick = () => selectCalendarDay(new Date(loopDate), div);
        container.appendChild(div);

        // Selection priority
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

    // Auto-select and scroll
    if (boxToSelect) {
        selectCalendarDay(dateToSelect, boxToSelect);
        setTimeout(() => {
            if (container && boxToSelect) {
                const scrollLeft = boxToSelect.offsetLeft - (container.clientWidth / 2) + (boxToSelect.clientWidth / 2);
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }, 300);
    }
};

window.selectCalendarDay = function (dateObj, elementHtml) {
    // 1. Update UI active class
    const container = document.getElementById('calendarDaysContainer');
    if (container) {
        Array.from(container.children).forEach(child => child.classList.remove('active'));
    }
    if (elementHtml) elementHtml.classList.add('active');

    // 2. Update Header Title text with full date
    const label = document.getElementById('almanacCurrentDate');
    if (label) {
        label.textContent = formatDateFull(dateObj);
    }

    // 3. Filter Cuts
    filterCutsByDate(dateObj);
};

function renderCutsPanel(containerId, eventsArray, emptyMsg) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (eventsArray.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:0.8rem; color:var(--color-text-muted); font-size:0.85rem;">${emptyMsg}</div>`;
        return;
    }

    container.innerHTML = '';
    eventsArray.forEach(e => {
        const titulo = e.titulo || e.title || 'Evento';
        const zona = e.zona_nombre || 'Sin zona';
        const detalle = e.detalle || '';
        const horaInicio = e.hora_inicio || '';
        const horaFin = e.hora_fin || '';
        const timeStr = (horaInicio && horaFin) ? `${horaInicio} – ${horaFin}` : 'Horario pendiente';

        // Fix Timezone Shift Visual Issue
        let eventDate = new Date();
        const rawDate = e.fecha ? e.fecha.split('T')[0] : '';
        if (rawDate) {
            const [y, m, d] = rawDate.split('-');
            eventDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        } else {
            eventDate = new Date(e.fecha);
        }

        const dateStr = `${eventDate.getDate()} de ${meses[eventDate.getMonth()]}`;
        const truncDetail = detalle.length > 60 ? detalle.substring(0, 60) + '...' : detalle;
        const isCompleted = containerId === 'cutsCompleted';
        const eid = e.id || '';

        // Render card for panel
        const uv = e.uv_afectada || '';

        container.innerHTML += `
            <div style="background:white; padding:0.8rem 1rem; border-radius:10px; font-size:0.85rem; cursor:pointer; transition:all 0.2s; border:1px solid var(--color-border); min-width:220px; max-width:280px; flex-shrink:0; ${isCompleted ? 'border-left:4px solid #10b981;' : ''}"
                 onclick="showCorteDetail('${eid}', '${zona}', '${timeStr}')"
                 onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.08)'"
                 onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
                <strong style="color:var(--color-sidebar); display:block; margin-bottom:0.3rem;">${titulo}</strong>
                <div style="color:var(--color-text-muted); font-size:0.82rem; display:flex; flex-direction:column; gap:0.15rem;">
                    ${zona !== 'Sin zona' ? `<span>📍 ${zona}</span>` : ''}
                    ${uv ? `<span>🏘 UV: ${uv}</span>` : ''}
                    <span>📅 ${dateStr}</span>
                    <span>⏰ ${timeStr}</span>
                    ${truncDetail ? `<span style="margin-top:0.2rem; font-style:italic;">📝 ${truncDetail}</span>` : ''}
                    ${isCompleted ? '<span style="color:#059669; font-weight:500; margin-top:0.2rem;">✅ Completado</span>' : ''}
                </div>
            </div>
        `;
    });
}

function filterCutsByDate(targetDate) {
    // This is called by calendar click — shows events for the selected date
    // We don't alter the 3 main panels, just the calendar header
    // The 3 panels are static based on today's date (set at page load)
}

window.showCorteDetail = function (id, zone, time) {
    const body = document.getElementById('corteDetailBody');
    if (!body) return;

    // Buscar el evento real por ID (comparación flexible string/number)
    const cut = window.allCuts?.scheduled?.find(c => String(c.id) === String(id)) ||
        window.allCuts?.completed?.find(c => String(c.id) === String(id));

    // Si no se encuentra el evento, intentar cargar desde API
    if (!cut) {
        console.warn(`⚠️ Evento con ID "${id}" no encontrado en caché, cargando desde API...`);
        loadCorteDetailFromAPI(id);
        return;
    }

    // Extraer todos los campos con fallbacks
    const titulo = cut.title || cut.titulo || zone || 'Sin título';
    const detalle = cut.detail || cut.detalle || cut.motivo || '';
    const zona = cut.zone || cut.zona || cut.zona_nombre || zone || 'Sin zona';
    const uv = cut.uv_afectada || cut.uv || '';

    // Formatear fecha correctamente
    let fecha = '';
    if (cut.fecha) {
        const fechaRaw = cut.fecha.toString().substring(0, 10);
        if (fechaRaw) {
            fecha = new Date(fechaRaw + 'T12:00:00').toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
        }
    }

    // Determinar el horario
    let horario = time || cut.time || 'Horario pendiente';
    if (cut.hora_inicio && cut.hora_fin) {
        horario = `${cut.hora_inicio} – ${cut.hora_fin}`;
    }

    // Determinar el título según estado
    let stateTitle = (horario === 'Ejecutado') ? 'Corte Realizado y Confirmado' : titulo;

    // Construir el HTML completo con TODOS los campos
    body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;background:#f8fafc;padding:1.2rem;border-radius:10px;font-size:0.9rem;">
                <!-- TÍTULO -->
                <div style="grid-column:1/-1;">
                    <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Título</span>
                    <div style="margin-top:0.3rem;font-size:1.05rem;font-weight:600;color:#1e293b;">${stateTitle}</div>
                </div>

                <!-- ZONA -->
                <div>
                    <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Zona</span>
                    <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${zona}</div>
                </div>

                <!-- UV AFECTADA -->
                <div>
                    <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">UV Afectada</span>
                    <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${uv || '—'}</div>
                </div>

                <!-- FECHA DEL CORTE -->
                <div>
                    <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Día del Corte</span>
                    <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${fecha || '—'}</div>
                </div>

                <!-- HORARIO -->
                <div>
                    <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Horario del Corte</span>
                    <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${horario !== 'Ejecutado' ? horario : 'Ejecutado'}</div>
                </div>

                <!-- DETALLE / MOTIVO -->
                ${detalle ? `
                <div style="grid-column:1/-1;border-top:1px solid #e2e8f0;padding-top:0.8rem;margin-top:0.3rem;">
                    <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Detalle / Motivo</span>
                    <div class="detalle-scroll-container" style="margin-top:0.5rem;font-size:0.92rem;color:#475569;line-height:1.6;">${detalle}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    if (typeof openModal === 'function') {
        openModal('corteDetailModal');
    }
};

// Función auxiliar para cargar detalle del evento desde API si no está en caché
async function loadCorteDetailFromAPI(id) {
    try {
        const response = await apiFetch(`/api/events/${id}`);
        const event = response.data || response;

        if (!event) {
            alert('No se encontró el detalle del corte programado.');
            return;
        }

        // Agregar a window.allCuts para futuras consultas
        const cutData = {
            id: event.id,
            title: event.titulo,
            zona: event.zona_nombre || 'Sin zona',
            zone: event.zona_nombre || 'Sin zona',
            zona_id: event.zona_id || null,
            zona_nombre: event.zona_nombre || null,
            detail: event.detalle,
            detalle: event.detalle,
            uv_afectada: event.uv_afectada || '',
            fecha: event.fecha || '',
            hora_inicio: event.hora_inicio || '',
            hora_fin: event.hora_fin || '',
            time: (event.hora_inicio && event.hora_fin) ? `${event.hora_inicio} – ${event.hora_fin}` : 'Horario pendiente'
        };

        // Agregar al caché
        const estado = (event.estado || '').toLowerCase().trim();
        const esCompletado = estado === 'completado' || estado === 'realizado' || estado === 'ejecutado';
        if (esCompletado) {
            window.allCuts.completed.push(cutData);
        } else {
            window.allCuts.scheduled.push(cutData);
        }

        // Mostrar el detalle
        showCorteDetail(id);
    } catch (err) {
        console.error('Error al cargar detalle del evento:', err);
        alert('No se pudo cargar el detalle del corte programado.');
    }
}

// Función global para buscar y abrir el detalle de un corte desde un mensaje
window.findAndOpenCorteDetail = async function (messageText) {
    console.log('🔍 findAndOpenCorteDetail llamado con:', messageText);

    // Extraer el título del mensaje (formato: "📅 Nuevo corte programado: TITULO. Zona: ...")
    // o "✏️ Evento modificado: TITULO. Zona: ..."
    let tituloExtraido = null;
    const matchNuevo = messageText.match(/📅 Nuevo corte programado:\s*(.+?)\.\s*Zona:/);
    const matchModificado = messageText.match(/✏️ Evento modificado:\s*(.+?)\.\s*Zona:/);

    if (matchNuevo) {
        tituloExtraido = matchNuevo[1].trim();
    } else if (matchModificado) {
        tituloExtraido = matchModificado[1].trim();
    }

    console.log('📝 Título extraído del mensaje:', tituloExtraido);

    // Si no se pudo extraer, mostrar error
    if (!tituloExtraido) {
        console.warn('⚠️ No se pudo extraer el título del mensaje');
        // Intentar buscar en todos los eventos recientes
        if (window.allEvents && window.allEvents.length > 0) {
            // Ordenar por fecha descendente y tomar el más reciente
            const eventosOrdenados = [...window.allEvents].sort((a, b) => {
                return new Date(b.fecha) - new Date(a.fecha);
            });
            if (eventosOrdenados.length > 0) {
                const eventoMasReciente = eventosOrdenados[0];
                console.log('📅 Abriendo evento más reciente:', eventoMasReciente.titulo);
                showCorteDetail(eventoMasReciente.id);
                return;
            }
        }
        alert('No se pudo encontrar el detalle del corte programado.');
        return;
    }

    // Buscar en window.allCuts por título
    const cutEncontrado = window.allCuts?.scheduled?.find(c => c.title === tituloExtraido) ||
        window.allCuts?.completed?.find(c => c.title === tituloExtraido);

    if (cutEncontrado) {
        console.log('✅ Evento encontrado en caché:', cutEncontrado.title);
        showCorteDetail(cutEncontrado.id);
        return;
    }

    // Si no está en caché, buscar en window.allEvents
    if (window.allEvents && window.allEvents.length > 0) {
        const eventoEncontrado = window.allEvents.find(e => e.titulo === tituloExtraido);
        if (eventoEncontrado) {
            console.log('✅ Evento encontrado en allEvents:', eventoEncontrado.titulo);
            showCorteDetail(eventoEncontrado.id);
            return;
        }
    }

    // Si aún no se encuentra, cargar desde API
    console.log('⚠️ Evento no encontrado en caché, buscando en API...');
    try {
        const response = await apiFetch('/api/events');
        const eventos = response.data || response || [];
        const eventoAPI = eventos.find(e => e.titulo === tituloExtraido);

        if (eventoAPI) {
            console.log('✅ Evento encontrado en API:', eventoAPI.titulo);
            showCorteDetail(eventoAPI.id);
        } else {
            console.error('❌ Evento no encontrado:', tituloExtraido);
            alert('No se encontró el detalle del corte programado.');
        }
    } catch (err) {
        console.error('Error al buscar evento:', err);
        alert('No se pudo cargar el detalle del corte programado.');
    }
};

// ==========================================
// Módulo de Creación y Edición de Eventos (Administrador)
// ==========================================

let currentEventMode = 'create';

window.setEventMode = function (mode) {
    currentEventMode = mode;

    const btnCreate = document.getElementById('btnEventTabCreate');
    const btnEdit = document.getElementById('btnEventTabEdit');
    const selectContainer = document.getElementById('selectEventToEditContainer');
    const btnSave = document.getElementById('btnSaveEvent');
    const btnDelete = document.getElementById('btnDeleteEvent');

    if (!btnCreate) return; // Si no estamos en DOM

    if (mode === 'create') {
        btnCreate.style.background = 'white';
        btnCreate.style.color = 'var(--color-sidebar)';
        btnCreate.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
        btnCreate.style.fontWeight = '600';

        btnEdit.style.background = 'transparent';
        btnEdit.style.color = 'var(--color-text-muted)';
        btnEdit.style.boxShadow = 'none';
        btnEdit.style.fontWeight = '500';

        selectContainer.style.display = 'none';
        btnSave.textContent = 'Crear Evento';
        btnDelete.style.display = 'none';

        clearEventForm();
    } else {
        btnEdit.style.background = 'white';
        btnEdit.style.color = 'var(--color-sidebar)';
        btnEdit.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
        btnEdit.style.fontWeight = '600';

        btnCreate.style.background = 'transparent';
        btnCreate.style.color = 'var(--color-text-muted)';
        btnCreate.style.boxShadow = 'none';
        btnCreate.style.fontWeight = '500';

        selectContainer.style.display = 'flex';
        btnSave.textContent = 'Guardar Cambios';
        btnDelete.style.display = 'block';

        populateAdminEventDropdown();
        clearEventForm();
    }
};

function clearEventForm() {
    document.getElementById('adminEventId').value = '';
    document.getElementById('adminEventTitle').value = '';
    document.getElementById('adminEventDetail').value = '';
    document.getElementById('adminEventDate').value = '';
    document.getElementById('adminEventStartTime').value = '';
    document.getElementById('adminEventEndTime').value = '';
    document.getElementById('adminEventSelect').value = '';
    const uvField = document.getElementById('adminEventUV');
    if (uvField) uvField.value = '';
    const zonaSelect = document.getElementById('adminEventZonaSelect');
    if (zonaSelect) zonaSelect.value = '';
    const zonaHidden = document.getElementById('adminEventZona');
    if (zonaHidden) zonaHidden.value = '';
}

function populateAdminEventDropdown() {
    const select = document.getElementById('adminEventSelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Elige un evento --</option>';

    // Usar window.allEvents (desde API) - mostrar TODOS los eventos para poder editarlos
    const eventsToEdit = window.allEvents || [];

    eventsToEdit.forEach(event => {
        const opt = document.createElement('option');
        opt.value = event.id;
        // Mostrar estado del evento en el dropdown
        const estadoLabel = event.estado === 'programado' ? '🟡 Programado' :
            event.estado === 'completado' ? '🟢 Completado' :
                event.estado === 'en_proceso' ? '🟠 En proceso' : '🔴 Cancelado';
        const fechaLabel = event.fecha ? new Date(event.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        opt.textContent = `${estadoLabel} | ${fechaLabel} - ${event.titulo || event.title}`;
        select.appendChild(opt);
    });
}

window.loadEventForEdit = function (id) {
    if (!id) {
        clearEventForm();
        return;
    }

    // First try to find in allEvents (from API)
    let cut = window.allEvents?.find(e => e.id == id);

    // Fallback to allCuts.scheduled
    if (!cut) {
        cut = window.allCuts.scheduled.find(c => c.id == id);
    }

    if (cut) {
        document.getElementById('adminEventId').value = cut.id;
        document.getElementById('adminEventTitle').value = cut.titulo || cut.title || '';
        document.getElementById('adminEventDetail').value = cut.detalle || cut.detail || '';
        const uvField = document.getElementById('adminEventUV');
        if (uvField) uvField.value = cut.uv_afectada || '';

        // Load zona into select (by ID if available, otherwise by name)
        const zonaSelect = document.getElementById('adminEventZonaSelect');
        const zonaHidden = document.getElementById('adminEventZona');
        if (zonaSelect) {
            // Try to select by zona_id first, then by name
            if (cut.zona_id) {
                zonaSelect.value = cut.zona_id;
            } else if (cut.zona_nombre || cut.zona) {
                // Fallback: try to find by name
                const zonaName = cut.zona_nombre || cut.zona;
                // Find the option by text content
                for (let i = 0; i < zonaSelect.options.length; i++) {
                    if (zonaSelect.options[i].text.includes(zonaName)) {
                        zonaSelect.value = zonaSelect.options[i].value;
                        break;
                    }
                }
            }
        }
        if (zonaHidden) zonaHidden.value = cut.zona_nombre || cut.zona || '';

        // Load date
        if (cut.fecha) {
            const dateStr = cut.fecha.split('T')[0];
            document.getElementById('adminEventDate').value = dateStr;
        }

        // Load time
        document.getElementById('adminEventStartTime').value = cut.hora_inicio || '';
        document.getElementById('adminEventEndTime').value = cut.hora_fin || '';
    }
};

window.submitAdminEvent = async function () {
    const title = document.getElementById('adminEventTitle').value.trim();
    const zona = (document.getElementById('adminEventZona')?.value || '').trim();
    const uvAfectada = (document.getElementById('adminEventUV')?.value || '').trim();
    const detail = document.getElementById('adminEventDetail').value.trim();
    const dateVal = document.getElementById('adminEventDate').value;
    const startTime = document.getElementById('adminEventStartTime').value;
    const endTime = document.getElementById('adminEventEndTime').value;
    let id = document.getElementById('adminEventId').value;

    if (!title || !dateVal || !startTime || !endTime) {
        alert('Por favor ingrese Título, Fecha, Hora Inicio y Hora Fin para el evento.');
        return;
    }

    try {
        // Get zona_id from dropdown if available, otherwise use zona_name
        const zonaSelect = document.getElementById('adminEventZonaSelect');
        const zonaId = zonaSelect ? parseInt(zonaSelect.value) || null : null;
        const zonaName = zona || 'Sin zona';

        // Determinar si la fecha es pasada o futura
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const eventDate = new Date(dateVal);
        eventDate.setHours(0, 0, 0, 0);

        const eventData = {
            titulo: title,
            detalle: detail,
            fecha: dateVal,
            hora_inicio: startTime,
            hora_fin: endTime,
            zona_id: zonaId,
            uv_afectada: uvAfectada,
            operador: localStorage.getItem('userName') || 'Admin',
            // Si la fecha es pasada, marcar como completado; si es futura, como programado
            estado: eventDate < todayStart ? 'completado' : 'programado'
        };

        if (id && !id.startsWith('EVT-')) {
            // Update existing event
            await apiFetch(`/api/events/${id}`, {
                method: 'PUT',
                body: JSON.stringify(eventData)
            });
        } else {
            // Create new event - get the ID from response
            const response = await apiFetch('/api/events', {
                method: 'POST',
                body: JSON.stringify(eventData)
            });
            // Store the returned event ID for notifications
            id = response.data?.id || id;
        }

        // NOTA: La auditoría ahora se registra automáticamente en el backend

        // Preparar variables para notificaciones
        const [year, month, day] = dateVal.split('-');
        const timeFormatted = `${startTime} – ${endTime}`;
        const mesesNombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const dateDisplay = `${parseInt(day)} de ${mesesNombres[parseInt(month) - 1]}`;

        // Determinar si es creación o edición basado en el modo actual del formulario
        const actionVerb = currentEventMode === 'edit' ? 'modificó un evento' : 'programó nuevo evento';

        // Disparar alertas con el ID del evento para poder abrir el detalle después
        dispararAlertasGlobales(title, timeFormatted, detail, actionVerb, zonaName, dateDisplay, id);

        // Use custom system notification modal instead of native alert
        const msgText = currentEventMode === 'edit' ? '🟢 Evento modificado exitosamente.' : '🟢 Evento creado con éxito. El mensaje automático ha sido generado y enviado a todos los usuarios.';
        if (typeof showNotificationDetail === 'function') {
            showNotificationDetail(msgText, 'Justo ahora');
            setTimeout(() => location.reload(), 2500); // Give user time to read before reload
        } else {
            alert(msgText);
            location.reload();
        }
    } catch (err) {
        console.error('Error detallado al guardar evento:', err);
        alert('Error al guardar el evento: ' + err.message);
    }
};

window.deleteAdminEvent = async function () {
    const id = document.getElementById('adminEventId').value;
    const title = document.getElementById('adminEventTitle').value;
    const zona = (document.getElementById('adminEventZona')?.value || '').trim();
    const dateVal = document.getElementById('adminEventDate').value;
    const startTime = document.getElementById('adminEventStartTime').value;
    const endTime = document.getElementById('adminEventEndTime').value;
    const zonaName = zona || 'Sin zona';
    const operador = localStorage.getItem('userName') || 'Admin';

    if (!id) {
        alert("Primero selecciona el evento que deseas eliminar.");
        return;
    }

    if (confirm(`¿Estás seguro de que deseas ELIMINAR el corte "${title}"?`)) {
        try {
            await apiFetch(`/api/events/${id}`, {
                method: 'DELETE',
                body: JSON.stringify({ operador: operador })
            });

            // NOTA: La auditoría ahora se registra automáticamente en el backend

            alert("🔴 Evento eliminado.");
            location.reload();
        } catch (err) {
            console.error('Error al eliminar evento:', err);
            alert('Error al eliminar el evento.');
        }
    }
};

// Mensajes internos — solo se crean al crear/editar un evento
// NOTA: Las alertas del sistema se generan SOLO desde syncGlobalSystemAlerts (auditoría)
// para evitar duplicación. Los mensajes internos locales son solo para el operador actual.
function dispararAlertasGlobales(title, timeDesc, detail, actionVerb, zonaName, dateStr, eventId) {
    const timestamp = new Date();

    // Crear SOLO mensaje interno para el operador que realizó la acción
    const intMsg = {
        id: `msg-${timestamp.getTime()}`,
        type: 'internal_message',
        text: `${actionVerb === 'programó nuevo evento' ? '📅 Nuevo corte programado' : '✏️ Evento modificado'}: ${title}. Zona: ${zonaName || 'Sin zona'}. Fecha: ${dateStr || ''}. Horario: ${timeDesc}. ${detail || ''}`,
        time: "Hace un momento",
        timestamp: timestamp.getTime(),
        eventId: eventId || null,  // Guardar el ID del evento para abrir el detalle
        eventAuditId: eventId || null  // Para evitar duplicados en sync
    };

    let lsMsgs = JSON.parse(localStorage.getItem('intMsgs') || '[]');
    lsMsgs.unshift(intMsg);
    localStorage.setItem('intMsgs', JSON.stringify(lsMsgs));
    localStorage.removeItem('messageBadge_seen');

    // NO crear alerta del sistema aquí — syncGlobalSystemAlerts lo hará desde la auditoría
    // Esto evita que se dupliquen las alertas (una local + una de auditoría)
}

// ============================================================
// USERS PANEL — Load from DB
// ============================================================
async function loadUsersPanel() {
    const container = document.getElementById('usersListContainer');
    const titleEl = document.getElementById('usersCardTitle');
    if (!container) return;

    try {
        const response = await apiFetch('/api/users');
        let users = response.data || response;
        const isAdmin = (localStorage.getItem('userRole') || '').toLowerCase() === 'admin' ||
            (localStorage.getItem('userRole') || '').toLowerCase() === 'administrador';

        // Ordenar usuarios alfabéticamente por nombre completo
        users.sort((a, b) => {
            const nameA = (a.full_name || a.username || '').toLowerCase();
            const nameB = (b.full_name || b.username || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        if (titleEl) titleEl.textContent = `Usuarios del Sistema (${users.length})`;

        if (users.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--color-text-muted); font-size:0.9rem;">No hay usuarios registrados aún.</div>';
            return;
        }

        container.innerHTML = '';
        users.forEach(user => {
            const initials = (user.full_name || user.username || 'U').charAt(0).toUpperCase();
            const roleBadge = user.role === 'administrador' ? 'Admin' : user.role === 'auditor' ? 'Auditor' : 'Op';
            const avatarColor = user.avatar_color || '#14b8a6';

            // Determinar estado de presencia con heartbeat + actividad del usuario
            // - Conectado: last_login < 60s Y actividad reciente del usuario (si es el usuario actual)
            // - Ausente: last_login < 5 min PERO sin actividad reciente (> 2 min)
            // - Desconectado: last_login > 5 min
            const lastLoginTime = user.last_login ? new Date(user.last_login).getTime() : 0;
            const timeSinceLogin = Date.now() - lastLoginTime;

            let userStatus = 'offline'; // por defecto
            let statusColor = '#9ca3af';   // gray
            let statusBgColor = '#f3f4f6'; // gray-100
            let statusLabel = 'Desconectado';
            let nameColor = 'color: var(--color-text-muted)';

            // Verificar si es el usuario actual
            const currentUserId = localStorage.getItem('userId');
            const isCurrentUser = String(user.id) === String(currentUserId);

            if (timeSinceLogin < 60000) {
                // Login muy reciente (< 60s) = conectado
                userStatus = 'online';
                statusColor = '#10b981';   // green-500
                statusBgColor = '#d1fae5'; // green-100
                nameColor = '';
                statusLabel = 'Conectado';
            } else if (timeSinceLogin < 300000) {
                // Login reciente (< 5 min) — verificar actividad para ausente
                // Si es el usuario actual, verificar actividad local
                if (isCurrentUser && window._lastUserActivity) {
                    const timeSinceActivity = Date.now() - window._lastUserActivity;
                    if (timeSinceActivity > 120000) {
                        // Sin actividad por > 2 min = ausente
                        userStatus = 'away';
                        statusColor = '#f59e0b';   // amber-500
                        statusBgColor = '#fef3c7';  // amber-100
                        nameColor = '';
                        statusLabel = 'Ausente';
                    } else {
                        // Actividad reciente = conectado
                        userStatus = 'online';
                        statusColor = '#10b981';
                        statusBgColor = '#d1fae5';
                        nameColor = '';
                        statusLabel = 'Conectado';
                    }
                } else {
                    // Para otros usuarios, si login es < 2 min = conectado, sino ausente
                    if (timeSinceLogin < 120000) {
                        userStatus = 'online';
                        statusColor = '#10b981';
                        statusBgColor = '#d1fae5';
                        nameColor = '';
                        statusLabel = 'Conectado';
                    } else {
                        userStatus = 'away';
                        statusColor = '#f59e0b';
                        statusBgColor = '#fef3c7';
                        nameColor = '';
                        statusLabel = 'Ausente';
                    }
                }
            }

            const createdDate = new Date(user.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });

            const div = document.createElement('div');
            div.className = 'schedule-item';
            div.id = `user-row-${user.id}`;
            div.innerHTML = `
                <span class="time">${createdDate}</span>
                <div class="person">
                    <div class="person-avatar" style="background-color: ${avatarColor};">${initials}</div>
                    <span style="${nameColor}; display: flex; align-items: center; gap: 0.5rem;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor}; display: inline-block;" title="${statusLabel}"></span>
                        ${user.full_name || user.username} (${roleBadge})
                    </span>
                    <span style="font-size:0.72rem; color: var(--color-text-muted); margin-left: 0.3rem;">(${statusLabel})</span>
                </div>
                <span class="more-options" style="cursor:pointer; position:relative;" onclick="toggleUserMenu(event, ${user.id})">⋮</span>
                ${isAdmin ? `
                <div id="userMenu-${user.id}" class="user-context-menu" style="display:none; position:absolute; right:1rem; background:white; border:1px solid var(--color-border); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1); z-index:100; padding:0.5rem 0; min-width:160px;">
                    <div onclick="showSystemUserPassword('${user.password}')" style="padding:0.6rem 1rem; cursor:pointer; font-size:0.85rem; font-weight:500; display:flex; align-items:center; gap:0.5rem; color:var(--color-sidebar);" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        👁 Ver contraseña
                    </div>
                    <div onclick="editSystemUserPassword(${user.id})" style="padding:0.6rem 1rem; cursor:pointer; font-size:0.85rem; font-weight:500; display:flex; align-items:center; gap:0.5rem; color:var(--color-sidebar);" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        🔑 Editar contraseña
                    </div>
                    <div onclick="editSystemUserName(${user.id}, '${(user.full_name || user.username).replace(/'/g, "\\'")}')" style="padding:0.6rem 1rem; cursor:pointer; font-size:0.85rem; font-weight:500; display:flex; align-items:center; gap:0.5rem; color:var(--color-sidebar);" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        ✏️ Cambiar nombre
                    </div>
                    <div style="border-top:1px solid var(--color-border); margin:0.3rem 0;"></div>
                    <div onclick="deleteSystemUser(${user.id}, '${(user.full_name || user.username).replace(/'/g, "\\'")}')" style="padding:0.6rem 1rem; cursor:pointer; color:#ef4444; font-size:0.85rem; font-weight:500; display:flex; align-items:center; gap:0.5rem;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='transparent'">
                        🗑 Eliminar usuario
                    </div>
                </div>` : ''}
            `;
            container.appendChild(div);
        });
    } catch (err) {
        console.error('Error loading users panel:', err);
        container.innerHTML = '<div style="text-align:center; padding:2rem; color:#ef4444;">Error al cargar usuarios</div>';
    }
}

window.toggleUserMenu = function (e, userId) {
    e.stopPropagation();
    // Close all open menus first
    document.querySelectorAll('.user-context-menu').forEach(m => m.style.display = 'none');
    const menu = document.getElementById(`userMenu-${userId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

// Close context menus on outside click
document.addEventListener('click', () => {
    document.querySelectorAll('.user-context-menu').forEach(m => m.style.display = 'none');
});

window.showSystemUserPassword = function (pwd) {
    alert('La contraseña del usuario es:\n' + pwd);
};

window.editSystemUserPassword = async function (id) {
    const nueva = prompt('Ingresa la nueva contraseña para el usuario:');
    if (!nueva) return;
    if (nueva.length < 8) {
        alert('La contraseña debe tener al menos 8 caracteres.');
        return;
    }
    if (confirm('¿Estás seguro de que deseas actualizar la contraseña del usuario?')) {
        try {
            await apiFetch(`/api/users/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ password: nueva })
            });
            alert('Contraseña actualizada correctamente.');
        } catch (err) {
            alert('Error al actualizar la contraseña: ' + err.message);
        }
    }
};

window.editSystemUserName = async function (id, name) {
    const nuevo = prompt('Ingresa el nuevo nombre para el usuario:', name);
    if (!nuevo || nuevo.trim() === '') return;
    if (confirm('¿Estás seguro de que deseas actualizar el nombre del usuario?')) {
        try {
            await apiFetch(`/api/users/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ full_name: nuevo.trim() })
            });
            alert('Nombre actualizado correctamente.');
            loadUsersPanel(); // refresh the list
        } catch (err) {
            alert('Error al actualizar el nombre: ' + err.message);
        }
    }
};

window.deleteSystemUser = async function (userId, userName) {
    if (!confirm(`¿Estás seguro de que deseas ELIMINAR al usuario "${userName}" del sistema?`)) return;

    try {
        await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
        // Remove the row from the panel
        const row = document.getElementById(`user-row-${userId}`);
        if (row) row.remove();

        // Update count
        const titleEl = document.getElementById('usersCardTitle');
        const container = document.getElementById('usersListContainer');
        const remaining = container ? container.querySelectorAll('.schedule-item').length : 0;
        if (titleEl) titleEl.textContent = `Usuarios del Sistema (${remaining})`;

        if (remaining === 0) {
            container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--color-text-muted); font-size:0.9rem;">No hay usuarios registrados aún.</div>';
        }

        alert(`🔴 Usuario "${userName}" eliminado del sistema.`);
    } catch (err) {
        alert('Error al eliminar el usuario.');
    }
};
