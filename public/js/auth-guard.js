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

})();
