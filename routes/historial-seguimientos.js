const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { logCreate, logUpdate, logDelete } = require('../db/log-sistema');

// ==================== HISTORIAL ====================

// Obtener todo el historial
router.get('/historial', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                h.*,
                o.nombre_completo AS operador_nombre,
                s.descripcion AS solicitud_descripcion
            FROM historial h
            JOIN operadores o ON h.id_operador = o.id_operador
            LEFT JOIN solicitudes s ON h.id_solicitud = s.id_solicitud
            ORDER BY h.fecha DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo historial:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener historial por operador
router.get('/historial/operador/:id_operador', async (req, res) => {
    try {
        const { id_operador } = req.params;
        const result = await db.query(`
            SELECT 
                h.*,
                o.nombre_completo AS operador_nombre,
                s.descripcion AS solicitud_descripcion
            FROM historial h
            JOIN operadores o ON h.id_operador = o.id_operador
            LEFT JOIN solicitudes s ON h.id_solicitud = s.id_solicitud
            WHERE h.id_operador = $1
            ORDER BY h.fecha DESC
        `, [id_operador]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo historial por operador:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener historial por solicitud
router.get('/historial/solicitud/:id_solicitud', async (req, res) => {
    try {
        const { id_solicitud } = req.params;
        const result = await db.query(`
            SELECT 
                h.*,
                o.nombre_completo AS operador_nombre,
                s.descripcion AS solicitud_descripcion
            FROM historial h
            JOIN operadores o ON h.id_operador = o.id_operador
            LEFT JOIN solicitudes s ON h.id_solicitud = s.id_solicitud
            WHERE h.id_solicitud = $1
            ORDER BY h.fecha DESC
        `, [id_solicitud]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo historial por solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nuevo registro en historial
router.post('/historial', async (req, res) => {
    try {
        const { id_operador, id_solicitud, accion } = req.body;

        if (!id_operador || !accion) {
            return res.status(400).json({
                success: false,
                message: 'Los campos id_operador y accion son obligatorios'
            });
        }

        const result = await db.query(
            `INSERT INTO historial (id_operador, id_solicitud, accion)
             VALUES ($1, $2, $3) RETURNING *`,
            [id_operador, id_solicitud || null, accion]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'historial',
            operadorId: id_operador,
            registroId: result.rows[0].id,
            descripcion: `Registro de historial creado: ${accion}`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Registro de historial creado exitosamente' });
    } catch (err) {
        console.error("Error creando registro de historial:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar registro de historial
router.delete('/historial/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM historial WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM historial WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Registro no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'historial',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Registro de historial eliminado: id=${id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Registro eliminado exitosamente' });
    } catch (err) {
        console.error("Error eliminando registro de historial:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// ==================== SEGUIMIENTOS ====================

// Obtener todos los seguimientos
router.get('/seguimientos', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                s.*,
                sol.descripcion AS solicitud_descripcion
            FROM seguimientos s
            JOIN solicitudes sol ON s.id_solicitud = sol.id_solicitud
            ORDER BY s.fecha DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo seguimientos:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener seguimientos por solicitud
router.get('/seguimientos/solicitud/:id_solicitud', async (req, res) => {
    try {
        const { id_solicitud } = req.params;
        const result = await db.query(`
            SELECT 
                s.*,
                sol.descripcion AS solicitud_descripcion
            FROM seguimientos s
            JOIN solicitudes sol ON s.id_solicitud = sol.id_solicitud
            WHERE s.id_solicitud = $1
            ORDER BY s.fecha DESC
        `, [id_solicitud]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo seguimientos por solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nuevo seguimiento
router.post('/seguimientos', async (req, res) => {
    try {
        const { id_solicitud, observacion, fecha, id_operador_log } = req.body;

        if (!id_solicitud || !observacion) {
            return res.status(400).json({
                success: false,
                message: 'Los campos id_solicitud y observacion son obligatorios'
            });
        }

        const result = await db.query(
            `INSERT INTO seguimientos (id_solicitud, observacion, fecha)
             VALUES ($1, $2, $3) RETURNING *`,
            [id_solicitud, observacion, fecha || null]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'seguimientos',
            operadorId: id_operador_log || null,
            registroId: result.rows[0].id,
            descripcion: `Seguimiento creado para solicitud id=${id_solicitud}`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Seguimiento creado exitosamente' });
    } catch (err) {
        console.error("Error creando seguimiento:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar seguimiento
router.put('/seguimientos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { observacion, fecha, id_operador_log } = req.body;

        // Obtener datos anteriores
        const oldResult = await db.query('SELECT * FROM seguimientos WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query(
            `UPDATE seguimientos
             SET observacion = $1, fecha = $2
             WHERE id = $3 RETURNING *`,
            [observacion, fecha, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Seguimiento no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'seguimientos',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Seguimiento actualizado: id=${id}`,
            datosNuevos: result.rows[0],
            datosAnteriores,
            req
        });

        res.json({ success: true, data: result.rows[0], message: 'Seguimiento actualizado exitosamente' });
    } catch (err) {
        console.error("Error actualizando seguimiento:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar seguimiento
router.delete('/seguimientos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM seguimientos WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM seguimientos WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Seguimiento no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'seguimientos',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Seguimiento eliminado: id=${id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Seguimiento eliminado exitosamente' });
    } catch (err) {
        console.error("Error eliminando seguimiento:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
