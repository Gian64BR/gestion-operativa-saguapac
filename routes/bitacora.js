/**
 * bitacora.js
 * Rutas de solo consulta para la BITÁCORA DEL SISTEMA (auditoria_sistema)
 * y para la PAPELERA (registros con borrado lógico).
 *
 * - GET  /api/audit-system        → bitácora completa con filtros
 * - GET  /api/bitacora/papelera   → registros "eliminados" (deleted_at NOT NULL)
 * - POST /api/bitacora/restaurar  → restaurar un registro de la papelera
 */

const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { logSistema, logView } = require('../db/log-sistema');

// Mapa de tablas con borrado lógico: nombre de tabla -> columna PK y etiqueta legible
const TABLAS_PAPELERA = {
    operadores: { pk: 'id_operador', etiqueta: 'Operador del sistema' },
    directorio: { pk: 'id', etiqueta: 'Contacto / Directorio' },
    eventos: { pk: 'id', etiqueta: 'Evento / Corte' },
    solicitudes: { pk: 'id_solicitud', etiqueta: 'Solicitud' }
};

// Resumen legible por tabla
function resumirRegistro(tabla, fila) {
    switch (tabla) {
        case 'operadores':
            return `${fila.nombre_completo || ''} (${fila.usuario || ''})`;
        case 'directorio':
            return `${fila.nombre || ''} - ${fila.cargo || ''}`;
        case 'eventos':
            return `${fila.titulo || ''} (${fila.fecha ? String(fila.fecha).substring(0, 10) : ''})`;
        case 'solicitudes':
            return `Solicitud #${fila.id_solicitud} - ${(fila.descripcion || '').substring(0, 80)}`;
        default:
            return `Registro ${fila[Object.keys(fila)[0]]}`;
    }
}

// ==================== BITÁCORA DEL SISTEMA ====================

router.get('/audit-system', async (req, res) => {
    try {
        const { accion, tabla, desde, hasta, search } = req.query;

        // Paginación: 50 registros por página por defecto
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
        const offset = (page - 1) * limit;

        const where = [];
        const params = [];
        let i = 1;

        if (accion) {
            where.push(`a.accion = $${i++}`);
            params.push(accion);
        }
        if (tabla) {
            where.push(`a.tabla_origen = $${i++}`);
            params.push(tabla);
        }
        if (desde) {
            where.push(`a.fecha_exac >= $${i++}`);
            params.push(desde);
        }
        if (hasta) {
            where.push(`a.fecha_exac <= $${i++}`);
            params.push(hasta);
        }
        if (search) {
            where.push(`(a.descripcion ILIKE $${i} OR a.tabla_origen ILIKE $${i} OR a.accion ILIKE $${i} OR o.nombre_completo ILIKE $${i} OR o.usuario ILIKE $${i})`);
            params.push(`%${search}%`);
            i++;
        }

        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

        // Total de registros que cumplen el filtro (para la paginación)
        const countResult = await db.query(`
            SELECT COUNT(*) FROM auditoria_sistema a
            LEFT JOIN operadores o ON a.id_operador = o.id_operador
            ${whereClause}
        `, params);
        const total = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(total / limit) || 1;

        const result = await db.query(`
            SELECT
                a.id_auditoria,
                a.tabla_origen,
                a.accion,
                a.id_operador,
                COALESCE(o.nombre_completo, o.usuario, 'Sistema') AS operador_nombre,
                a.id_registro,
                a.datos_nuevos,
                a.datos_anteriores,
                a.descripcion,
                a.ip_cliente,
                a.user_agent,
                a.fecha_exac
            FROM auditoria_sistema a
            LEFT JOIN operadores o ON a.id_operador = o.id_operador
            ${whereClause}
            ORDER BY a.fecha_exac DESC
            LIMIT $${i} OFFSET $${i + 1}
        `, [...params, limit, offset]);

        // Catálogos para los filtros del frontend
        const acciones = await db.query('SELECT DISTINCT accion FROM auditoria_sistema ORDER BY accion');
        const tablas = await db.query('SELECT DISTINCT tabla_origen FROM auditoria_sistema ORDER BY tabla_origen');

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages
            },
            catalogos: {
                acciones: acciones.rows.map(r => r.accion),
                tablas: tablas.rows.map(r => r.tabla_origen)
            }
        });
    } catch (err) {
        console.error('Error obteniendo bitácora del sistema:', err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// ==================== REGISTRAR INGRESO A UN MÓDULO ====================

// El frontend lo llama en cada carga de página para dejar rastro en la bitácora
router.post('/audit-view', async (req, res) => {
    try {
        const { id_operador, modulo, ruta } = req.body || {};
        await logView({
            operadorId: id_operador || null,
            modulo,
            ruta,
            req
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Error registrando ingreso a módulo:', err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// ==================== PAPELERA (BORRADOS LÓGICOS) ====================

router.get('/bitacora/papelera', async (req, res) => {
    try {
        // Mapa de operadores (incluye eliminados) para resolver "quién eliminó"
        const opsResult = await db.query('SELECT id_operador, nombre_completo, usuario FROM operadores');
        const operadoresMap = {};
        opsResult.rows.forEach(o => { operadoresMap[o.id_operador] = o.nombre_completo || o.usuario; });

        const papelera = [];

        for (const [tabla, meta] of Object.entries(TABLAS_PAPELERA)) {
            const result = await db.query(
                `SELECT * FROM ${tabla} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`
            );
            result.rows.forEach(fila => {
                papelera.push({
                    tabla,
                    tabla_label: meta.etiqueta,
                    id: fila[meta.pk],
                    resumen: resumirRegistro(tabla, fila),
                    deleted_at: fila.deleted_at,
                    deleted_by: fila.deleted_by || null,
                    deleted_by_nombre: fila.deleted_by ? (operadoresMap[fila.deleted_by] || `Operador #${fila.deleted_by}`) : null,
                    datos: fila
                });
            });
        }

        // Orden global por fecha de eliminación (más reciente primero)
        papelera.sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));

        res.json({ success: true, data: papelera });
    } catch (err) {
        console.error('Error obteniendo papelera:', err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

// ==================== RESTAURAR REGISTRO ====================

router.post('/bitacora/restaurar', async (req, res) => {
    try {
        const { tabla, id, id_operador_log } = req.body || {};

        if (!tabla || !TABLAS_PAPELERA[tabla]) {
            return res.status(400).json({ success: false, message: 'Tabla no válida para restaurar' });
        }

        const parsedId = parseInt(id);
        if (!parsedId) {
            return res.status(400).json({ success: false, message: 'ID de registro no válido' });
        }

        const { pk } = TABLAS_PAPELERA[tabla];

        const result = await db.query(
            `UPDATE ${tabla}
             SET deleted_at = NULL, deleted_by = NULL
             WHERE ${pk} = $1 AND deleted_at IS NOT NULL
             RETURNING *`,
            [parsedId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Registro no encontrado en la papelera' });
        }

        await logSistema({
            tabla,
            accion: 'RESTORE',
            operadorId: id_operador_log || null,
            registroId: parsedId,
            descripcion: `Registro restaurado desde la papelera: ${resumirRegistro(tabla, result.rows[0])}`,
            datosNuevos: result.rows[0],
            req
        });

        res.json({ success: true, data: result.rows[0], message: 'Registro restaurado exitosamente' });
    } catch (err) {
        console.error('Error restaurando registro:', err.message);
        res.status(500).json({ success: false, message: 'Error BD: ' + err.message });
    }
});

module.exports = router;
