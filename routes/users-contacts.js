const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const { logCreate, logUpdate, logDelete, logPasswordChange } = require('../db/log-sistema');

// ==================== USUARIOS (SISTEMA) ====================

// Obtener todos los usuarios (operadores)
router.get('/users', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                id_operador as id,
                nombre_completo as full_name,
                usuario as username,
                codigo_interno,
                role,
                COALESCE(created_at, NOW()) as created_at,
                COALESCE(updated_at, NOW()) as last_login
            FROM operadores
            ORDER BY nombre_completo ASC
        `);

        // Add online status based on last activity
        const users = result.rows.map(user => ({
            ...user,
            avatar_color: getColorForUser(user.username)
        }));

        res.json({ success: true, data: users });
    } catch (err) {
        console.error("Error obteniendo usuarios:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Helper: Generate consistent color for user
function getColorForUser(username) {
    const colors = ['#14b8a6', '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

// Obtener un usuario por ID
router.get('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT
                id_operador as id,
                nombre_completo as full_name,
                usuario as username,
                codigo_interno,
                role,
                created_at,
                updated_at
            FROM operadores
            WHERE id_operador = $1
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

// Validar contraseña actual (para cambio de contraseña)
router.post('/validate-current-password', async (req, res) => {
    try {
        const { userId, currentPassword } = req.body;

        if (!userId || !currentPassword) {
            return res.status(400).json({ valid: false, message: 'userId y currentPassword son obligatorios' });
        }

        const result = await db.query(
            'SELECT contrasena FROM operadores WHERE id_operador = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.json({ valid: false, message: 'Usuario no encontrado' });
        }

        const isValid = await bcrypt.compare(currentPassword, result.rows[0].contrasena);
        res.json({ valid: isValid });
    } catch (err) {
        console.error("Error validando contraseña:", err.message);
        res.status(500).json({ valid: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nuevo usuario
router.post('/users', async (req, res) => {
    try {
        const { full_name, username, password, role, codigo_interno } = req.body;

        if (!full_name || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Los campos full_name, username y password son obligatorios'
            });
        }

        // VALIDACIÓN DE CONTRASEÑA - Debe iniciar con "saguapac" + mínimo 4 números
        const passwordRegex = /^saguapac\d{4,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Contraseña incorrecta. Por favor comunícate con Gianmarco Bulacia.'
            });
        }

        // Verificar si el usuario ya existe
        const userExists = await db.query(
            'SELECT * FROM operadores WHERE usuario = $1 OR codigo_interno = $2',
            [username, codigo_interno || username]
        );
        if (userExists.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'El usuario o código ya está en uso' });
        }

        // Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const codigo = codigo_interno || `INT-${Date.now()}`;

        // Determinar el rol (solo puede ser 'administrador' u 'operador')
        const userRole = (role === 'administrador' || role === 'admin') ? 'administrador' : 'operador';

        const result = await db.query(
            `INSERT INTO operadores (nombre_completo, usuario, contrasena, codigo_interno, role)
             VALUES ($1, $2, $3, $4, $5) RETURNING id_operador, nombre_completo, usuario, codigo_interno, role, created_at`,
            [full_name, username, hashedPassword, codigo, userRole]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'operadores',
            operadorId: result.rows[0].id_operador,
            registroId: result.rows[0].id_operador,
            descripcion: `Usuario del sistema creado: ${full_name} (${username}) con rol ${userRole}`,
            datosNuevos: { full_name, username, role: userRole, codigo_interno: codigo },
            req
        });

        res.status(201).json({
            success: true,
            data: result.rows[0],
            message: 'Usuario creado exitosamente'
        });
    } catch (err) {
        console.error("Error creando usuario:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar usuario
router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, password, role } = req.body;

        // Build update fields dynamically to handle any combination
        const fields = [];
        const params = [];
        let paramIdx = 1;

        if (full_name) {
            fields.push(`nombre_completo = $${paramIdx}`);
            params.push(full_name);
            paramIdx++;
        }

        if (password) {
            const passwordRegex = /^saguapac\d{4,}$/;
            if (!passwordRegex.test(password)) {
                return res.status(400).json({
                    success: false,
                    message: 'Contraseña incorrecta. Por favor comunícate con Gianmarco Bulacia.'
                });
            }
            const salt = await bcrypt.genSalt(10);
            fields.push(`contrasena = $${paramIdx}`);
            params.push(await bcrypt.hash(password, salt));
            paramIdx++;
        }

        if (role) {
            const userRole = (role === 'administrador' || role === 'admin') ? 'administrador' : 'operador';
            fields.push(`role = $${paramIdx}`);
            params.push(userRole);
            paramIdx++;
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: 'Debe proporcionar full_name, password o role' });
        }

        fields.push(`updated_at = NOW()`);
        params.push(id);

        const result = await db.query(
            `UPDATE operadores SET ${fields.join(', ')} WHERE id_operador = $${paramIdx} RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        // Log appropriately
        if (password) {
            await logPasswordChange({
                operadorId: req.body.id_operador_log || parseInt(id),
                registroId: parseInt(id),
                descripcion: `Contraseña actualizada para usuario: ${result.rows[0].nombre_completo}`,
                req
            });
        } else {
            await logUpdate({
                tabla: 'operadores',
                operadorId: req.body.id_operador_log || null,
                registroId: parseInt(id),
                descripcion: `Usuario actualizado: ${result.rows[0].nombre_completo}`,
                datosNuevos: result.rows[0],
                req
            });
        }

        const msg = [];
        if (full_name) msg.push('nombre');
        if (password) msg.push('contraseña');
        if (role) msg.push('rol');
        res.json({ success: true, data: result.rows[0], message: `${msg.join(', ')} actualizado(s) exitosamente` });
    } catch (err) {
        console.error("Error actualizando usuario:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar usuario
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM operadores WHERE id_operador = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM operadores WHERE id_operador = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'operadores',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Usuario del sistema eliminado: ${datosAnteriores?.nombre_completo || 'id=' + id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Usuario eliminado exitosamente' });
    } catch (err) {
        console.error("Error eliminando usuario:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// ==================== CONTACTOS (DIRECTORIO) ====================

// Obtener todos los contactos
router.get('/contacts', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                d.id,
                d.nombre,
                d.cargo,
                d.gerencia,
                d.area,
                d.telefono,
                d.internal_id,
                d.nota,
                d.avatar,
                d.id_operador_creacion,
                d.id_operador_actualizacion,
                oc.usuario as creado_por_usuario,
                oa.usuario as actualizado_por_usuario
            FROM directorio d
            LEFT JOIN operadores oc ON d.id_operador_creacion = oc.id_operador
            LEFT JOIN operadores oa ON d.id_operador_actualizacion = oa.id_operador
            ORDER BY d.nombre ASC
        `);

        const contacts = result.rows.map(c => ({
            id: c.id.toString(),
            nombre: c.nombre,
            cargo: c.cargo,
            gerencia: c.gerencia || '',
            area: c.area || '',
            telefono: c.telefono || '',
            internal_id: c.internal_id || '',
            nota: c.nota || '',
            avatar: c.avatar || '',
            id_operador_creacion: c.id_operador_creacion,
            id_operador_actualizacion: c.id_operador_actualizacion,
            creado_por: c.creado_por_usuario || null,
            actualizado_por: c.actualizado_por_usuario || null
        }));

        res.json({ success: true, data: contacts });
    } catch (err) {
        console.error("Error obteniendo contactos:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nuevo contacto
router.post('/contacts', async (req, res) => {
    try {
        const { nombre, cargo, area, gerencia, telefono, internal_id, nota, avatar, id_operador_log } = req.body;

        if (!nombre || !cargo) {
            return res.status(400).json({
                success: false,
                message: 'Los campos nombre y cargo son obligatorios'
            });
        }

        const result = await db.query(
            `INSERT INTO directorio (nombre, cargo, area, gerencia, telefono, internal_id, nota, avatar, id_operador_creacion)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [nombre, cargo, area || '', gerencia || '', telefono || '', internal_id || '', nota || null, avatar || null, id_operador_log || null]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'directorio',
            operadorId: id_operador_log || null,
            registroId: result.rows[0].id,
            descripcion: `Contacto creado: ${nombre} (${cargo})`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Contacto creado exitosamente' });
    } catch (err) {
        console.error("Error creando contacto:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar contacto
router.put('/contacts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, cargo, area, gerencia, telefono, internal_id, nota, avatar, id_operador_log } = req.body;

        // Obtener datos anteriores
        const oldResult = await db.query('SELECT * FROM directorio WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query(
            `UPDATE directorio
             SET nombre = $1, cargo = $2, area = $3, gerencia = $4, telefono = $5, 
                 internal_id = $6, nota = $7, avatar = $8, id_operador_actualizacion = $9
             WHERE id = $10 RETURNING *`,
            [nombre, cargo, area || '', gerencia || '', telefono || '', internal_id || '', nota || null, avatar || null, id_operador_log || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Contacto no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'directorio',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Contacto actualizado: ${nombre} (${cargo})`,
            datosNuevos: result.rows[0],
            datosAnteriores,
            req
        });

        res.json({ success: true, data: result.rows[0], message: 'Contacto actualizado exitosamente' });
    } catch (err) {
        console.error("Error actualizando contacto:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar contacto
router.delete('/contacts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM directorio WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM directorio WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Contacto no encontrado' });
        }

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'directorio',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Contacto eliminado: ${datosAnteriores?.nombre || 'id=' + id}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Contacto eliminado exitosamente' });
    } catch (err) {
        console.error("Error eliminando contacto:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
