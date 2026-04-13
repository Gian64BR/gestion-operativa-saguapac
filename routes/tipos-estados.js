const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { logCreate, logUpdate, logDelete } = require('../db/log-sistema');

// ==================== TIPOS DE SOLICITUD ====================

// Obtener todos los tipos de solicitud
router.get('/tipos-solicitud', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM tipos_solicitud ORDER BY id');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo tipos de solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nuevo tipo de solicitud
router.post('/tipos-solicitud', async (req, res) => {
    try {
        const { nombre, id_operador_log } = req.body;
        if (!nombre) {
            return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
        }
        const result = await db.query(
            'INSERT INTO tipos_solicitud (nombre) VALUES ($1) RETURNING *',
            [nombre]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'tipos_solicitud',
            operadorId: id_operador_log || null,
            registroId: result.rows[0].id,
            descripcion: `Tipo de solicitud creado: ${nombre}`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Tipo de solicitud creado exitosamente' });
    } catch (err) {
        console.error("Error creando tipo de solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar tipo de solicitud
router.put('/tipos-solicitud/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, id_operador_log } = req.body;

        // Obtener datos anteriores
        const oldResult = await db.query('SELECT * FROM tipos_solicitud WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query(
            'UPDATE tipos_solicitud SET nombre = $1 WHERE id = $2 RETURNING *',
            [nombre, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Tipo de solicitud no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'tipos_solicitud',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Tipo de solicitud actualizado: ${nombre}`,
            datosNuevos: result.rows[0],
            datosAnteriores,
            req
        });

        res.json({ success: true, data: result.rows[0], message: 'Tipo de solicitud actualizado exitosamente' });
    } catch (err) {
        console.error("Error actualizando tipo de solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar tipo de solicitud
router.delete('/tipos-solicitud/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM tipos_solicitud WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM tipos_solicitud WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Tipo de solicitud no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'tipos_solicitud',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Tipo de solicitud eliminado: ${datosAnteriores?.nombre || 'id=' + id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Tipo de solicitud eliminado exitosamente' });
    } catch (err) {
        console.error("Error eliminando tipo de solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// ==================== ESTADOS ====================

// Obtener todos los estados
router.get('/estados', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM estados ORDER BY id');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo estados:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nuevo estado
router.post('/estados', async (req, res) => {
    try {
        const { nombre, id_operador_log } = req.body;
        if (!nombre) {
            return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
        }
        const result = await db.query(
            'INSERT INTO estados (nombre) VALUES ($1) RETURNING *',
            [nombre]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'estados',
            operadorId: id_operador_log || null,
            registroId: result.rows[0].id,
            descripcion: `Estado creado: ${nombre}`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Estado creado exitosamente' });
    } catch (err) {
        console.error("Error creando estado:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar estado
router.put('/estados/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, id_operador_log } = req.body;

        // Obtener datos anteriores
        const oldResult = await db.query('SELECT * FROM estados WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query(
            'UPDATE estados SET nombre = $1 WHERE id = $2 RETURNING *',
            [nombre, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Estado no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'estados',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Estado actualizado: ${nombre}`,
            datosNuevos: result.rows[0],
            datosAnteriores,
            req
        });

        res.json({ success: true, data: result.rows[0], message: 'Estado actualizado exitosamente' });
    } catch (err) {
        console.error("Error actualizando estado:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar estado
router.delete('/estados/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM estados WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM estados WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Estado no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'estados',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Estado eliminado: ${datosAnteriores?.nombre || 'id=' + id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Estado eliminado exitosamente' });
    } catch (err) {
        console.error("Error eliminando estado:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
