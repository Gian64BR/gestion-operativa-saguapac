/**
 * log-sistema.js
 * Módulo centralizado para registrar TODAS las acciones del sistema en la bitácora interna.
 *
 * La tabla auditoria_sistema NO se muestra en el frontend.
 * Solo es accesible mediante consulta directa a la base de datos.
 *
 * USO:
 *   const { logSistema } = require('./db/log-sistema');
 *
 *   await logSistema({
 *       tabla: 'usuarios',
 *       accion: 'CREATE',
 *       operadorId: 1,
 *       registroId: 42,
 *       descripcion: 'Usuario creado: codigo_asociado=123456789',
 *       datosNuevos: { codigo_asociado: '123456789' },
 *       req: req  // para extraer ip y user-agent (opcional)
 *   });
 */

const db = require('./connection');

/**
 * Registra una acción en la bitácora del sistema.
 *
 * @param {Object} params
 * @param {string} params.tabla - Nombre de la tabla afectada
 * @param {string} params.accion - Tipo de acción: CREATE, UPDATE, DELETE, LOGIN, LOGOUT, PASSWORD_CHANGE, VIEW
 * @param {number} params.operadorId - ID del operador que realizó la acción
 * @param {number} [params.registroId] - ID del registro afectado (opcional para LOGIN/LOGOUT)
 * @param {string} params.descripcion - Resumen legible de la acción
 * @param {Object} [params.datosNuevos] - Datos después del cambio (JSON)
 * @param {Object} [params.datosAnteriores] - Datos antes del cambio (JSON)
 * @param {Object} [params.req] - Objeto request de Express (para extraer IP y user-agent)
 * @returns {Promise<void>}
 */
async function logSistema({
    tabla,
    accion,
    operadorId,
    registroId = null,
    descripcion,
    datosNuevos = null,
    datosAnteriores = null,
    req = null
}) {
    try {
        const ipCliente = req ? (req.ip || req.connection?.remoteAddress || null) : null;
        const userAgent = req ? (req.headers['user-agent'] || null) : null;

        await db.query(
            `INSERT INTO auditoria_sistema (
                tabla_origen, accion, id_operador, id_registro,
                datos_nuevos, datos_anteriores, descripcion,
                ip_cliente, user_agent, fecha_exac
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [
                tabla,
                accion,
                operadorId || null,
                registroId,
                datosNuevos ? JSON.stringify(datosNuevos) : null,
                datosAnteriores ? JSON.stringify(datosAnteriores) : null,
                descripcion,
                ipCliente,
                userAgent
            ]
        );
    } catch (err) {
        // NUNCA fallar la operación principal si falla la bitácora
        console.error('⚠️ Error al registrar en bitácora del sistema:', err.message);
    }
}

/**
 * Helper para registrar un CREATE.
 */
async function logCreate({ tabla, operadorId, registroId, descripcion, datosNuevos, req }) {
    await logSistema({
        tabla,
        accion: 'CREATE',
        operadorId,
        registroId,
        descripcion,
        datosNuevos,
        req
    });
}

/**
 * Helper para registrar un UPDATE.
 */
async function logUpdate({ tabla, operadorId, registroId, descripcion, datosNuevos, datosAnteriores, req }) {
    await logSistema({
        tabla,
        accion: 'UPDATE',
        operadorId,
        registroId,
        descripcion,
        datosNuevos,
        datosAnteriores,
        req
    });
}

/**
 * Helper para registrar un DELETE.
 */
async function logDelete({ tabla, operadorId, registroId, descripcion, datosAnteriores, req }) {
    await logSistema({
        tabla,
        accion: 'DELETE',
        operadorId,
        registroId,
        descripcion,
        datosAnteriores,
        req
    });
}

/**
 * Helper para registrar un LOGIN.
 */
async function logLogin({ operadorId, descripcion, req }) {
    await logSistema({
        tabla: 'auth',
        accion: 'LOGIN',
        operadorId,
        descripcion,
        req
    });
}

/**
 * Helper para registrar un LOGOUT.
 */
async function logLogout({ operadorId, descripcion, req }) {
    await logSistema({
        tabla: 'auth',
        accion: 'LOGOUT',
        operadorId,
        descripcion,
        req
    });
}

/**
 * Helper para registrar un cambio de contraseña.
 */
async function logPasswordChange({ operadorId, registroId, descripcion, req }) {
    await logSistema({
        tabla: 'auth',
        accion: 'PASSWORD_CHANGE',
        operadorId,
        registroId,
        descripcion,
        req
    });
}

module.exports = {
    logSistema,
    logCreate,
    logUpdate,
    logDelete,
    logLogin,
    logLogout,
    logPasswordChange
};
