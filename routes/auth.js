const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const { logLogin, logLogout, logCreate } = require('../db/log-sistema');

// Ruta para registro de operadores (POST /api/register)
router.post('/register', async (req, res) => {
    try {
        const { fullName, username, password, role, documentId } = req.body;

        // Validaciones básicas del frontend
        if (!fullName || !username || !password) {
            return res.status(400).json({ success: false, message: 'Todos los campos base son obligatorios' });
        }

        // VALIDACIÓN DE CONTRASEÑA - Debe iniciar con "saguapac" + mínimo 4 números
        const passwordRegex = /^saguapac\d{4,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Contraseña incorrecta. Por favor comunícate con Gianmarco Bulacia.'
            });
        }

        const codigo_interno = documentId || `INT-${Date.now()}`;

        // Verificar si el usuario o codigo ya existe
        const userExists = await db.query('SELECT * FROM operadores WHERE usuario = $1 OR codigo_interno = $2', [username, codigo_interno]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'El usuario o código ya está en uso' });
        }

        // Encriptar la contraseña (Regla de seguridad exigida)
        const salt = await bcrypt.genSalt(10);
        const hashedPsw = await bcrypt.hash(password, salt);

        // Determinar el rol (solo puede ser 'administrador' u 'operador')
        const userRole = (role === 'administrador' || role === 'admin') ? 'administrador' : 'operador';

        // Insertar a la base de datos INCLUYENDO EL ROL
        const newUser = await db.query(
            'INSERT INTO operadores (nombre_completo, usuario, contrasena, codigo_interno, role) VALUES ($1, $2, $3, $4, $5) RETURNING id_operador, nombre_completo, usuario, role',
            [fullName, username, hashedPsw, codigo_interno, userRole]
        );

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'operadores',
            operadorId: newUser.rows[0].id_operador,
            registroId: newUser.rows[0].id_operador,
            descripcion: `Operador registrado: ${fullName} (${username}) con rol ${userRole}`,
            datosNuevos: { nombre_completo: fullName, usuario: username, role: userRole, codigo_interno },
            req
        });

        res.status(201).json({ success: true, message: 'Operador registrado exitosamente', userId: newUser.rows[0].id_operador, role: newUser.rows[0].role });

    } catch (err) {
        console.error("DEBUG BD ERROR (Registro):", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Ruta para inicio de sesión (POST /api/login)
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Debe ingresar usuario y contraseña' });
        }

        // Buscar operador
        const userResult = await db.query('SELECT * FROM operadores WHERE usuario = $1', [username]);
        const operador = userResult.rows[0];

        if (!operador) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        // Verificar contraseña con bcrypt
        const isMatch = await bcrypt.compare(password, operador.contrasena);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        // Actualizar last_login (updated_at)
        await db.query('UPDATE operadores SET updated_at = NOW() WHERE id_operador = $1', [operador.id_operador]);

        // Registrar login en bitácora del sistema
        await logLogin({
            operadorId: operador.id_operador,
            descripcion: `Inicio de sesión: ${operador.usuario}`,
            req
        });

        // USAR EL ROL ALMACENADO EN LA BASE DE DATOS
        const userRole = operador.role || 'operador';

        res.status(200).json({
            success: true,
            role: userRole,
            fullName: operador.nombre_completo,
            userId: operador.id_operador
        });

    } catch (err) {
        console.error("DEBUG BD ERROR (Login):", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Ruta para logout (POST /api/logout)
router.post('/logout', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId es requerido' });
        }

        // Obtener nombre del operador antes de actualizar
        const opResult = await db.query('SELECT usuario FROM operadores WHERE id_operador = $1', [userId]);
        const operadorUsuario = opResult.rows[0]?.usuario || 'desconocido';

        // Actualizar updated_at para registrar el logout
        await db.query('UPDATE operadores SET updated_at = NOW() WHERE id_operador = $1', [userId]);

        // Registrar logout en bitácora del sistema
        await logLogout({
            operadorId: userId,
            descripcion: `Cierre de sesión: ${operadorUsuario}`,
            req
        });

        res.json({ success: true, message: 'Logout registrado' });
    } catch (err) {
        console.error("Error registrando logout:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Ruta para heartbeat/presencia (POST /api/heartbeat)
// Actualiza el timestamp de actividad del usuario para indicar que está activo
router.post('/heartbeat', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId es requerido' });
        }
        // Actualizar updated_at para indicar que el usuario está activo
        await db.query('UPDATE operadores SET updated_at = NOW() WHERE id_operador = $1', [userId]);
        res.json({ success: true, message: 'Heartbeat registrado' });
    } catch (err) {
        console.error("Error registrando heartbeat:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
