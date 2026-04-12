const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { logCreate, logUpdate, logDelete } = require('../db/log-sistema');

// Obtener todos los usuarios/socios (solo código de asociado)
router.get('/usuarios', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id_usuario, codigo_asociado 
            FROM usuarios 
            ORDER BY id_usuario
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo usuarios:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener un usuario por ID
router.get('/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT id_usuario, codigo_asociado 
            FROM usuarios 
            WHERE id_usuario = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Error obteniendo usuario:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Buscar usuario por código de asociado
router.get('/usuarios/buscar/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const result = await db.query(`
            SELECT id_usuario, codigo_asociado 
            FROM usuarios 
            WHERE codigo_asociado = $1
        `, [codigo]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Error buscando usuario:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nuevo usuario/socio (solo código de asociado)
router.post('/usuarios', async (req, res) => {
    try {
        const { codigo_asociado, id_operador } = req.body;
        if (!codigo_asociado) {
            return res.status(400).json({ success: false, message: 'El código de asociado es obligatorio' });
        }
        const result = await db.query(
            'INSERT INTO usuarios (codigo_asociado) VALUES ($1) RETURNING *',
            [codigo_asociado]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'usuarios',
            operadorId: id_operador || null,
            registroId: result.rows[0].id_usuario,
            descripcion: `Usuario creado: codigo_asociado=${codigo_asociado}`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Usuario creado exitosamente' });
    } catch (err) {
        console.error("Error creando usuario:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar usuario
router.put('/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { codigo_asociado, id_operador } = req.body;

        // Obtener datos anteriores
        const oldResult = await db.query('SELECT * FROM usuarios WHERE id_usuario = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query(
            'UPDATE usuarios SET codigo_asociado = $1 WHERE id_usuario = $2 RETURNING *',
            [codigo_asociado, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'usuarios',
            operadorId: id_operador || null,
            registroId: parseInt(id),
            descripcion: `Usuario actualizado: codigo_asociado=${codigo_asociado}`,
            datosNuevos: result.rows[0],
            datosAnteriores,
            req
        });

        res.json({ success: true, data: result.rows[0], message: 'Usuario actualizado exitosamente' });
    } catch (err) {
        console.error("Error actualizando usuario:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar usuario
router.delete('/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM usuarios WHERE id_usuario = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM usuarios WHERE id_usuario = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'usuarios',
            operadorId: id_operador || null,
            registroId: parseInt(id),
            descripcion: `Usuario eliminado: id_usuario=${id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Usuario eliminado exitosamente' });
    } catch (err) {
        console.error("Error eliminando usuario:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
