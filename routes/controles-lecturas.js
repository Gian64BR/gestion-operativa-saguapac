const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { logCreate, logUpdate, logDelete } = require('../db/log-sistema');

// ==================== CONTROLES ====================

// Obtener todos los controles
router.get('/controles', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                c.*,
                s.descripcion AS solicitud_descripcion
            FROM controles c
            JOIN solicitudes s ON c.id_solicitud = s.id_solicitud
            ORDER BY c.fecha_inicio DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo controles:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener un control por ID
router.get('/controles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT 
                c.*,
                s.descripcion AS solicitud_descripcion
            FROM controles c
            JOIN solicitudes s ON c.id_solicitud = s.id_solicitud
            WHERE c.id_control = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Control no encontrado' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Error obteniendo control:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener controles por solicitud
router.get('/controles/solicitud/:id_solicitud', async (req, res) => {
    try {
        const { id_solicitud } = req.params;
        const result = await db.query(`
            SELECT 
                c.*,
                s.descripcion AS solicitud_descripcion
            FROM controles c
            JOIN solicitudes s ON c.id_solicitud = s.id_solicitud
            WHERE c.id_solicitud = $1
            ORDER BY c.fecha_inicio DESC
        `, [id_solicitud]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo controles por solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nuevo control
router.post('/controles', async (req, res) => {
    try {
        const { id_solicitud, fecha_inicio, fecha_fin, estado_control, id_operador_log } = req.body;

        if (!id_solicitud) {
            return res.status(400).json({ success: false, message: 'El id_solicitud es obligatorio' });
        }

        const result = await db.query(
            `INSERT INTO controles (id_solicitud, fecha_inicio, fecha_fin, estado_control)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [id_solicitud, fecha_inicio || null, fecha_fin || null, estado_control || null]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'controles',
            operadorId: id_operador_log || null,
            registroId: result.rows[0].id_control,
            descripcion: `Control creado para solicitud id=${id_solicitud}`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Control creado exitosamente' });
    } catch (err) {
        console.error("Error creando control:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar control
router.put('/controles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha_inicio, fecha_fin, estado_control, id_operador_log } = req.body;

        // Obtener datos anteriores
        const oldResult = await db.query('SELECT * FROM controles WHERE id_control = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query(
            `UPDATE controles
             SET fecha_inicio = $1, fecha_fin = $2, estado_control = $3
             WHERE id_control = $4 RETURNING *`,
            [fecha_inicio, fecha_fin, estado_control, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Control no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'controles',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Control actualizado: id_control=${id}`,
            datosNuevos: result.rows[0],
            datosAnteriores,
            req
        });

        res.json({ success: true, data: result.rows[0], message: 'Control actualizado exitosamente' });
    } catch (err) {
        console.error("Error actualizando control:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar control
router.delete('/controles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM controles WHERE id_control = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM controles WHERE id_control = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Control no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'controles',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Control eliminado: id_control=${id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Control eliminado exitosamente' });
    } catch (err) {
        console.error("Error eliminando control:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// ==================== LECTURAS ====================

// Obtener todas las lecturas
router.get('/lecturas', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                l.*,
                c.id_solicitud
            FROM lecturas l
            JOIN controles c ON l.id_control = c.id_control
            ORDER BY l.fecha DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo lecturas:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener lecturas por control
router.get('/lecturas/control/:id_control', async (req, res) => {
    try {
        const { id_control } = req.params;
        const result = await db.query(`
            SELECT 
                l.*,
                c.id_solicitud
            FROM lecturas l
            JOIN controles c ON l.id_control = c.id_control
            WHERE l.id_control = $1
            ORDER BY l.fecha DESC
        `, [id_control]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo lecturas por control:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nueva lectura
router.post('/lecturas', async (req, res) => {
    try {
        const { id_control, tipo_lectura, lectura, fecha, id_operador_log } = req.body;

        if (!id_control || !tipo_lectura || lectura === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Los campos id_control, tipo_lectura y lectura son obligatorios'
            });
        }

        if (!['inspector', 'usuario'].includes(tipo_lectura)) {
            return res.status(400).json({
                success: false,
                message: 'El tipo_lectura debe ser "inspector" o "usuario"'
            });
        }

        const result = await db.query(
            `INSERT INTO lecturas (id_control, tipo_lectura, lectura, fecha)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [id_control, tipo_lectura, lectura, fecha || null]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'lecturas',
            operadorId: id_operador_log || null,
            registroId: result.rows[0].id_lectura,
            descripcion: `Lectura ${tipo_lectura} creada: ${lectura} para control id=${id_control}`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Lectura creada exitosamente' });
    } catch (err) {
        console.error("Error creando lectura:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar lectura
router.put('/lecturas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo_lectura, lectura, fecha, id_operador_log } = req.body;

        if (tipo_lectura && !['inspector', 'usuario'].includes(tipo_lectura)) {
            return res.status(400).json({
                success: false,
                message: 'El tipo_lectura debe ser "inspector" o "usuario"'
            });
        }

        // Obtener datos anteriores
        const oldResult = await db.query('SELECT * FROM lecturas WHERE id_lectura = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query(
            `UPDATE lecturas
             SET tipo_lectura = $1, lectura = $2, fecha = $3
             WHERE id_lectura = $4 RETURNING *`,
            [tipo_lectura, lectura, fecha, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Lectura no encontrada' });
        }

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'lecturas',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Lectura actualizada: id_lectura=${id}`,
            datosNuevos: result.rows[0],
            datosAnteriores,
            req
        });

        res.json({ success: true, data: result.rows[0], message: 'Lectura actualizada exitosamente' });
    } catch (err) {
        console.error("Error actualizando lectura:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar lectura
router.delete('/lecturas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM lecturas WHERE id_lectura = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM lecturas WHERE id_lectura = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Lectura no encontrada' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'lecturas',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Lectura eliminada: id_lectura=${id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Lectura eliminada exitosamente' });
    } catch (err) {
        console.error("Error eliminando lectura:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
