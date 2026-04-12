const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { logCreate, logUpdate, logDelete } = require('../db/log-sistema');

// Estados válidos para cálculos
const ESTADOS_VALIDOS = [
    'Prueba de modificacion',
    'Verificacion de Modificacion',
    'En espera'
];

// Obtener todos los cálculos
router.get('/calculos', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                c.*,
                co.id_solicitud
            FROM calculos c
            JOIN controles co ON c.id_control = co.id_control
            ORDER BY c.id_calculo DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo cálculos:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener cálculos por control
router.get('/calculos/control/:id_control', async (req, res) => {
    try {
        const { id_control } = req.params;
        const result = await db.query(`
            SELECT
                c.*,
                co.id_solicitud
            FROM calculos c
            JOIN controles co ON c.id_control = co.id_control
            WHERE c.id_control = $1
            ORDER BY c.id_calculo DESC
        `, [id_control]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo cálculos por control:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener un cálculo por ID
router.get('/calculos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT
                c.*,
                co.id_solicitud
            FROM calculos c
            JOIN controles co ON c.id_control = co.id_control
            WHERE c.id_calculo = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Cálculo no encontrado' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Error obteniendo cálculo:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nuevo cálculo
router.post('/calculos', async (req, res) => {
    try {
        const {
            id_control,
            consumo_original,
            consumo_estimado,
            consumo_corregido,
            diferencia,
            es_procedente,
            estado
        } = req.body;

        if (!id_control || consumo_original === undefined || consumo_estimado === undefined ||
            consumo_corregido === undefined || diferencia === undefined || es_procedente === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos del cálculo son obligatorios'
            });
        }

        // Validar estado si se proporciona
        const estadoFinal = estado || 'En espera';
        if (!ESTADOS_VALIDOS.includes(estadoFinal)) {
            return res.status(400).json({
                success: false,
                message: `Estado inválido. Estados permitidos: ${ESTADOS_VALIDOS.join(', ')}`
            });
        }

        const result = await db.query(
            `INSERT INTO calculos (
                id_control,
                consumo_original,
                consumo_estimado,
                consumo_corregido,
                diferencia,
                es_procedente,
                estado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                id_control,
                consumo_original,
                consumo_estimado,
                consumo_corregido,
                diferencia,
                es_procedente,
                estadoFinal
            ]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'calculos',
            operadorId: req.body.id_operador_log || null,
            registroId: result.rows[0].id_calculo,
            descripcion: `Cálculo creado: consumo_original=${consumo_original}, consumo_corregido=${consumo_corregido}, procedente=${es_procedente}`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Cálculo creado exitosamente' });
    } catch (err) {
        console.error("Error creando cálculo:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar cálculo (incluyendo estado)
router.put('/calculos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            consumo_original,
            consumo_estimado,
            consumo_corregido,
            diferencia,
            es_procedente,
            estado
        } = req.body;

        // Validar estado si se proporciona
        if (estado && !ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({
                success: false,
                message: `Estado inválido. Estados permitidos: ${ESTADOS_VALIDOS.join(', ')}`
            });
        }

        const result = await db.query(
            `UPDATE calculos
             SET consumo_original = $1,
                 consumo_estimado = $2,
                 consumo_corregido = $3,
                 diferencia = $4,
                 es_procedente = $5,
                 estado = COALESCE($6, estado)
             WHERE id_calculo = $7 RETURNING *`,
            [
                consumo_original,
                consumo_estimado,
                consumo_corregido,
                diferencia,
                es_procedente,
                estado || null,
                id
            ]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Cálculo no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'calculos',
            operadorId: req.body.id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Cálculo actualizado: id_calculo=${id}`,
            datosNuevos: result.rows[0],
            req
        });

        res.json({ success: true, data: result.rows[0], message: 'Cálculo actualizado exitosamente' });
    } catch (err) {
        console.error("Error actualizando cálculo:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar solo el estado de un cálculo
router.put('/calculos/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        if (!estado) {
            return res.status(400).json({
                success: false,
                message: 'El campo estado es obligatorio'
            });
        }

        if (!ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({
                success: false,
                message: `Estado inválido. Estados permitidos: ${ESTADOS_VALIDOS.join(', ')}`
            });
        }

        const result = await db.query(
            'UPDATE calculos SET estado = $1 WHERE id_calculo = $2 RETURNING *',
            [estado, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Cálculo no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'calculos',
            operadorId: req.body.id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Estado de cálculo cambiado a "${estado}": id_calculo=${id}`,
            datosNuevos: { estado },
            req
        });

        res.json({
            success: true,
            data: result.rows[0],
            message: `Estado actualizado a: ${estado}`
        });
    } catch (err) {
        console.error("Error actualizando estado del cálculo:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar cálculo
router.delete('/calculos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM calculos WHERE id_calculo = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM calculos WHERE id_calculo = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Cálculo no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'calculos',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Cálculo eliminado: id_calculo=${id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Cálculo eliminado exitosamente' });
    } catch (err) {
        console.error("Error eliminando cálculo:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
