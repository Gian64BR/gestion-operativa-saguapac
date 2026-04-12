'use strict';

// Helper: Prevent timezone issues by always using strict UTC string.
// PostgreSQL y el driver de Vercel (ambos en UTC) manejarán este string puro, 
// y luego el navegador del cliente lo trasladará automáticamente a su zona horaria (Bolivia UTC-4).
window.getLocalISOString = function () {
    return new Date().toISOString();
};

/**
 * apiFetch: Helper global para peticiones al backend
 */
window.apiFetch = async function (endpoint, options = {}) {
    try {
        const res = await fetch(endpoint, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Error en la conexión con el servidor');
        }
        return await res.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};

/**
 * utils.js
 * Lógica global para menús, buscador y utilidades de sesión.
 */

// Mensajes y Alertas — Sin datos dummy, solo datos reales
// Limpiar items expirados (más de 24h exactas) — mantiene items sin timestamp
function cleanExpiredItems(storageKey) {
    const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const now = Date.now();
    const twentyFourHours = 86400000; // 24 horas en milisegundos

    let valid;

    if (storageKey === 'sysAlerts') {
        // Para alertas del sistema: eliminar si tienen más de 24h
        // Las alertas leídas ya se eliminan al hacer clic (no se mantienen aquí)
        valid = items.filter(item => {
            // Si no tiene timestamp, mantener (son mensajes manuales)
            if (!item.timestamp) return true;
            // Si tiene timestamp, verificar que no haya pasado 24h
            const elapsed = now - item.timestamp;
            return elapsed < twentyFourHours;
        });
    } else if (storageKey === 'intMsgs') {
        // Para mensajes internos: mantener siempre que tengan menos de 24h
        // Los mensajes internos NO se eliminan al ser leídos, solo por tiempo
        valid = items.filter(item => {
            // Si no tiene timestamp, mantener siempre (son mensajes manuales)
            if (!item.timestamp) return true;
            // Si tiene timestamp, verificar que no haya pasado 24h exactas
            const elapsed = now - item.timestamp;
            return elapsed < twentyFourHours;
        });
    } else if (storageKey === 'dismissedAlertIds') {
        // Para IDs descartados: limpiar los que tienen más de 24h
        // Los IDs descartados se almacenan como {id, timestamp}
        const dismissedItems = JSON.parse(localStorage.getItem('dismissedAlertIds') || '[]');
        valid = dismissedItems.filter(d => {
            if (typeof d === 'string' || typeof d === 'number') {
                // Formato antiguo (solo ID) — mantener por compatibilidad
                return true;
            }
            // Formato nuevo con timestamp
            return (now - d.timestamp) < twentyFourHours;
        }).map(d => typeof d === 'object' ? d.id : d);
    } else {
        // Para otros storages: comportamiento original
        valid = items.filter(item => {
            if (!item.timestamp) return true;
            const elapsed = now - item.timestamp;
            return elapsed < twentyFourHours;
        });
    }

    localStorage.setItem(storageKey, JSON.stringify(valid));
    return valid;
}

// Generar alertas si hubo corte ayer (horarios: 7, 12, 15, 20)
async function generateYesterdayAlerts() {
    try {
        const eventsResponse = await apiFetch('/api/events');
        const events = eventsResponse.data || eventsResponse;
        const now = new Date();
        const currentHour = now.getHours();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Buscar eventos de ayer
        const yesterdayCuts = events.filter(e => {
            const eventDateStr = e.fecha ? e.fecha.split('T')[0] : '';
            return eventDateStr === yesterdayStr;
        });

        if (yesterdayCuts.length === 0) return;

        // Horarios de alerta permitidos
        const alertHours = [7, 12, 15, 20];
        const applicableHours = alertHours.filter(h => h <= currentHour);
        if (applicableHours.length === 0) return;

        // Verificar si ya generamos alertas hoy
        const todayKey = 'alertsGeneratedDate';
        const todayStr = now.toISOString().split('T')[0];
        const lastGeneratedDate = localStorage.getItem(todayKey);
        const lastGeneratedHour = parseInt(localStorage.getItem('alertsGeneratedHour') || '0');

        // Solo generar la alerta más reciente que aún no se ha generado
        const latestHour = Math.max(...applicableHours);
        if (lastGeneratedDate === todayStr && lastGeneratedHour >= latestHour) return;

        localStorage.setItem(todayKey, todayStr);
        localStorage.setItem('alertsGeneratedHour', latestHour.toString());

        const alerts = JSON.parse(localStorage.getItem('sysAlerts') || '[]');

        yesterdayCuts.forEach(e => {
            const zona = e.zona_nombre || 'Sin zona';
            const horaInicio = e.hora_inicio || '';
            const horaFin = e.hora_fin || '';
            const timeStr = (horaInicio && horaFin) ? `${horaInicio} – ${horaFin}` : '';
            const detalle = e.detalle || '';

            const alertId = `alert-${e.id}-${todayStr}-${latestHour}`;
            // Evitar duplicados
            if (alerts.some(a => a.id === alertId)) return;

            alerts.unshift({
                id: alertId,
                text: `Ayer se realizó un corte: ${e.titulo}. Zona: ${zona}. Horario: ${timeStr}. ${detalle}`,
                time: `Alerta ${latestHour}:00`,
                timestamp: Date.now()
            });
        });

        localStorage.setItem('sysAlerts', JSON.stringify(alerts));
        localStorage.removeItem('notifBadge_seen');
    } catch (err) {
        console.error('Error generating alerts:', err);
    }
}

// Inicializar limpio si no existe
if (!localStorage.getItem('sysAlerts')) {
    localStorage.setItem('sysAlerts', '[]');
}
if (!localStorage.getItem('intMsgs')) {
    localStorage.setItem('intMsgs', '[]');
}

function isAdmin() {
    const role = localStorage.getItem('userRole');
    return role === 'admin' || role === 'administrador';
}

function logout() {
    const userId = localStorage.getItem('userId');
    // Detener el heartbeat antes de logout
    if (window._heartbeatInterval) {
        clearInterval(window._heartbeatInterval);
        window._heartbeatInterval = null;
    }
    // Llamar al backend para registrar logout en auditoría
    if (userId) {
        fetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        }).catch(err => console.error('Error al registrar logout:', err));
    }
    // Limpiar TODA la sesión
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('profileDisplayName');
    // Redirigir inmediatamente a login
    window.location.href = '/index.html';
}

/**
 * startHeartbeat: Envía un ping al servidor cada 30 segundos para indicar actividad
 * También detecta inactividad del usuario (mouse/teclado/scroll) para estado ausente
 */
function startHeartbeat() {
    const userId = localStorage.getItem('userId');
    if (!userId) return;

    // Tracker de última actividad del usuario
    window._lastUserActivity = Date.now();

    // Detectar actividad del usuario
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const updateActivity = () => { window._lastUserActivity = Date.now(); };

    activityEvents.forEach(evt => {
        document.addEventListener(evt, updateActivity, true);
    });

    // Enviar heartbeat al servidor cada 30 segundos
    window._heartbeatInterval = setInterval(async () => {
        try {
            await fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
        } catch (err) {
            console.error('Error enviando heartbeat:', err);
        }
    }, 30000); // Cada 30 segundos
}

// Iniciar heartbeat cuando el usuario está logueado
if (localStorage.getItem('userId')) {
    startHeartbeat();
}

function setupHeader() {
    // 1. Setup Profile Name & Role (Sync Transversal)
    const role = localStorage.getItem('userRole') || 'Usuario';
    const userName = localStorage.getItem('userName') || ((role === 'admin' || role === 'administrador') ? 'Administrador' : 'Operador');

    // Fallback: If elements exist
    const currentUserEl = document.getElementById('currentUserObj');
    const headerAvatar = document.getElementById('headerAvatar');

    if (currentUserEl) currentUserEl.textContent = userName;
    if (headerAvatar) {
        // Initials (Up to 2 chars)
        let initials = userName.substring(0, 2).toUpperCase();
        if (userName.includes(' ')) {
            const parts = userName.split(' ');
            initials = parts[0][0] + (parts[1] ? parts[1][0] : '');
        }
        headerAvatar.textContent = initials;
    }

    // 2. Setup Dropdowns Toggle
    setupDropdownToggle('profileBtn', 'profileMenu');
    setupDropdownToggle('messageBtn', 'messageMenu');
    setupDropdownToggle('notificationBtn', 'notificationMenu');

    // 3. Clean expired items (24h) and generate yesterday alerts
    cleanExpiredItems('sysAlerts');
    cleanExpiredItems('intMsgs');
    cleanExpiredItems('dismissedAlertIds');
    generateYesterdayAlerts();

    // 4. Sync Global Alerts from Audit History (to see alerts from other operators)
    syncGlobalSystemAlerts();

    // 5. Populate Messages and Notifications (Multi-Page)
    // These calls are now redundant as syncGlobalSystemAlerts also populates them,
    // but kept for initial load if syncGlobalSystemAlerts fails or returns no new data.
    const _alerts = JSON.parse(localStorage.getItem('sysAlerts') || '[]');
    const _msgs = JSON.parse(localStorage.getItem('intMsgs') || '[]');
    populateDropdown('messagesList', _msgs, 'messageBadge');
    populateDropdown('notificationsList', _alerts, 'notifBadge');

    // 6. Setup Global Search
    setupGlobalSearch();
}

function setupDropdownToggle(btnId, menuId) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    if (!btn || !menu) return;

    if (btn.dataset.hasDropdownListener) return;
    btn.dataset.hasDropdownListener = 'true';

    btn.addEventListener('click', (e) => {
        // Prevent click from bubbling to document creating immediate close
        e.stopPropagation();

        // Close others
        document.querySelectorAll('.dropdown-menu').forEach(m => {
            if (m.id !== menuId) m.style.display = 'none';
        });

        const isVisible = menu.style.display === 'block';

        // On mobile, ensure dropdown stays within viewport
        if (window.innerWidth <= 768 && !isVisible) {
            const btnRect = btn.getBoundingClientRect();
            const menuWidth = Math.min(280, window.innerWidth - 20);

            // Position from right edge of screen with small margin
            menu.style.right = '10px';
            menu.style.left = 'auto';
            menu.style.maxWidth = menuWidth + 'px';
        }

        menu.style.display = isVisible ? 'none' : 'block';

        // Clear badge if opened (simulate reading)
        const badgeId = btnId.replace('Btn', 'Badge');
        const badge = document.getElementById(badgeId);
        if (badge && !isVisible) {
            badge.classList.remove('active');
            localStorage.setItem(badgeId + '_seen', 'true');
        }
    });

    // Don't close when clicking inside menu
    menu.addEventListener('click', e => e.stopPropagation());
}

function populateDropdown(containerId, data, badgeId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Keep all items — 24h cleanup is done by cleanExpiredItems on page load
    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = '<div class="dropdown-item" style="color:var(--color-text-muted); text-align:center;">No hay notificaciones recientes</div>';
    } else {
        data.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.style.cursor = 'pointer';

            // For ALERTS (notificationsList): clicking shows detail and removes the alert
            if (containerId === 'notificationsList') {
                div.onclick = async () => {
                    // Step 1: Remove from DOM immediately for instant visual feedback
                    const menuItem = div.closest('.dropdown-menu');
                    div.style.transition = 'opacity 0.2s, max-height 0.3s';
                    div.style.opacity = '0';
                    div.style.maxHeight = div.offsetHeight + 'px';
                    setTimeout(() => {
                        div.style.maxHeight = '0';
                        div.style.overflow = 'hidden';
                        div.style.padding = '0';
                        div.style.margin = '0';
                    }, 200);
                    setTimeout(() => {
                        if (div.parentNode) div.remove();
                        // Check if dropdown is now empty
                        const listContainer = document.getElementById(containerId);
                        if (listContainer && listContainer.children.length === 0) {
                            listContainer.innerHTML = '<div class="dropdown-item" style="color:var(--color-text-muted); text-align:center;">No hay notificaciones recientes</div>';
                        }
                    }, 500);

                    // Step 2: Remove from localStorage
                    let alerts = JSON.parse(localStorage.getItem('sysAlerts') || '[]');
                    const alertIndex = alerts.findIndex(a => a.id === item.id);
                    if (alertIndex !== -1) {
                        alerts.splice(alertIndex, 1);
                        localStorage.setItem('sysAlerts', JSON.stringify(alerts));
                    }

                    // Step 2b: Track dismissed alert IDs so syncGlobalSystemAlerts doesn't re-add them
                    let dismissedIds = JSON.parse(localStorage.getItem('dismissedAlertIds') || '[]');
                    // Store as object with timestamp for expiration
                    const dismissedEntry = { id: item.id, timestamp: Date.now() };
                    // Remove old entry if exists, then add new one
                    dismissedIds = dismissedIds.filter(d => {
                        const entryId = typeof d === 'object' ? d.id : d;
                        return entryId !== item.id;
                    });
                    dismissedIds.push(dismissedEntry);
                    localStorage.setItem('dismissedAlertIds', JSON.stringify(dismissedIds));

                    // Mark badge as seen
                    localStorage.setItem(badgeId + '_seen', 'true');
                    const badge = document.getElementById(badgeId);
                    if (badge) badge.classList.remove('active');

                    // Step 3: Try to open event detail
                    if (item.eventId) {
                        console.log('📅 Abriendo detalle de alerta con eventId:', item.eventId);
                        if (typeof window.showCorteDetailGlobal === 'function') {
                            await window.showCorteDetailGlobal(item.eventId, item.text);
                        } else if (typeof window.showCorteDetail === 'function') {
                            window.showCorteDetail(item.eventId);
                        }
                    } else if (typeof showNotificationDetail === 'function') {
                        // Fallback to generic notification detail
                        showNotificationDetail(item.text, item.time);
                    }
                };
                div.title = 'Clic para ver y eliminar esta alerta';
            } else {
                // For MESSAGES (messagesList): open corte detail modal
                div.onclick = async () => {
                    // Close the dropdown first
                    const menu = div.closest('.dropdown-menu');
                    if (menu) menu.style.display = 'none';

                    // Mark badge as seen (but don't delete the message - it persists for 24h)
                    localStorage.setItem(badgeId + '_seen', 'true');

                    // Try to open corte detail using global function
                    // Always pass the message text as fallback for title extraction
                    if (item.eventId) {
                        console.log('📅 Abriendo detalle del corte con eventId:', item.eventId);
                        if (typeof window.showCorteDetailGlobal === 'function') {
                            await window.showCorteDetailGlobal(item.eventId, item.text);
                        } else if (typeof window.showCorteDetail === 'function') {
                            window.showCorteDetail(item.eventId);
                        }
                    } else {
                        // Fallback: intentar encontrar por texto del mensaje
                        console.log('🔍 Buscando evento por texto del mensaje...');
                        if (typeof window.findAndOpenCorteDetail === 'function') {
                            await window.findAndOpenCorteDetail(item.text);
                        } else if (typeof window.showNotificationDetail === 'function') {
                            window.showNotificationDetail(item.text, item.time);
                        }
                    }
                };
            }

            // Limitar texto largo a ~2 líneas en vista resumida
            let displayText = item.text;
            const MAX_SUMMARY = 150;
            if (displayText.length > MAX_SUMMARY) {
                displayText = displayText.substring(0, MAX_SUMMARY).trim() + '…';
            }
            // Reemplazar saltos de línea por espacios en resumen
            displayText = displayText.replace(/\n/g, ' ');

            div.innerHTML = `
                ${displayText}
                <span class="dropdown-item-time">${item.time}</span>
            `;
            container.appendChild(div);
        });
    }

    // Determine if badge should be active
    // Badge is active if there are items AND user hasn't seen them yet
    const hasSeen = localStorage.getItem(badgeId + '_seen') === 'true';
    const badge = document.getElementById(badgeId);

    if (data.length > 0 && !hasSeen) {
        if (badge) badge.classList.add('active');
    } else {
        if (badge) badge.classList.remove('active');
    }
}

/**
 * showCorteDetailGlobal: Función global para mostrar detalle de cortes programados
 * Funciona en TODAS las páginas (dashboard, historial, contactos, tareas)
 * Busca el evento desde la API si no está en caché local
 * @param {number|string} eventId - ID del evento o texto del mensaje para búsqueda fallback
 * @param {string} messageText - Texto del mensaje para extracción de título (fallback)
 */
window.showCorteDetailGlobal = async function (eventId, messageText) {
    console.log('📅 showCorteDetailGlobal llamado con eventId:', eventId, 'messageText:', messageText);

    // Si no hay eventId válido, intentar extraer título del mensaje
    if (!eventId && messageText) {
        console.log('⚠️ Sin eventId, intentando extraer título del mensaje...');
        await window.findAndOpenCorteDetail(messageText);
        return;
    }

    if (!eventId) {
        console.error('❌ No se proporcionó eventId ni texto para buscar');
        alert('No se pudo cargar el detalle del corte programado.');
        return;
    }

    // Intentar encontrar en caché local si existe (dashboard)
    const cachedCut = window.allCuts?.scheduled?.find(c => String(c.id) === String(eventId)) ||
        window.allCuts?.completed?.find(c => String(c.id) === String(eventId));

    if (cachedCut) {
        console.log('✅ Evento encontrado en caché local:', cachedCut);
        // Usar showCorteDetail del dashboard si está disponible
        if (typeof window.showCorteDetail === 'function') {
            window.showCorteDetail(eventId);
            return;
        }
    }

    // Si no está en caché o no estamos en dashboard, cargar desde API
    try {
        console.log('📡 Cargando evento desde API...');
        const response = await apiFetch(`/api/events/${eventId}`);
        const event = response.data || response;

        if (!event || !event.id) {
            console.error('❌ Evento no encontrado en API:', eventId);
            // Fallback: intentar buscar por texto si está disponible
            if (messageText) {
                console.log('🔄 Intentando fallback por texto del mensaje...');
                await window.findAndOpenCorteDetail(messageText);
                return;
            }
            alert('No se encontró el detalle del corte programado.');
            return;
        }

        console.log('✅ Evento encontrado en API:', event);

        // Mostrar el detalle usando el modal de historial o crear uno nuevo
        showCorteDetailFromEventData(event);

    } catch (err) {
        console.error('❌ Error al cargar detalle del evento:', err);
        // Fallback: intentar buscar por texto si está disponible
        if (messageText) {
            console.log('🔄 Error en API, intentando fallback por texto del mensaje...');
            await window.findAndOpenCorteDetail(messageText);
            return;
        }
        alert('No se pudo cargar el detalle del corte programado. Error: ' + err.message);
    }
};

/**
 * showCorteDetailFromEventData: Muestra el modal con los datos del evento
 * Funciona con el modal #corteDetailModal (historial) o crea uno temporal
 */
function showCorteDetailFromEventData(event) {
    // Extraer campos con fallbacks
    const titulo = event.titulo || event.title || 'Sin título';
    const detalle = event.detalle || event.detail || '';
    const zona = event.zona_nombre || event.zona || 'Sin zona';
    const uv = event.uv_afectada || event.uv || '';

    // Formatear fecha
    let fechaDisplay = '—';
    if (event.fecha) {
        try {
            const fechaRaw = event.fecha.toString().substring(0, 10);
            fechaDisplay = new Date(fechaRaw + 'T12:00:00').toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
        } catch (e) { }
    }

    // Determinar horario
    let horario = '—';
    if (event.hora_inicio && event.hora_fin) {
        horario = `${event.hora_inicio} – ${event.hora_fin}`;
    }

    // Intentar usar el modal de historial si existe
    const body = document.getElementById('corteDetailBody');
    if (body) {
        body.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:1rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;background:#f8fafc;padding:1.2rem;border-radius:10px;font-size:0.9rem;">
                    <div style="grid-column:1/-1;">
                        <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Título</span>
                        <div style="margin-top:0.3rem;font-size:1.05rem;font-weight:600;color:#1e293b;">${titulo}</div>
                    </div>
                    <div>
                        <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Zona</span>
                        <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${zona}</div>
                    </div>
                    <div>
                        <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">UV Afectada</span>
                        <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${uv || '—'}</div>
                    </div>
                    <div>
                        <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Día del Corte</span>
                        <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${fechaDisplay}</div>
                    </div>
                    <div>
                        <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Horario del Corte</span>
                        <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${horario}</div>
                    </div>
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
        return;
    }

    // Si no existe el modal de historial, crear uno temporal
    let modal = document.getElementById('globalCorteDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'globalCorteDetailModal';
        modal.className = 'modal-overlay';
        modal.onclick = function (e) {
            if (e.target === modal) {
                closeModal('globalCorteDetailModal');
            }
        };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3 class="modal-title">Detalle del Corte Programado</h3>
                <button class="modal-close" onclick="closeModal('globalCorteDetailModal')">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display:flex;flex-direction:column;gap:1rem;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;background:#f8fafc;padding:1.2rem;border-radius:10px;font-size:0.9rem;">
                        <div style="grid-column:1/-1;">
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Título</span>
                            <div style="margin-top:0.3rem;font-size:1.05rem;font-weight:600;color:#1e293b;">${titulo}</div>
                        </div>
                        <div>
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Zona</span>
                            <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${zona}</div>
                        </div>
                        <div>
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">UV Afectada</span>
                            <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${uv || '—'}</div>
                        </div>
                        <div>
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Día del Corte</span>
                            <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${fechaDisplay}</div>
                        </div>
                        <div>
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Horario del Corte</span>
                            <div style="margin-top:0.3rem;font-size:0.95rem;font-weight:500;color:#334155;">${horario}</div>
                        </div>
                        ${detalle ? `
                        <div style="grid-column:1/-1;border-top:1px solid #e2e8f0;padding-top:0.8rem;margin-top:0.3rem;">
                            <span style="color:#64748b;font-size:0.78rem;text-transform:uppercase;font-weight:600;">Detalle / Motivo</span>
                            <div class="detalle-scroll-container" style="margin-top:0.5rem;font-size:0.92rem;color:#475569;line-height:1.6;">${detalle}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;

    if (typeof openModal === 'function') {
        openModal('globalCorteDetailModal');
    } else {
        modal.style.display = 'flex';
        modal.classList.add('show');
    }
}

/**
 * syncGlobalSystemAlerts: Sincroniza las alertas locales con el historial de auditoría global
 * Esto permite que si el Operador A crea un evento, el Operador B reciba la notificación.
 * Solo usuarios que ya existían al momento de crear el evento reciben la notificación.
 * 
 * CORRECCIÓN: 
 * - No duplicar mensajes que ya existen localmente
    * - Preservar el estado de "leído" entre pantallas
        * - No eliminar el badge si el usuario ya leyó las notificaciones
            */
async function syncGlobalSystemAlerts() {
    try {
        const auditsResponse = await apiFetch('/api/audit-history');
        const usersResponse = await apiFetch('/api/users');

        const audits = auditsResponse.data || auditsResponse;
        const users = usersResponse.data || usersResponse;

        const now = Date.now();
        const last24h = now - 86400000;

        // Obtener lista de usuarios existentes antes de cada evento
        const userCreatedDates = {};
        users.forEach(u => {
            if (u.created_at) {
                userCreatedDates[u.id] = new Date(u.created_at).getTime();
            }
        });

        // Obtener ID del usuario actual
        const currentUserId = localStorage.getItem('userId');

        // Filtrar solo eventos de auditoría de tipo 'evento' creados en las últimas 24h
        const recentEvents = audits.filter(a => {
            const auditTime = new Date(a.fecha_exac).getTime();
            return a.tipo === 'evento' && auditTime > last24h;
        });

        if (recentEvents.length === 0) return;

        let lsAlerts = JSON.parse(localStorage.getItem('sysAlerts') || '[]');
        let lsMsgs = JSON.parse(localStorage.getItem('intMsgs') || '[]');
        let changed = false;

        // Track IDs que ya existen localmente para evitar duplicados
        const existingAlertIds = new Set(lsAlerts.map(a => a.id));
        const existingMsgEventIds = new Set(lsMsgs.filter(m => m.eventAuditId).map(m => m.eventAuditId));

        // Track IDs que el usuario ya descartó (para no re-agregarlos)
        // Handle both old format (plain IDs) and new format ({id, timestamp})
        const dismissedRaw = JSON.parse(localStorage.getItem('dismissedAlertIds') || '[]');
        const dismissedIds = new Set(dismissedRaw.map(d => typeof d === 'object' ? d.id : d));

        recentEvents.forEach(evt => {
            // Verificar si el usuario actual existía antes de este evento
            const eventTime = new Date(evt.fecha_exac).getTime();
            const userCreatedAt = currentUserId ? userCreatedDates[currentUserId] : null;

            // Solo recibir notificación si el usuario ya existía al crear el evento
            const shouldReceiveNotification = !userCreatedAt || userCreatedAt <= eventTime;

            if (!shouldReceiveNotification) return;

            // Usar evt.id como identificador único del evento en auditoría
            const eventAuditId = evt.id;

            // AGREGAR A ALERTAS DEL SISTEMA (solo si no existe ya Y no fue descartado)
            if (!existingAlertIds.has(eventAuditId) && !dismissedIds.has(eventAuditId)) {
                // Extraer eventId del detalle si está disponible
                const detalleMatch = evt.detalle ? evt.detalle.match(/Evento ID:\s*(\d+)/) : null;
                const eventIdFromDetalle = detalleMatch ? parseInt(detalleMatch[1]) : null;

                // Formatear el texto de la alerta de manera consistente
                // Si el resultado dice "Corte programado: X", convertirlo a "📅 Nuevo corte programado: X"
                let alertText = evt.resultado + '. ' + (evt.detalle || '');
                if (evt.resultado && evt.resultado.startsWith('Corte programado:')) {
                    const titulo = evt.resultado.replace('Corte programado:', '').trim();
                    alertText = `📅 Nuevo corte programado: ${titulo}. ${evt.detalle || ''}`;
                } else if (evt.resultado && evt.resultado.startsWith('Evento modificado:')) {
                    const titulo = evt.resultado.replace('Evento modificado:', '').trim();
                    alertText = `✏️ Evento modificado: ${titulo}. ${evt.detalle || ''}`;
                }

                const newAlert = {
                    id: eventAuditId,
                    type: 'system_alert',
                    text: alertText,
                    time: "Alerta Global",
                    timestamp: eventTime,
                    eventId: eventIdFromDetalle || evt.id_evento || null,
                    eventAuditId: eventAuditId,
                    createdUserId: evt.operador,
                    read: false
                };
                lsAlerts.unshift(newAlert);
                existingAlertIds.add(eventAuditId);
                changed = true;
            }

            // AGREGAR A MENSAJES INTERNOS (solo si no existe ya Y no fue creado por el usuario actual)
            // Los mensajes internos para el operador que creó el evento ya los genera dispararAlertasGlobales()
            // Aquí solo creamos mensajes para otros operadores que NO crearon el evento
            const isCurrentUserEvent = evt.operador && (evt.operador === localStorage.getItem('userName'));

            if (!existingMsgEventIds.has(eventAuditId) && !isCurrentUserEvent) {
                // Extraer eventId del detalle si está disponible (mismo enfoque que para alertas)
                const detalleMatch = evt.detalle ? evt.detalle.match(/Evento ID:\s*(\d+)/) : null;
                const eventIdFromDetalle = detalleMatch ? parseInt(detalleMatch[1]) : null;

                const newMsg = {
                    id: `msg-${eventAuditId}`,
                    type: 'internal_message',
                    text: evt.resultado + '. ' + (evt.detalle || ''),
                    time: "Hace un momento",
                    timestamp: eventTime,
                    eventId: eventIdFromDetalle,
                    eventAuditId: eventAuditId,
                    createdUserId: evt.operador
                };
                lsMsgs.unshift(newMsg);
                existingMsgEventIds.add(eventAuditId);
                changed = true;
            }
        });

        if (changed) {
            // Limitar a los últimos 20 para no saturar el localStorage
            lsAlerts = lsAlerts.slice(0, 20);
            lsMsgs = lsMsgs.slice(0, 20);

            localStorage.setItem('sysAlerts', JSON.stringify(lsAlerts));
            localStorage.setItem('intMsgs', JSON.stringify(lsMsgs));

            // NO eliminar los badges de "seen" aquí - eso solo debe hacerse cuando el usuario lee las notificaciones
            // localStorage.removeItem('notifBadge_seen');  // ELIMINADO
            // localStorage.removeItem('messageBadge_seen'); // ELIMINADO

            // Refrescar UI si estamos en el dashboard
            populateDropdown('notificationsList', lsAlerts, 'notifBadge');
            populateDropdown('messagesList', lsMsgs, 'messageBadge');
        }
    } catch (err) {
        console.error('Error syncing global alerts:', err);
    }
}

function setupGlobalSearch() {
    const searchInput = document.getElementById('globalSearchInput');
    const resultsContainer = document.getElementById('searchResultsDropdown');

    if (!searchInput || !resultsContainer) return;

    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length === 0) {
            resultsContainer.style.display = 'none';
            return;
        }

        try {
            // Fetch directly from API
            const eventsResponse = await apiFetch('/api/events');
            const events = eventsResponse.data || eventsResponse;
            const matches = events.filter(ev => {
                // Flatten all object values into a single searchable string
                const searchString = Object.values(ev)
                    .map(val => val !== null && val !== undefined ? String(val).toLowerCase() : '')
                    .join(' ');

                // Allow search by multiple words (e.g. "UV 17")
                const queryWords = query.split(' ').filter(w => w.trim().length > 0);
                return queryWords.every(word => searchString.includes(word));
            });

            resultsContainer.innerHTML = '';
            if (matches.length > 0) {
                matches.forEach(m => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.style.cursor = 'pointer';
                    const timeStr = (m.hora_inicio && m.hora_fin) ? `${m.hora_inicio} – ${m.hora_fin}` : 'Horario pendiente';
                    div.innerHTML = `
                        <span class="search-result-title">Corte: ${m.titulo || 'Sin título'}</span>
                        <span class="search-result-desc">📍 ${m.zona_nombre || 'Sin zona'}</span>
                    `;
                    div.onclick = () => {
                        resultsContainer.style.display = 'none';
                        searchInput.value = '';
                        if (typeof showCorteDetail === 'function') {
                            showCorteDetail(m.id || '', m.zona_nombre || '', timeStr);
                        }
                    };
                    resultsContainer.appendChild(div);
                });
                resultsContainer.style.display = 'block';
            } else {
                resultsContainer.innerHTML = `<div class="search-result-item"><span class="search-result-desc">No se encontraron cortes</span></div>`;
                resultsContainer.style.display = 'block';
            }
        } catch (error) {
            console.error('Error searching events:', error);
        }
    });

    // Ocultar resultados al hacer clic fuera
    document.addEventListener('click', (ev) => {
        if (searchInput && resultsContainer && !searchInput.contains(ev.target) && !resultsContainer.contains(ev.target)) {
            resultsContainer.style.display = 'none';
        }
    });
}

// Close dropdowns on document click
document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
    const searchDropdown = document.getElementById('searchResultsDropdown');
    if (searchDropdown) searchDropdown.style.display = 'none';
});

// --- Modal Global Functions ---
window.openModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
    }
};

window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
};

// Close modal when clicking on the backdrop overlay
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('show');
    }
});

function injectGlobalModals() {
    if (document.getElementById('profileModal')) return; // Already injected or hardcoded

    const modalsHTML = `
        <!-- Modal Editar Perfil -->
        <div class="modal-overlay" id="profileModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Editar Perfil</h3>
                    <button class="modal-close" onclick="closeModal('profileModal')">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Información del usuario -->
                    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:1rem;margin-bottom:1.5rem;">
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
                            <div class="profile-avatar" id="modalAvatar" style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;background:var(--color-accent-teal);color:white;">A</div>
                            <div>
                                <div style="font-weight:600;color:var(--color-text-dark);" id="modalUserName">Administrador</div>
                                <div style="font-size:0.8rem;color:var(--color-text-muted);" id="modalUserRole">Administrador</div>
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.75rem;color:var(--color-text-muted);">
                            <div>📅 Cuenta creada: <span id="modalAccountCreated">--</span></div>
                            <div>🕐 Último acceso: <span id="modalLastLogin">--</span></div>
                            <div>✅ Estado: <span style="color:#10b981;font-weight:500;">Activo</span></div>
                            <div>🔑 Código: <span id="modalUserCode">--</span></div>
                        </div>
                    </div>

                    <!-- Editar nombre -->
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label class="form-label" style="display:block; margin-bottom:0.5rem; font-weight:600; font-size:0.85rem; color:var(--color-text-dark);">Nombre de usuario</label>
                        <input type="text" id="editProfileName" class="form-input" style="width:100%; padding:0.8rem; border:1px solid var(--color-border); border-radius:8px; background-color:white;">
                    </div>

                    <!-- Color de avatar -->
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label class="form-label" style="display:block; margin-bottom:0.5rem; font-weight:600; font-size:0.85rem; color:var(--color-text-dark);">Color de Perfil (Avatar)</label>
                        <select id="editProfileColor" class="form-input" style="width:100%; padding:0.8rem; border:1px solid var(--color-border); border-radius:8px; background-color:white;">
                            <option value="var(--color-accent-teal)">Aqua (Predeterminado)</option>
                            <option value="#6366f1">Índigo</option>
                            <option value="#ec4899">Rosa</option>
                            <option value="#f59e0b">Ámbar</option>
                            <option value="#10b981">Esmeralda</option>
                        </select>
                    </div>

                    <!-- Cambiar contraseña -->
                    <div style="border-top:1px solid var(--color-border);padding-top:1rem;margin-top:1rem;">
                        <h4 style="margin-bottom:0.75rem;font-size:0.9rem;color:var(--color-text-dark);">🔐 Cambiar contraseña</h4>
                        <div class="form-group" style="margin-bottom: 0.75rem;">
                            <label class="form-label" style="display:block; margin-bottom:0.4rem; font-weight:500; font-size:0.8rem; color:var(--color-text-dark);">Contraseña actual</label>
                            <input type="password" id="editCurrentPassword" class="form-input" placeholder="Ingrese su contraseña actual" style="width:100%; padding:0.7rem; border:1px solid var(--color-border); border-radius:8px; background-color:white;">
                        </div>
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label class="form-label" style="display:block; margin-bottom:0.4rem; font-weight:500; font-size:0.8rem; color:var(--color-text-dark);">Nueva contraseña</label>
                            <input type="password" id="editNewPassword" class="form-input" placeholder="saguapac + mínimo 4 números" style="width:100%; padding:0.7rem; border:1px solid var(--color-border); border-radius:8px; background-color:white;">
                        </div>
                    </div>

                    <button onclick="saveProfileChanges()" style="width:100%; background:var(--color-accent-teal); color:white; padding:0.8rem; border-radius:8px; border:none; font-weight:600; cursor:pointer; margin-top:0.5rem;" onmouseover="this.style.opacity=0.9" onmouseout="this.style.opacity=1">Guardar cambios</button>
                    <p id="profileSaveFeedback" style="display:none; color:#10b981; font-size:0.85rem; margin-top:0.8rem; text-align:center;">¡Cambios guardados con éxito!</p>
                    <p id="profileErrorFeedback" style="display:none; color:#ef4444; font-size:0.85rem; margin-top:0.5rem; text-align:center;"></p>
                </div>
            </div>
        </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = modalsHTML;
    document.body.appendChild(container);
}

window.loadProfileData = function () {
    const role = localStorage.getItem('userRole') || 'user';
    const name = localStorage.getItem('userName') || ((role === 'admin' || role === 'administrador') ? 'Administrador' : 'Usuario Operador');
    const color = localStorage.getItem('userColor') || 'var(--color-accent-teal)';

    const nameInput = document.getElementById('editProfileName');
    const colorInput = document.getElementById('editProfileColor');

    if (nameInput) nameInput.value = name;
    if (colorInput) colorInput.value = color;

    // Update Header Display
    const currentUserEl = document.getElementById('currentUserObj');
    const headerAvatar = document.getElementById('headerAvatar');
    if (currentUserEl) currentUserEl.textContent = name;
    if (headerAvatar) {
        headerAvatar.textContent = name.charAt(0).toUpperCase();
        headerAvatar.style.backgroundColor = color;
    }

    // Update Modal Info
    const modalUserName = document.getElementById('modalUserName');
    const modalUserRole = document.getElementById('modalUserRole');
    const modalAvatar = document.getElementById('modalAvatar');
    const modalAccountCreated = document.getElementById('modalAccountCreated');
    const modalLastLogin = document.getElementById('modalLastLogin');
    const modalUserCode = document.getElementById('modalUserCode');

    if (modalUserName) modalUserName.textContent = name;
    if (modalUserRole) {
        const roleText = role === 'admin' || role === 'administrador' ? 'Administrador' : 'Operador';
        modalUserRole.textContent = roleText;
    }
    if (modalAvatar) {
        const initials = name.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
        modalAvatar.textContent = initials;
        modalAvatar.style.backgroundColor = color;
    }
    // Mock data for account info (in production, this would come from API)
    if (modalAccountCreated) modalAccountCreated.textContent = '2026';
    if (modalLastLogin) modalLastLogin.textContent = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (modalUserCode) modalUserCode.textContent = 'USR-' + Math.floor(Math.random() * 10000);
};

window.saveProfileChanges = async function () {
    const name = document.getElementById('editProfileName').value;
    const color = document.getElementById('editProfileColor').value;
    const currentPassword = document.getElementById('editCurrentPassword')?.value || '';
    const newPassword = document.getElementById('editNewPassword')?.value || '';

    const feedbackSuccess = document.getElementById('profileSaveFeedback');
    const feedbackError = document.getElementById('profileErrorFeedback');

    // Reset feedback
    if (feedbackSuccess) feedbackSuccess.style.display = 'none';
    if (feedbackError) feedbackError.style.display = 'none';

    // Si hay cambio de contraseña, validar
    if (newPassword) {
        // Validar formato de nueva contraseña - debe coincidir con el backend
        const pwdRegex = /^saguapac\d{4,}$/;
        if (!pwdRegex.test(newPassword)) {
            if (feedbackError) {
                feedbackError.textContent = 'Contraseña incorrecta. Por favor comunícate con Gianmarco Bulacia.';
                feedbackError.style.display = 'block';
            }
            return;
        }

        // Validar contraseña actual
        if (!currentPassword) {
            if (feedbackError) {
                feedbackError.textContent = 'Debe ingresar su contraseña actual para cambiarla.';
                feedbackError.style.display = 'block';
            }
            return;
        }

        // Verificar contraseña actual con el backend
        try {
            const userId = localStorage.getItem('userId') || '1'; // Asumimos ID 1 si no existe
            const response = await fetch('/api/validate-current-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, currentPassword })
            });
            const data = await response.json();

            if (!data.valid) {
                if (feedbackError) {
                    feedbackError.textContent = 'La contraseña actual es incorrecta.';
                    feedbackError.style.display = 'block';
                }
                return;
            }

            // Actualizar contraseña en el backend
            const updateResponse = await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPassword })
            });

            if (!updateResponse.ok) {
                throw new Error('Error al actualizar contraseña');
            }

            // Limpiar campos de contraseña
            if (document.getElementById('editCurrentPassword')) document.getElementById('editCurrentPassword').value = '';
            if (document.getElementById('editNewPassword')) document.getElementById('editNewPassword').value = '';
        } catch (err) {
            console.error('Error al cambiar contraseña:', err);
            if (feedbackError) {
                feedbackError.textContent = 'Error al cambiar contraseña. Intente nuevamente.';
                feedbackError.style.display = 'block';
            }
            return;
        }
    }

    // Guardar cambios de perfil
    localStorage.setItem('userName', name);
    localStorage.setItem('userColor', color);

    // Visual feedback
    if (feedbackSuccess) feedbackSuccess.style.display = 'block';

    // Update header dynamically
    loadProfileData();

    setTimeout(() => {
        if (feedbackSuccess) feedbackSuccess.style.display = 'none';
        closeModal('profileModal');
    }, 1500);
};

// Original setupHeader modified to include modals
const originalSetupHeader = setupHeader;
window.setupHeader = function () {
    injectGlobalModals();
    originalSetupHeader();
    loadProfileData();
};

window.showNotificationDetail = function (text, time) {
    let modal = document.getElementById('globalNotificationModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'globalNotificationModal';
        modal.className = 'modal-overlay';

        // Ensure overlay can be clicked to close
        modal.onclick = function (e) {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        };

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; border-radius: 16px; padding: 0; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
                <div class="modal-header" style="background: var(--color-bg-main); border-bottom: none; padding: 1.5rem 1.5rem 0.5rem 1.5rem;">
                    <h3 style="font-size: 1.1rem; color: var(--color-sidebar); display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-teal)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        Aviso del Sistema
                    </h3>
                    <span class="close-btn" style="position: absolute; top: 1rem; right: 1rem; background: var(--color-bg-main); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; opacity: 0.6; cursor: pointer;" onclick="document.getElementById('globalNotificationModal').classList.remove('show')">&times;</span>
                </div>
                <div class="modal-body" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; text-align: left; background: white;">
                    <p id="globalNotifText" style="font-size: 0.95rem; color: var(--color-text-dark); line-height: 1.5; margin:0;"></p>
                    <div style="border-top: 1px dashed var(--color-border); padding-top: 1rem; margin-top: 0.5rem;">
                        <span id="globalNotifTime" style="font-size: 0.8rem; color: var(--color-text-muted); display:inline-flex; align-items:center; gap:0.4rem;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <!-- Time will be injected here -->
                        </span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('globalNotifText').innerHTML = text;
    document.getElementById('globalNotifTime').innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        Recibido: ${time}`;

    // Use class list 'show' for consistent backdrop animation
    modal.classList.add('show');
};
