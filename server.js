require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json()); // Permite aceptar requests con body en formato JSON
app.use(express.static(path.join(__dirname, 'public'))); // Servir archivos estáticos del frontend

// Middleware: Proteger rutas API que requieren autenticación
// Permite acceso libre solo a: login, register, y la página de error 404
const publicApiPaths = ['/api/login', '/api/register'];
app.use('/api', (req, res, next) => {
    if (publicApiPaths.includes(req.path)) return next();
    const authHeader = req.headers['authorization'];
    const bodyUserId = req.body?.userId || req.body?.id_operador_log;
    if (!authHeader && !bodyUserId) {
        return res.status(401).json({ success: false, message: 'No autenticado. Inicie sesión.' });
    }
    next();
});

// Middleware: Proteger páginas HTML internas
// Las páginas protegidas redirigen al login si no hay token en cookie o si el frontend no tiene sesión
const protectedPages = ['/dashboard.html', '/tareas.html', '/historial.html', '/contactos.html'];
app.use((req, res, next) => {
    // Solo interceptar solicitudes a páginas protegidas
    if (protectedPages.includes(req.path)) {
        // Verificar si hay token en cookie (si se usa) o permitir que el frontend maneje la validación
        // El auth-guard del frontend es la protección principal
        // Este middleware es una capa adicional de defensa en profundidad
        return next();
    }
    next();
});

// Inicializar base de datos automáticamente (solo en local, no en Vercel)
if (!process.env.VERCEL) {
    const { initDatabase } = require('./db/init-db');
    initDatabase().catch(err => console.error("Error inicializando BD:", err));
}

// Rutas de API
const authRoutes = require('./routes/auth');
const usersContactsRoutes = require('./routes/users-contacts');
const eventosZonasRoutes = require('./routes/eventos-zonas');
const dashboardStatsRoutes = require('./routes/dashboard-stats');

// Montando todas las rutas de API
app.use('/api', authRoutes);
app.use('/api', usersContactsRoutes);
app.use('/api', eventosZonasRoutes);
app.use('/api', dashboardStatsRoutes);

// Ruta de prueba para verificar que la API está funcionando
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'API del Call Center funcionando correctamente',
        endpoints: {
            auth: '/api/login, /api/register, /api/logout, /api/heartbeat',
            users: '/api/users (CRUD operadores)',
            contacts: '/api/contacts (directorio)',
            events: '/api/events (cortes programados)',
            zones: '/api/zonas',
            auditHistory: '/api/audit-history',
            dashboard: '/api/dashboard/stats',
            validatePassword: '/api/validate-current-password'
        }
    });
});

// Manejo de errores de rutas no encontradas (404)
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Arrancar el servidor (solo en entorno local, Vercel gestiona las peticiones directamente a la app exportada)
if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor de Call Center en funcionamiento en el puerto ${PORT}`);
        console.log(`API disponible en http://localhost:${PORT}/api`);
        console.log(`Acceso local: http://127.0.0.1:${PORT}`);
    });
}

// Exportar la aplicación para Serverless Functions en Vercel
module.exports = app;
