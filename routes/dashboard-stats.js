const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// ==================== DASHBOARD STATS ====================

// Obtener estadísticas del dashboard
router.get('/dashboard/stats', async (req, res) => {
    try {
        // Obtener total de contactos (excluye borrados lógicos)
        const contactosResult = await db.query('SELECT COUNT(*) FROM directorio WHERE deleted_at IS NULL');
        const totalContactos = parseInt(contactosResult.rows[0].count);

        // Obtener total de socios (usuarios del servicio de agua)
        const sociosResult = await db.query('SELECT COUNT(*) FROM usuarios');
        const totalSocios = parseInt(sociosResult.rows[0].count);

        // Obtener total de usuarios del sistema (operadores, excluye borrados lógicos)
        const usuariosResult = await db.query('SELECT COUNT(*) FROM operadores WHERE deleted_at IS NULL');
        const totalUsuarios = parseInt(usuariosResult.rows[0].count);

        // Obtener operaciones hoy (del historial)
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const operacionesHoyResult = await db.query(
            'SELECT COUNT(*) FROM historial WHERE fecha >= $1',
            [hoy]
        );
        const operacionesHoy = parseInt(operacionesHoyResult.rows[0].count);

        // Obtener eventos próximos (cortes programados para hoy o futuros)
        const eventosProximosResult = await db.query(
            `SELECT COUNT(*) FROM eventos 
             WHERE fecha >= CURRENT_DATE AND estado = 'programado' AND deleted_at IS NULL`
        );
        const eventosProximos = parseInt(eventosProximosResult.rows[0].count);

        res.json({
            success: true,
            data: {
                totalContactos,
                totalSocios,
                totalUsuarios,
                operacionesHoy,
                eventosProximos
            }
        });
    } catch (err) {
        console.error("Error obteniendo estadísticas del dashboard:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
