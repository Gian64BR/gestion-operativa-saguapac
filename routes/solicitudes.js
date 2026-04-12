const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { logCreate, logUpdate, logDelete } = require('../db/log-sistema');

// Obtener todas las solicitudes con información relacionada
router.get('/solicitudes', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                s.*,
                u.codigo_asociado,
                o.nombre_completo AS operador_nombre,
                ts.nombre AS tipo_solicitud,
                e.nombre AS estado
            FROM solicitudes s
            JOIN usuarios u ON s.id_usuario = u.id_usuario
            JOIN operadores o ON s.id_operador = o.id_operador
            JOIN tipos_solicitud ts ON s.id_tipo_solicitud = ts.id
            JOIN estados e ON s.id_estado = e.id
            ORDER BY s.fecha_registro DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo solicitudes:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener una solicitud por ID
router.get('/solicitudes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT
                s.*,
                u.codigo_asociado,
                o.nombre_completo AS operador_nombre,
                ts.nombre AS tipo_solicitud,
                e.nombre AS estado
            FROM solicitudes s
            JOIN usuarios u ON s.id_usuario = u.id_usuario
            JOIN operadores o ON s.id_operador = o.id_operador
            JOIN tipos_solicitud ts ON s.id_tipo_solicitud = ts.id
            JOIN estados e ON s.id_estado = e.id
            WHERE s.id_solicitud = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Error obteniendo solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nueva solicitud
router.post('/solicitudes', async (req, res) => {
    try {
        const { id_usuario, id_operador, id_tipo_solicitud, id_estado, descripcion } = req.body;

        if (!id_usuario || !id_operador || !id_tipo_solicitud || !id_estado) {
            return res.status(400).json({
                success: false,
                message: 'Los campos id_usuario, id_operador, id_tipo_solicitud e id_estado son obligatorios'
            });
        }

        const result = await db.query(
            `INSERT INTO solicitudes (id_usuario, id_operador, id_tipo_solicitud, id_estado, descripcion)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id_usuario, id_operador, id_tipo_solicitud, id_estado, descripcion || null]
        );

        // Obtener nombres para la descripción
        const tipoResult = await db.query('SELECT nombre FROM tipos_solicitud WHERE id = $1', [id_tipo_solicitud]);
        const tipoNombre = tipoResult.rows[0]?.nombre || 'Desconocido';

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'solicitudes',
            operadorId: id_operador,
            registroId: result.rows[0].id_solicitud,
            descripcion: `Solicitud creada: ${tipoNombre} para usuario id=${id_usuario}`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Solicitud creada exitosamente' });
    } catch (err) {
        console.error("Error creando solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar solicitud
router.put('/solicitudes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_usuario, id_operador, id_tipo_solicitud, id_estado, descripcion } = req.body;

        // Obtener datos anteriores
        const oldResult = await db.query('SELECT * FROM solicitudes WHERE id_solicitud = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query(
            `UPDATE solicitudes
             SET id_usuario = $1, id_operador = $2, id_tipo_solicitud = $3, id_estado = $4, descripcion = $5
             WHERE id_solicitud = $6 RETURNING *`,
            [id_usuario, id_operador, id_tipo_solicitud, id_estado, descripcion, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
        }

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'solicitudes',
            operadorId: id_operador || null,
            registroId: parseInt(id),
            descripcion: `Solicitud actualizada: id_solicitud=${id}`,
            datosNuevos: result.rows[0],
            datosAnteriores,
            req
        });

        res.json({ success: true, data: result.rows[0], message: 'Solicitud actualizada exitosamente' });
    } catch (err) {
        console.error("Error actualizando solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar solicitud
router.delete('/solicitudes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM solicitudes WHERE id_solicitud = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM solicitudes WHERE id_solicitud = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'solicitudes',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Solicitud eliminada: id_solicitud=${id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Solicitud eliminada exitosamente' });
    } catch (err) {
        console.error("Error eliminando solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener solicitudes por usuario
router.get('/solicitudes/usuario/:id_usuario', async (req, res) => {
    try {
        const { id_usuario } = req.params;
        const result = await db.query(`
            SELECT
                s.*,
                u.codigo_asociado,
                o.nombre_completo AS operador_nombre,
                ts.nombre AS tipo_solicitud,
                e.nombre AS estado
            FROM solicitudes s
            JOIN usuarios u ON s.id_usuario = u.id_usuario
            JOIN operadores o ON s.id_operador = o.id_operador
            JOIN tipos_solicitud ts ON s.id_tipo_solicitud = ts.id
            JOIN estados e ON s.id_estado = e.id
            WHERE s.id_usuario = $1
            ORDER BY s.fecha_registro DESC
        `, [id_usuario]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo solicitudes por usuario:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener solicitudes por estado
router.get('/solicitudes/estado/:id_estado', async (req, res) => {
    try {
        const { id_estado } = req.params;
        const result = await db.query(`
            SELECT
                s.*,
                u.codigo_asociado,
                o.nombre_completo AS operador_nombre,
                ts.nombre AS tipo_solicitud,
                e.nombre AS estado_nombre
            FROM solicitudes s
            JOIN usuarios u ON s.id_usuario = u.id_usuario
            JOIN operadores o ON s.id_operador = o.id_operador
            JOIN tipos_solicitud ts ON s.id_tipo_solicitud = ts.id
            JOIN estados e ON s.id_estado = e.id
            WHERE s.id_estado = $1
            ORDER BY s.fecha_registro DESC
        `, [id_estado]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo solicitudes por estado:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
