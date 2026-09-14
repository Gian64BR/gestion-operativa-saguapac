/**
 * auth-guard.js
 * Protección de rutas internas — Redirige a login si no hay sesión activa.
 *
 * Uso: Incluir como PRIMER script en cada página protegida, antes de cualquier otro script.
 * <script src="js/auth-guard.js"></script>
 */

(function () {
    'use strict';

    // Rutas permitidas sin autenticación
    const publicPaths = ['/index.html', '/register.html', '/'];

    const currentPath = window.location.pathname;
    const pathName = currentPath.substring(currentPath.lastIndexOf('/'));

    // Si la ruta es pública, no hacer nada
    if (publicPaths.includes(pathName)) return;

    // Verificar si hay sesión activa
    const userId = localStorage.getItem('userId');
    const userRole = localStorage.getItem('userRole');

    // Si no hay sesión, limpiar todo y redirigir
    if (!userId || !userRole) {
        localStorage.clear();
        sessionStorage.setItem('redirectAfterLogin', currentPath);
        window.stop(); // Detener carga de la página actual
        window.location.replace('/index.html');
        return;
    }

    // Validar que la sesión no esté corrupta (valores vacíos)
    if (userId === '' || userId === 'null' || userId === 'undefined') {
        localStorage.clear();
        window.stop();
        window.location.replace('/index.html');
        return;
    }

    // Registrar el ingreso al módulo en la bitácora (acción VIEW)
    (function registrarIngreso() {
        const MODULOS = {
            '/dashboard.html': 'Panel Principal',
            '/contactos.html': 'Directorio de Contactos',
            '/solicitudes.html': 'Gestión de Solicitudes',
            '/tareas.html': 'Gestión de Tareas Operativas',
            '/historial.html': 'Historial y Auditoría Global',
            '/bitacora.html': 'Bitácora del Sistema'
        };
        const modulo = MODULOS[pathName] || pathName;

        try {
            fetch('/api/audit-view', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_operador: parseInt(userId) || null,
                    modulo,
                    ruta: currentPath
                })
            }).catch(function () { });
        } catch (e) { /* nunca bloquear la navegación por la bitácora */ }
    })();

    // Proteger contra recuperación desde caché del navegador (bfcache) al usar el botón "Atrás"
    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            const u = localStorage.getItem('userId');
            const r = localStorage.getItem('userRole');
            if (!u || !r || u === '' || u === 'null' || u === 'undefined') {
                localStorage.clear();
                window.location.replace('/index.html');
            }
        }
    });

})();
