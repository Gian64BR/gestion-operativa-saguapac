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

    // Si no hay sesión, redirir a login
    if (!userId || !userRole) {
        // Guardar la URL a la que el usuario intentaba acceder para redirigir después del login
        sessionStorage.setItem('redirectAfterLogin', currentPath);
        window.location.href = '/index.html';
        return;
    }

    // Validar que la sesión no esté corrupta (valores vacíos)
    if (userId === '' || userId === 'null' || userId === 'undefined') {
        localStorage.removeItem('userId');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userName');
        window.location.href = '/index.html';
        return;
    }

    console.log('✅ Auth guard: Sesión válida para usuario', userId);

})();
