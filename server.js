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

// Inicializar base de datos automáticamente (solo en local, no en Vercel)
if (!process.env.VERCEL) {
    const { initDatabase } = require('./db/init-db');
    initDatabase().catch(err => console.error("Error inicializando BD:", err));
}

// Rutas de API
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const tiposEstadosRoutes = require('./routes/tipos-estados');
const solicitudesRoutes = require('./routes/solicitudes');
const controlesLecturasRoutes = require('./routes/controles-lecturas');
const calculosRoutes = require('./routes/calculos');
const historialSeguimientosRoutes = require('./routes/historial-seguimientos');
const eventosZonasRoutes = require('./routes/eventos-zonas');
const usersContactsRoutes = require('./routes/users-contacts');
const dashboardStatsRoutes = require('./routes/dashboard-stats');

// Montando todas las rutas de API
app.use('/api', authRoutes);
app.use('/api', usuariosRoutes);
app.use('/api', tiposEstadosRoutes);
app.use('/api', solicitudesRoutes);
app.use('/api', controlesLecturasRoutes);
app.use('/api', calculosRoutes);
app.use('/api', historialSeguimientosRoutes);
app.use('/api', eventosZonasRoutes);
app.use('/api', usersContactsRoutes);
app.use('/api', dashboardStatsRoutes);

// Ruta de prueba para verificar que la API está funcionando
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'API del Call Center funcionando correctamente',
        endpoints: {
            auth: '/api/login, /api/register, /api/logout, /api/heartbeat',
            users: '/api/users (CRUD)',
            usuarios: '/api/usuarios (socios)',
            tiposSolicitud: '/api/tipos-solicitud',
            estados: '/api/estados',
            solicitudes: '/api/solicitudes',
            controles: '/api/controles',
            lecturas: '/api/lecturas',
            calculos: '/api/calculos',
            historial: '/api/historial',
            seguimientos: '/api/seguimientos',
            contacts: '/api/contacts (directorio)',
            eventos: '/api/events',
            zonas: '/api/zonas',
            auditoria: '/api/audit-history',
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
