const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { logCreate, logUpdate, logDelete } = require('../db/log-sistema');

// ==================== ZONAS ====================

// Obtener todas las zonas
router.get('/zonas', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM zonas
            ORDER BY nombre ASC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo zonas:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// ==================== EVENTOS / CORTES PROGRAMADOS ====================

// Obtener todos los eventos
router.get('/events', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                e.id,
                e.titulo,
                e.detalle,
                e.fecha,
                e.hora_inicio,
                e.hora_fin,
                e.estado,
                e.uv_afectada,
                e.zona_id,
                z.nombre as zona_nombre,
                e.created_at,
                e.updated_at
            FROM eventos e
            LEFT JOIN zonas z ON e.zona_id = z.id
            ORDER BY e.fecha DESC, e.hora_inicio ASC
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Error obteniendo eventos:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Obtener evento por ID
router.get('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT 
                e.id,
                e.titulo,
                e.detalle,
                e.fecha,
                e.hora_inicio,
                e.hora_fin,
                e.estado,
                e.uv_afectada,
                e.zona_id,
                z.nombre as zona_nombre
            FROM eventos e
            LEFT JOIN zonas z ON e.zona_id = z.id
            WHERE e.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Evento no encontrado' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Error obteniendo evento:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear nuevo evento
router.post('/events', async (req, res) => {
    try {
        const { titulo, detalle, fecha, hora_inicio, hora_fin, zona_id, uv_afectada, estado } = req.body;

        console.log('📝 Creando evento:', { titulo, fecha, hora_inicio, hora_fin, estado });

        if (!titulo || !fecha) {
            return res.status(400).json({
                success: false,
                message: 'Los campos titulo y fecha son obligatorios'
            });
        }

        const result = await db.query(
            `INSERT INTO eventos (titulo, detalle, fecha, hora_inicio, hora_fin, zona_id, uv_afectada, estado)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [titulo, detalle || null, fecha, hora_inicio || null, hora_fin || null, zona_id || null, uv_afectada || null, estado || 'programado']
        );

        const nuevoEvento = result.rows[0];
        console.log('✅ Evento creado con ID:', nuevoEvento.id);

        // Registrar en bitácora del sistema
        await logCreate({
            tabla: 'eventos',
            operadorId: req.body.id_operador_log || null,
            registroId: nuevoEvento.id,
            descripcion: `Evento creado: ${titulo} - Zona: ${zona_id || 'N/A'} - Fecha: ${fecha}`,
            datosNuevos: nuevoEvento,
            req
        });

        // Registrar automáticamente en auditoría
        try {
            const operador = req.body.operador || 'Operador';
            const idEvento = nuevoEvento.id;

            // Resolver nombre de zona
            let zonaNombre = 'Sin zona';
            if (zona_id) {
                const zonaResult = await db.query('SELECT nombre FROM zonas WHERE id = $1', [zona_id]);
                if (zonaResult.rows.length > 0) zonaNombre = zonaResult.rows[0].nombre;
            }

            const uvInfo = uv_afectada ? `UV: ${uv_afectada}` : 'UV: N/A';
            const horarioInfo = (hora_inicio && hora_fin) ? `Horario: ${hora_inicio} - ${hora_fin}` : '';

            await db.query(
                `INSERT INTO auditoria_eventos (tipo, id_operador, operador, id_evento, resultado, detalle, fecha_exac)
                 VALUES ($1,
                         (SELECT id_operador FROM operadores WHERE nombre_completo = $2 LIMIT 1),
                         $2, $5, $3, $4, NOW())`,
                ['evento', operador, `Corte programado: ${titulo}`,
                    `Zona: ${zonaNombre}. ${uvInfo}. Fecha del corte: ${fecha}. ${detalle || ''}. ${horarioInfo}`,
                    idEvento]
            );
            console.log('✅ Evento registrado en auditoría');
        } catch (auditErr) {
            console.error('⚠️ Error al registrar en auditoría:', auditErr.message);
            // No fallar la operación principal si falla la auditoría
        }

        res.status(201).json({ success: true, data: nuevoEvento, message: 'Evento creado exitosamente' });
    } catch (err) {
        console.error("Error creando evento:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Actualizar evento
router.put('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, detalle, fecha, hora_inicio, hora_fin, zona_id, uv_afectada, estado } = req.body;

        // Obtener datos anteriores
        const oldResult = await db.query('SELECT * FROM eventos WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query(
            `UPDATE eventos
             SET titulo = $1, detalle = $2, fecha = $3, hora_inicio = $4, hora_fin = $5,
                 zona_id = $6, uv_afectada = $7, estado = $8, updated_at = NOW()
             WHERE id = $9 RETURNING *`,
            [titulo, detalle, fecha, hora_inicio, hora_fin, zona_id, uv_afectada, estado, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Evento no encontrado' });
        }

        const eventoActualizado = result.rows[0];

        // Registrar en bitácora del sistema
        await logUpdate({
            tabla: 'eventos',
            operadorId: req.body.id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Evento actualizado: ${titulo} - Estado: ${estado || 'N/A'}`,
            datosNuevos: eventoActualizado,
            datosAnteriores,
            req
        });

        // Registrar automáticamente en auditoría la modificación
        try {
            const operador = req.body.operador || 'Operador';
            const idEvento = eventoActualizado.id;

            // Resolver nombre de zona
            let zonaNombre = 'Sin zona';
            if (zona_id) {
                const zonaResult = await db.query('SELECT nombre FROM zonas WHERE id = $1', [zona_id]);
                if (zonaResult.rows.length > 0) zonaNombre = zonaResult.rows[0].nombre;
            }

            const uvInfo = uv_afectada ? `UV: ${uv_afectada}` : 'UV: N/A';
            const horarioInfo = (hora_inicio && hora_fin) ? `Horario: ${hora_inicio} - ${hora_fin}` : '';
            const estadoInfo = estado ? `Estado: ${estado}` : '';

            await db.query(
                `INSERT INTO auditoria_eventos (tipo, id_operador, operador, id_evento, resultado, detalle, fecha_exac)
                 VALUES ($1,
                         (SELECT id_operador FROM operadores WHERE nombre_completo = $2 LIMIT 1),
                         $2, $5, $3, $4, NOW())`,
                ['evento', operador, `Evento modificado: ${titulo}`,
                    `Zona: ${zonaNombre}. ${uvInfo}. Fecha del corte: ${fecha}. ${detalle || ''}. ${horarioInfo}. ${estadoInfo}`,
                    idEvento]
            );
            console.log('✅ Modificación de evento registrada en auditoría');
        } catch (auditErr) {
            console.error('⚠️ Error al registrar modificación en auditoría:', auditErr.message);
            // No fallar la operación principal si falla la auditoría
        }

        res.json({ success: true, data: eventoActualizado, message: 'Evento actualizado exitosamente' });
    } catch (err) {
        console.error("Error actualizando evento:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Eliminar evento
router.delete('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Obtener datos antes de eliminar
        const oldResult = await db.query('SELECT * FROM eventos WHERE id = $1', [id]);
        const datosAnteriores = oldResult.rows[0];

        const result = await db.query('DELETE FROM eventos WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Evento no encontrado' });
        }

        const eventoEliminado = result.rows[0];

        // Registrar en bitácora del sistema
        await logDelete({
            tabla: 'eventos',
            operadorId: req.body.id_operador_log || null,
            registroId: parseInt(id),
            descripcion: `Evento eliminado: ${eventoEliminado.titulo}`,
            datosAnteriores,
            req
        });

        // Registrar automáticamente en auditoría la eliminación
        try {
            const operador = req.body.operador || 'Operador';

            // Resolver nombre de zona
            let zonaNombre = 'Sin zona';
            if (eventoEliminado.zona_id) {
                const zonaResult = await db.query('SELECT nombre FROM zonas WHERE id = $1', [eventoEliminado.zona_id]);
                if (zonaResult.rows.length > 0) zonaNombre = zonaResult.rows[0].nombre;
            }

            await db.query(
                `INSERT INTO auditoria_eventos (tipo, id_operador, operador, resultado, detalle, fecha_exac)
                 VALUES ($1,
                         (SELECT id_operador FROM operadores WHERE nombre_completo = $2 LIMIT 1),
                         $2, $3, $4, NOW())`,
                ['evento', operador, `Evento eliminado: ${eventoEliminado.titulo}`,
                    `Zona: ${zonaNombre}. UV: ${eventoEliminado.uv_afectada || 'N/A'}. Fecha del corte: ${eventoEliminado.fecha}. Eliminado por: ${operador}`]
            );
            console.log('✅ Eliminación de evento registrada en auditoría');
        } catch (auditErr) {
            console.error('⚠️ Error al registrar eliminación en auditoría:', auditErr.message);
            // No fallar la operación principal si falla la auditoría
        }

        res.json({ success: true, message: 'Evento eliminado exitosamente' });
    } catch (err) {
        console.error("Error eliminando evento:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// ==================== HISTORIAL DE AUDITORIA ====================

// Obtener historial de auditoría
router.get('/audit-history', async (req, res) => {
    try {
        console.log('📋 API: Solicitando historial de auditoría...');
        const result = await db.query(`
            SELECT * FROM auditoria_eventos
            ORDER BY fecha_exac DESC
        `);
        console.log(`✅ API: Retornando ${result.rows.length} registros de auditoría`);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("❌ Error obteniendo historial de auditoría:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// Crear registro de auditoría
router.post('/audit-history', async (req, res) => {
    try {
        const { id, tipo, type, operador, resultado, detalle, fecha_exac, id_evento } = req.body;

        // Aceptar tanto 'tipo' como 'type' para compatibilidad
        const tipoFinal = tipo || type || 'evento';

        // Si se proporciona un ID existente, hacer UPDATE (UPSERT para recálculos)
        // El ID puede ser un timestamp del frontend (Date.now()) o un ID real de BD
        // Los timestamps son mucho mayores que el rango SERIAL de PostgreSQL (2,147,483,647)
        if (id) {
            const parsedId = parseInt(id);
            const isValidDbId = !isNaN(parsedId) && parsedId > 0 && parsedId <= 2147483647;

            if (isValidDbId) {
                const existing = await db.query('SELECT id FROM auditoria_eventos WHERE id = $1', [parsedId]);

                if (existing.rows.length > 0) {
                    // Actualizar registro existente
                    const result = await db.query(
                        `UPDATE auditoria_eventos
                         SET tipo = $1,
                             id_operador = CASE WHEN $2::TEXT IS NOT NULL THEN (SELECT id_operador FROM operadores WHERE nombre_completo = $2 LIMIT 1) ELSE NULL END,
                             operador = $2,
                             resultado = $3,
                             detalle = $4,
                             fecha_exac = $5
                         WHERE id = $6 RETURNING *`,
                        [tipoFinal, operador || null, resultado, detalle, fecha_exac || new Date(), parsedId]
                    );
                    return res.json({ success: true, data: result.rows[0], message: 'Registro de auditoría actualizado' });
                }
                // Si no existe, caer al INSERT normal
            }
            // Si el ID es un timestamp (fuera de rango) o no es válido, hacer INSERT
        }

        // INSERT: crear nuevo registro
        const result = await db.query(
            `INSERT INTO auditoria_eventos (tipo, id_operador, operador, resultado, detalle, fecha_exac)
             VALUES ($1,
                     CASE WHEN $2::TEXT IS NOT NULL THEN (SELECT id_operador FROM operadores WHERE nombre_completo = $2 LIMIT 1) ELSE NULL END,
                     $2, $3, $4, $5) RETURNING *`,
            [tipoFinal, operador || null, resultado, detalle, fecha_exac || new Date()]
        );
        res.status(201).json({ success: true, data: result.rows[0], message: 'Registro de auditoría creado' });
    } catch (err) {
        console.error("Error creando registro de auditoría:", err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
