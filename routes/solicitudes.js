const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { logCreate, logUpdate, logDelete } = require('../db/log-sistema');

// Seed data for demo
async function ensureSeedData() {
    try {
        const count = await db.query('SELECT COUNT(*) FROM usuarios');
        if (parseInt(count.rows[0].count) === 0) {
            const codigos = ['100000001', '100000002', '100000003', '100000004', '100000005',
                '100000006', '100000007', '100000008', '100000009', '100000010',
                '100000011', '100000012', '100000013', '100000014', '100000015'];
            for (const cod of codigos) {
                await db.query('INSERT INTO usuarios (codigo_asociado) VALUES ($1) ON CONFLICT DO NOTHING', [cod]);
            }
        }

        const solicitudesCount = await db.query('SELECT COUNT(*) FROM solicitudes');
        if (parseInt(solicitudesCount.rows[0].count) === 0) {
            const operadores = await db.query('SELECT id_operador FROM operadores LIMIT 1');
            const operadorId = operadores.rows[0]?.id_operador || 1;
            const tipos = await db.query('SELECT id FROM tipos_solicitud');
            const estados = await db.query('SELECT id FROM estados');
            const socios = await db.query('SELECT id_usuario FROM usuarios LIMIT 10');

            if (tipos.rows.length > 0 && estados.rows.length > 0 && socios.rows.length > 0) {
                const descs = [
                    'El medidor marcó 85 m³, muy por encima del promedio de 20 m³. Se solicita revisión.',
                    'Fuga en la tubería principal del frente de la vivienda. Pérdida constante de agua.',
                    'Consumo elevado en los últimos 3 meses, posible fuga interna.',
                    'El medidor presenta daños en la tapa y la lectura no es visible.',
                    'La factura de enero muestra 120 m³ cuando el consumo histórico es de 25 m³.',
                    'Reporte de olor a cloro en el agua. Se requiere inspección de calidad.',
                    'Baja presión en el suministro durante las horas pico de la mañana.',
                    'Conexión ilegal detectada en la calle Bolívar #345.',
                    'Solicitud de cambio de titularidad por fallecimiento del asociado.',
                    'El medidor dejó de funcionar y no registra consumo desde hace 2 meses.',
                    'Tubería rota por trabajos de construcción en la acera.',
                    'Reclamo por facturación excesiva en el mes de diciembre.',
                    'Instalación de medidor adicional para nueva vivienda en el terreno.',
                    'Corte programado no notificado en la zona Sur, UV 15.',
                    'Agua turbia después del mantenimiento de la red principal.'
                ];
                const adiciones = ['', '', '', '', ' Urgente.', ' Favor priorizar.', ' Cliente contactó 3 veces.'];
                for (let i = 0; i < 15; i++) {
                    const tipo = tipos.rows[i % tipos.rows.length];
                    const estado = estados.rows[i % estados.rows.length];
                    const socio = socios.rows[i % socios.rows.length];
                    const desc = descs[i] + adiciones[i % adiciones.length];
                    const fecha = new Date();
                    fecha.setDate(fecha.getDate() - Math.floor(Math.random() * 30));
                    await db.query(
                        `INSERT INTO solicitudes (id_usuario, id_operador, id_tipo_solicitud, id_estado, descripcion, fecha_registro)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [socio.id_usuario, operadorId, tipo.id, estado.id, desc, fecha]
                    );
                }
            }
        }
    } catch (err) {
        console.error('Error seeding data:', err.message);
    }
}

ensureSeedData();

/**
 * Reglas automáticas de estado de las solicitudes (se evalúan al consultar):
 *  - Al crearse: 'En proceso'.
 *  - Si pasan 24h sin ninguna modificación: pasa a 'Procedente'.
 *  - Si pasan 48h: se cierra como 'Cerrado - Procedente' o 'Cerrado - No procedente'
 *    según el resultado que tuviera. Una vez cerrada ya no se puede editar.
 */
async function aplicarReglasEstado() {
    try {
        // Regla 24h: sin modificar desde su creación -> Procedente
        await db.query(`
            UPDATE solicitudes s
            SET id_estado = (SELECT id FROM estados WHERE nombre = 'Procedente' ORDER BY id ASC LIMIT 1),
                updated_at = NOW()
            WHERE s.deleted_at IS NULL
              AND s.fecha_registro <= NOW() - INTERVAL '24 hours'
              AND s.fecha_registro > NOW() - INTERVAL '48 hours'
              AND s.updated_at <= s.fecha_registro
              AND s.id_estado IN (SELECT id FROM estados WHERE nombre IN ('En proceso', 'Pendiente'))
        `);

        // Regla 48h: cerrar respetando el resultado
        await db.query(`
            UPDATE solicitudes s
            SET id_estado = CASE
                    WHEN s.id_estado IN (SELECT id FROM estados WHERE nombre = 'No procedente')
                        THEN (SELECT id FROM estados WHERE nombre = 'Cerrado - No procedente' ORDER BY id ASC LIMIT 1)
                    ELSE (SELECT id FROM estados WHERE nombre = 'Cerrado - Procedente' ORDER BY id ASC LIMIT 1)
                END,
                updated_at = NOW()
            WHERE s.deleted_at IS NULL
              AND s.fecha_registro <= NOW() - INTERVAL '48 hours'
              AND s.id_estado IN (SELECT id FROM estados WHERE nombre IN ('Pendiente', 'En proceso', 'Procedente', 'No procedente'))
        `);
    } catch (err) {
        console.error('⚠️ Error aplicando reglas de estado:', err.message);
    }
}

// GET /api/solicitudes - List with pagination and search
router.get('/solicitudes', async (req, res) => {
    try {
        // Aplicar reglas automáticas de estado (24h -> Procedente, 48h -> Cerrado)
        await aplicarReglasEstado();

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const estado = req.query.estado || '';
        const tipo = req.query.tipo || '';

        let where = ['s.deleted_at IS NULL'];
        let params = [];
        let paramIdx = 1;

        if (search) {
            where.push(`(u.codigo_asociado ILIKE $${paramIdx} OR s.descripcion ILIKE $${paramIdx} OR op.nombre_completo ILIKE $${paramIdx})`);
            params.push(`%${search}%`);
            paramIdx++;
        }

        if (estado) {
            where.push(`e.id = $${paramIdx}`);
            params.push(parseInt(estado));
            paramIdx++;
        }

        if (tipo) {
            where.push(`t.id = $${paramIdx}`);
            params.push(parseInt(tipo));
            paramIdx++;
        }

        const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

        const countResult = await db.query(`
            SELECT COUNT(*) FROM solicitudes s
            JOIN usuarios u ON s.id_usuario = u.id_usuario
            JOIN operadores op ON s.id_operador = op.id_operador
            JOIN tipos_solicitud t ON s.id_tipo_solicitud = t.id
            JOIN estados e ON s.id_estado = e.id
            ${whereClause}
        `, params);

        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(`
            SELECT
                s.id_solicitud,
                s.id_usuario,
                u.codigo_asociado,
                s.id_operador,
                op.nombre_completo as operador_nombre,
                op.usuario as operador_usuario,
                s.id_tipo_solicitud,
                t.nombre as tipo_solicitud,
                s.id_estado,
                e.nombre as estado_nombre,
                s.descripcion,
                s.fecha_registro
            FROM solicitudes s
            JOIN usuarios u ON s.id_usuario = u.id_usuario
            JOIN operadores op ON s.id_operador = op.id_operador
            JOIN tipos_solicitud t ON s.id_tipo_solicitud = t.id
            JOIN estados e ON s.id_estado = e.id
            ${whereClause}
            ORDER BY s.fecha_registro DESC
            LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `, [...params, limit, offset]);

        const tipos = await db.query('SELECT * FROM tipos_solicitud ORDER BY nombre');
        const estados = await db.query('SELECT * FROM estados ORDER BY nombre');

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            catalogos: {
                tipos: tipos.rows,
                estados: estados.rows
            }
        });
    } catch (err) {
        console.error("Error obteniendo solicitudes:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// GET /api/solicitudes/:id
router.get('/solicitudes/:id', async (req, res) => {
    try {
        await aplicarReglasEstado();
        const { id } = req.params;
        const result = await db.query(`
            SELECT
                s.id_solicitud,
                s.id_usuario,
                u.codigo_asociado,
                s.id_operador,
                op.nombre_completo as operador_nombre,
                op.usuario as operador_usuario,
                s.id_tipo_solicitud,
                t.nombre as tipo_solicitud,
                s.id_estado,
                e.nombre as estado_nombre,
                s.descripcion,
                s.fecha_registro
            FROM solicitudes s
            JOIN usuarios u ON s.id_usuario = u.id_usuario
            JOIN operadores op ON s.id_operador = op.id_operador
            JOIN tipos_solicitud t ON s.id_tipo_solicitud = t.id
            JOIN estados e ON s.id_estado = e.id
            WHERE s.id_solicitud = $1 AND s.deleted_at IS NULL
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

// POST /api/solicitudes - Create
router.post('/solicitudes', async (req, res) => {
    try {
        const { codigo_asociado, id_tipo_solicitud, tipo_nombre, id_estado, descripcion, id_operador_log } = req.body;

        if (!codigo_asociado) {
            return res.status(400).json({
                success: false,
                message: 'El código de asociado es obligatorio'
            });
        }

        let tipoId = id_tipo_solicitud;

        if (!tipoId && tipo_nombre) {
            const tipoResult = await db.query(
                'SELECT id FROM tipos_solicitud WHERE nombre = $1 ORDER BY id ASC LIMIT 1',
                [tipo_nombre]
            );
            if (tipoResult.rows.length > 0) {
                tipoId = tipoResult.rows[0].id;
            } else {
                return res.status(400).json({
                    success: false,
                    message: `Tipo de solicitud no encontrado: ${tipo_nombre}`
                });
            }
        }

        if (!tipoId) {
            return res.status(400).json({
                success: false,
                message: 'Debe especificar el tipo de solicitud (id_tipo_solicitud o tipo_nombre)'
            });
        }

        const codigoLimpio = codigo_asociado.replace(/\D/g, '').slice(0, 9);

        let usuarioResult = await db.query(
            'SELECT id_usuario FROM usuarios WHERE codigo_asociado = $1',
            [codigoLimpio]
        );

        let idUsuario;
        if (usuarioResult.rows.length === 0) {
            const newUser = await db.query(
                'INSERT INTO usuarios (codigo_asociado) VALUES ($1) RETURNING id_usuario',
                [codigoLimpio]
            );
            idUsuario = newUser.rows[0].id_usuario;
        } else {
            idUsuario = usuarioResult.rows[0].id_usuario;
        }

        const operadorId = id_operador_log || (req.body.id_operador) || null;

        // REGLA: toda solicitud nueva se crea en estado 'En proceso'
        const estadoResult = await db.query(
            "SELECT id FROM estados WHERE nombre = 'En proceso' ORDER BY id ASC LIMIT 1"
        );
        const estadoFinal = estadoResult.rows[0]?.id || id_estado || 1;

        const result = await db.query(
            `INSERT INTO solicitudes (id_usuario, id_operador, id_tipo_solicitud, id_estado, descripcion)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [idUsuario, operadorId, tipoId, estadoFinal, descripcion || null]
        );

        await logCreate({
            tabla: 'solicitudes',
            operadorId: operadorId,
            registroId: result.rows[0].id_solicitud,
            descripcion: `Solicitud creada - Socio: ${codigoLimpio} - Tipo: ${id_tipo_solicitud}`,
            datosNuevos: result.rows[0],
            req
        });

        res.status(201).json({ success: true, data: result.rows[0], message: 'Solicitud creada exitosamente' });
    } catch (err) {
        console.error("Error creando solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// PUT /api/solicitudes/:id - Update
router.put('/solicitudes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { codigo_asociado, id_tipo_solicitud, id_estado, descripcion, id_operador_log } = req.body;

        const oldResult = await db.query('SELECT * FROM solicitudes WHERE id_solicitud = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        if (!datosAnteriores) {
            return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
        }

        // REGLA: una solicitud cerrada es de solo lectura
        const estadoActualResult = await db.query(
            `SELECT e.nombre FROM solicitudes s JOIN estados e ON s.id_estado = e.id WHERE s.id_solicitud = $1`,
            [id]
        );
        const estadoActualNombre = estadoActualResult.rows[0]?.nombre || '';
        if (/^cerrado/i.test(estadoActualNombre)) {
            return res.status(403).json({
                success: false,
                message: `La solicitud está ${estadoActualNombre} y ya no puede editarse. Solo puede consultarse.`
            });
        }

        // El estado solo puede cambiarse entre los permitidos manualmente
        if (id_estado) {
            const permitido = await db.query(
                `SELECT id FROM estados WHERE id = $1 AND nombre IN ('En proceso', 'Procedente', 'No procedente')`,
                [id_estado]
            );
            if (permitido.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Estado no válido. Solo se permite En proceso, Procedente o No procedente.'
                });
            }
        }

        let idUsuario = datosAnteriores.id_usuario;
        if (codigo_asociado) {
            const codigoLimpio = codigo_asociado.replace(/\D/g, '').slice(0, 9);
            let userResult = await db.query(
                'SELECT id_usuario FROM usuarios WHERE codigo_asociado = $1',
                [codigoLimpio]
            );
            if (userResult.rows.length === 0) {
                const newUser = await db.query(
                    'INSERT INTO usuarios (codigo_asociado) VALUES ($1) RETURNING id_usuario',
                    [codigoLimpio]
                );
                idUsuario = newUser.rows[0].id_usuario;
            } else {
                idUsuario = userResult.rows[0].id_usuario;
            }
        }

        const tipoFinal = id_tipo_solicitud || datosAnteriores.id_tipo_solicitud;
        const estadoFinal = id_estado || datosAnteriores.id_estado;
        const descFinal = descripcion !== undefined ? descripcion : datosAnteriores.descripcion;

        const result = await db.query(
            `UPDATE solicitudes
             SET id_usuario = $1, id_tipo_solicitud = $2, id_estado = $3, descripcion = $4, updated_at = NOW()
             WHERE id_solicitud = $5 RETURNING *`,
            [idUsuario, tipoFinal, estadoFinal, descFinal, id]
        );

        await logUpdate({
            tabla: 'solicitudes',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Solicitud #${id} actualizada`,
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

// DELETE /api/solicitudes/:id (BORRADO LÓGICO — el registro se conserva)
router.delete('/solicitudes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id_operador_log } = req.body || {};

        const oldResult = await db.query('SELECT * FROM solicitudes WHERE id_solicitud = $1 AND deleted_at IS NULL', [id]);
        const datosAnteriores = oldResult.rows[0];

        if (!datosAnteriores) {
            return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
        }

        // REGLA: solo un administrador puede eliminar solicitudes
        if (id_operador_log) {
            const opResult = await db.query(
                'SELECT role FROM operadores WHERE id_operador = $1 AND deleted_at IS NULL',
                [id_operador_log]
            );
            const rol = opResult.rows[0]?.role;
            if (rol !== 'administrador' && rol !== 'admin') {
                return res.status(403).json({ success: false, message: 'Solo un administrador puede eliminar solicitudes' });
            }
        } else {
            return res.status(403).json({ success: false, message: 'Solo un administrador puede eliminar solicitudes' });
        }

        await db.query(
            `UPDATE solicitudes
             SET deleted_at = NOW(), deleted_by = $2
             WHERE id_solicitud = $1 AND deleted_at IS NULL`,
            [id, id_operador_log || null]
        );

        await logDelete({
            tabla: 'solicitudes',
            operadorId: id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Solicitud #${id} eliminada (borrado lógico) - Socio: ${datosAnteriores.id_usuario}`,
            datosAnteriores,
            req
        });

        res.json({ success: true, message: 'Solicitud eliminada exitosamente' });
    } catch (err) {
        console.error("Error eliminando solicitud:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;