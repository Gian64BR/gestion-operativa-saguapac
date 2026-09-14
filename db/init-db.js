/**
 * init-db.js
 * Inicializa la base de datos creando tablas y columnas faltantes automáticamente
 * 
 * NOTA: Las columnas 'role', 'area', 'nota', 'avatar', 'internal_id' ahora están
 * definidas en database.sql. Este archivo mantiene compatibilidad con BD existentes.
 */

const db = require('./connection');
const fs = require('fs');
const path = require('path');

async function ensureOperadoresColumns() {
    try {
        const createdCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'operadores' AND column_name = 'created_at'
        `);
        if (createdCheck.rows.length === 0) {
            await db.query('ALTER TABLE operadores ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT NOW()');
            console.log('✓ Columna created_at agregada a operadores');
        }

        const updatedCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'operadores' AND column_name = 'updated_at'
        `);
        if (updatedCheck.rows.length === 0) {
            await db.query('ALTER TABLE operadores ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW()');
            console.log('✓ Columna updated_at agregada a operadores');
        }

        // Agregar columna 'role' si no existe (ahora en database.sql, mantener para compatibilidad)
        const roleCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'operadores' AND column_name = 'role'
        `);
        if (roleCheck.rows.length === 0) {
            await db.query("ALTER TABLE operadores ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'operador'");
            console.log('✓ Columna role agregada a operadores');
        }
    } catch (err) {
        console.error('✗ Error verificando columnas de operadores:', err.message);
    }
}

async function ensureZonasTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS zonas (
                id       SERIAL PRIMARY KEY,
                nombre   VARCHAR(100) NOT NULL UNIQUE
            )
        `);
        console.log('✓ Tabla zonas verificada');

        // Insertar zonas por defecto
        await db.query(`
            INSERT INTO zonas (nombre) VALUES
            ('Zona Norte'), ('Zona Sur'), ('Zona Este'), ('Zona Oeste'), ('Zona Centro')
            ON CONFLICT (nombre) DO NOTHING
        `);
        console.log('✓ Zonas por defecto insertadas');
    } catch (err) {
        console.error('✗ Error creando tabla zonas:', err.message);
    }
}

async function ensureEventosTable() {
    try {
        // Primero verificar si existe
        const checkResult = await db.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'eventos'
            );
        `);

        const exists = checkResult.rows[0].exists;

        if (!exists) {
            await db.query(`
                CREATE TABLE eventos (
                    id           SERIAL PRIMARY KEY,
                    titulo       VARCHAR(200) NOT NULL,
                    detalle      TEXT,
                    fecha        DATE         NOT NULL,
                    hora_inicio  TIME,
                    hora_fin     TIME,
                    zona_id      INT,
                    uv_afectada  VARCHAR(100),
                    estado       VARCHAR(50)  NOT NULL DEFAULT 'programado',
                    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
                    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
                )
            `);
            console.log('✓ Tabla eventos creada');
        } else {
            console.log('✓ Tabla eventos ya existe');
        }
    } catch (err) {
        console.error('✗ Error creando tabla eventos:', err.message);
    }
}

async function ensureAuditoriaTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS auditoria_eventos (
                id           SERIAL PRIMARY KEY,
                tipo         VARCHAR(50)  NOT NULL,
                id_operador  INT          REFERENCES operadores(id_operador) ON DELETE SET NULL,
                operador     VARCHAR(100),
                id_evento    INT          REFERENCES eventos(id) ON DELETE SET NULL,
                resultado    TEXT         NOT NULL,
                detalle      TEXT,
                fecha_exac   TIMESTAMP    NOT NULL DEFAULT NOW()
            )
        `);
        console.log('✓ Tabla auditoria_eventos verificada');

        // Agregar columna id_operador si no existe (para BD existentes sin la columna)
        const idOpCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'auditoria_eventos' AND column_name = 'id_operador'
        `);
        if (idOpCheck.rows.length === 0) {
            await db.query('ALTER TABLE auditoria_eventos ADD COLUMN id_operador INT');
            // Poblar con datos existentes
            await db.query(`
                UPDATE auditoria_eventos ae
                SET id_operador = o.id_operador
                FROM operadores o
                WHERE ae.operador = o.usuario AND ae.id_operador IS NULL
            `);
            try {
                await db.query(`
                    ALTER TABLE auditoria_eventos
                    ADD CONSTRAINT fk_auditoria_eventos_operador
                    FOREIGN KEY (id_operador) REFERENCES operadores(id_operador) ON DELETE SET NULL
                `);
            } catch (fkErr) {
                console.log('⚠ FK id_operador en auditoria_eventos: ', fkErr.message);
            }
            console.log('✓ FK id_operador en auditoria_eventos agregada');
        }

        // Agregar columna id_evento si no existe
        const idEvCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'auditoria_eventos' AND column_name = 'id_evento'
        `);
        if (idEvCheck.rows.length === 0) {
            await db.query('ALTER TABLE auditoria_eventos ADD COLUMN id_evento INT');
            try {
                await db.query(`
                    ALTER TABLE auditoria_eventos
                    ADD CONSTRAINT fk_auditoria_eventos_evento
                    FOREIGN KEY (id_evento) REFERENCES eventos(id) ON DELETE SET NULL
                `);
            } catch (fkErr) {
                console.log('⚠ FK id_evento en auditoria_eventos: ', fkErr.message);
            }
            console.log('✓ FK id_evento en auditoria_eventos agregada');
        }
    } catch (err) {
        console.error('✗ Error creando tabla auditoria_eventos:', err.message);
    }
}

async function ensureAuditoriaSistemaTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS auditoria_sistema (
                id_auditoria      SERIAL PRIMARY KEY,
                tabla_origen      VARCHAR(50)  NOT NULL,
                accion            VARCHAR(20)  NOT NULL,
                id_operador       INT          REFERENCES operadores(id_operador) ON DELETE SET NULL,
                id_registro       INT,
                datos_nuevos      JSONB,
                datos_anteriores  JSONB,
                descripcion       TEXT         NOT NULL,
                ip_cliente        VARCHAR(45),
                user_agent        TEXT,
                fecha_exac        TIMESTAMP    NOT NULL DEFAULT NOW()
            )
        `);
        console.log('✓ Tabla auditoria_sistema verificada');

        // Crear índices para rendimiento
        await db.query('CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_fecha ON auditoria_sistema(fecha_exac DESC)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_tabla ON auditoria_sistema(tabla_origen)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_operador ON auditoria_sistema(id_operador)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_accion ON auditoria_sistema(accion)');
        console.log('✓ Índices de auditoria_sistema verificados');
    } catch (err) {
        console.error('✗ Error creando tabla auditoria_sistema:', err.message);
    }
}

async function ensureDirectorioColumns() {
    try {
        // Agregar columna 'area' si no existe (ahora en database.sql, mantener para compatibilidad)
        const areaCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'directorio' AND column_name = 'area'
        `);
        if (areaCheck.rows.length === 0) {
            await db.query('ALTER TABLE directorio ADD COLUMN area VARCHAR(100) NOT NULL DEFAULT \'\'');
            console.log('✓ Columna area agregada a directorio');
        }

        // Agregar columna 'nota' si no existe (ahora en database.sql, mantener para compatibilidad)
        const notaCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'directorio' AND column_name = 'nota'
        `);
        if (notaCheck.rows.length === 0) {
            await db.query('ALTER TABLE directorio ADD COLUMN nota TEXT');
            console.log('✓ Columna nota agregada a directorio');
        }

        // Agregar columna 'avatar' si no existe (ahora en database.sql, mantener para compatibilidad)
        const avatarCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'directorio' AND column_name = 'avatar'
        `);
        if (avatarCheck.rows.length === 0) {
            await db.query('ALTER TABLE directorio ADD COLUMN avatar TEXT');
            console.log('✓ Columna avatar agregada a directorio');
        }

        // Agregar columna 'internal_id' si no existe (ahora en database.sql, mantener para compatibilidad)
        const internalIdCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'directorio' AND column_name = 'internal_id'
        `);
        if (internalIdCheck.rows.length === 0) {
            await db.query('ALTER TABLE directorio ADD COLUMN internal_id VARCHAR(30) NOT NULL DEFAULT \'\'');
            console.log('✓ Columna internal_id agregada a directorio');
        }

        // Agregar columna 'id_operador_creacion' si no existe
        const opCreacionCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'directorio' AND column_name = 'id_operador_creacion'
        `);
        if (opCreacionCheck.rows.length === 0) {
            await db.query('ALTER TABLE directorio ADD COLUMN id_operador_creacion INT REFERENCES operadores(id_operador) ON DELETE SET NULL');
            await db.query('CREATE INDEX IF NOT EXISTS idx_directorio_operador_creacion ON directorio(id_operador_creacion)');
            console.log('✓ Columna id_operador_creacion agregada a directorio');
        }

        // Agregar columna 'id_operador_actualizacion' si no existe
        const opActualCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'directorio' AND column_name = 'id_operador_actualizacion'
        `);
        if (opActualCheck.rows.length === 0) {
            await db.query('ALTER TABLE directorio ADD COLUMN id_operador_actualizacion INT REFERENCES operadores(id_operador) ON DELETE SET NULL');
            await db.query('CREATE INDEX IF NOT EXISTS idx_directorio_operador_actualizacion ON directorio(id_operador_actualizacion)');
            console.log('✓ Columna id_operador_actualizacion agregada a directorio');
        }
    } catch (err) {
        console.error('✗ Error verificando columnas de directorio:', err.message);
    }
}

/**
 * Asegura las columnas de BORRADO LÓGICO (deleted_at / deleted_by) en las tablas
 * que el sistema "elimina". Nada se borra físicamente: se marca deleted_at.
 */
async function ensureSoftDeleteColumns() {
    const tablas = [
        { nombre: 'operadores', pk: 'id_operador' },
        { nombre: 'directorio', pk: 'id' },
        { nombre: 'eventos', pk: 'id' },
        { nombre: 'solicitudes', pk: 'id_solicitud' }
    ];

    for (const tabla of tablas) {
        try {
            const check = await db.query(`
                SELECT column_name FROM information_schema.columns
                WHERE table_name = $1 AND column_name = 'deleted_at'
            `, [tabla.nombre]);

            if (check.rows.length === 0) {
                await db.query(`ALTER TABLE ${tabla.nombre} ADD COLUMN deleted_at TIMESTAMP`);
                await db.query(`ALTER TABLE ${tabla.nombre} ADD COLUMN deleted_by INT`);
                console.log(`✓ Columnas de borrado lógico agregadas a ${tabla.nombre}`);
            }

            // Garantizar el índice siempre (aunque las columnas ya existieran)
            await db.query(`CREATE INDEX IF NOT EXISTS idx_${tabla.nombre}_deleted_at ON ${tabla.nombre}(deleted_at)`);
        } catch (err) {
            console.error(`✗ Error agregando borrado lógico a ${tabla.nombre}:`, err.message);
        }
    }
}

/**
 * Agrega updated_at a solicitudes (necesario para las reglas de estado 24h/48h).
 */
async function ensureSolicitudesColumns() {
    try {
        const check = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'solicitudes' AND column_name = 'updated_at'
        `);
        if (check.rows.length === 0) {
            await db.query('ALTER TABLE solicitudes ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW()');
            // Backfill: las solicitudes existentes no han sido modificadas
            await db.query('UPDATE solicitudes SET updated_at = fecha_registro');
            console.log('✓ Columna updated_at agregada a solicitudes');
        }
    } catch (err) {
        console.error('✗ Error agregando updated_at a solicitudes:', err.message);
    }
}

/**
 * Catálogos (tipos_solicitud y estados):
 *  - Deduplica registros repetidos (el seed anterior no tenía restricción única).
 *  - Remapea las solicitudes a la fila canónica antes de borrar duplicados.
 *  - Agrega restricciones UNIQUE para que el seed sea idempotente.
 *  - Siembra los catálogos canónicos (incluye los estados de cierre).
 */
async function ensureCatalogos() {
    // 1. Deduplicar tipos_solicitud
    try {
        await db.query(`
            UPDATE solicitudes s
            SET id_tipo_solicitud = k.id_keep
            FROM tipos_solicitud t
            JOIN (SELECT nombre, MIN(id) AS id_keep FROM tipos_solicitud GROUP BY nombre) k
              ON k.nombre = t.nombre
            WHERE s.id_tipo_solicitud = t.id AND t.id <> k.id_keep
        `);
        await db.query(`
            DELETE FROM tipos_solicitud t
            USING (SELECT nombre, MIN(id) AS id_keep FROM tipos_solicitud GROUP BY nombre) k
            WHERE t.nombre = k.nombre AND t.id <> k.id_keep
        `);
        console.log('✓ tipos_solicitud deduplicado');
    } catch (err) {
        console.error('✗ Error deduplicando tipos_solicitud:', err.message);
    }

    // 2. Deduplicar estados
    try {
        await db.query(`
            UPDATE solicitudes s
            SET id_estado = k.id_keep
            FROM estados e
            JOIN (SELECT nombre, MIN(id) AS id_keep FROM estados GROUP BY nombre) k
              ON k.nombre = e.nombre
            WHERE s.id_estado = e.id AND e.id <> k.id_keep
        `);
        await db.query(`
            DELETE FROM estados e
            USING (SELECT nombre, MIN(id) AS id_keep FROM estados GROUP BY nombre) k
            WHERE e.nombre = k.nombre AND e.id <> k.id_keep
        `);
        console.log('✓ estados deduplicado');
    } catch (err) {
        console.error('✗ Error deduplicando estados:', err.message);
    }

    // 3. Normalizar nombres con codificación dañada (mojibake) en tipos_solicitud
    try {
        await db.query(`
            UPDATE solicitudes s
            SET id_tipo_solicitud = c.id
            FROM tipos_solicitud b
            JOIN tipos_solicitud c
              ON c.nombre = replace(replace(b.nombre, 'Ã­', 'í'), 'Ã³', 'ó')
            WHERE s.id_tipo_solicitud = b.id AND b.nombre <> c.nombre
        `);
        await db.query(`
            DELETE FROM tipos_solicitud b
            USING tipos_solicitud c
            WHERE b.nombre <> c.nombre
              AND c.nombre = replace(replace(b.nombre, 'Ã­', 'í'), 'Ã³', 'ó')
        `);
        await db.query(`
            UPDATE tipos_solicitud
            SET nombre = replace(replace(nombre, 'Ã­', 'í'), 'Ã³', 'ó')
            WHERE nombre LIKE '%Ã%'
        `);
        console.log('✓ tipos_solicitud normalizado (mojibake)');
    } catch (err) {
        console.error('✗ Error normalizando tipos_solicitud:', err.message);
    }

    // 4. Restricciones UNIQUE (idempotentes)
    try {
        await db.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estados_nombre_key') THEN
                    ALTER TABLE estados ADD CONSTRAINT estados_nombre_key UNIQUE (nombre);
                END IF;
            END $$;
        `);
        await db.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipos_solicitud_nombre_key') THEN
                    ALTER TABLE tipos_solicitud ADD CONSTRAINT tipos_solicitud_nombre_key UNIQUE (nombre);
                END IF;
            END $$;
        `);
        console.log('✓ Restricciones UNIQUE de catálogos verificadas');
    } catch (err) {
        console.error('✗ Error creando restricciones de catálogos:', err.message);
    }

    // 5. Sembrar catálogos canónicos (idempotente)
    try {
        await db.query(`
            INSERT INTO tipos_solicitud (nombre) VALUES
            ('En Base (8.01)'),
            ('Arreglo de fuga (8.01)'),
            ('Promedio Elevado (8.02)'),
            ('Cambio de medidor (8.03)'),
            ('Mala lectura (8.04)'),
            ('Cambio de categoría (8.06)'),
            ('Purga de instalación (8.07)')
            ON CONFLICT (nombre) DO NOTHING
        `);
        await db.query(`
            INSERT INTO estados (nombre) VALUES
            ('Pendiente'),
            ('En proceso'),
            ('Procedente'),
            ('No procedente'),
            ('Cerrado'),
            ('Cerrado - Procedente'),
            ('Cerrado - No procedente')
            ON CONFLICT (nombre) DO NOTHING
        `);
        console.log('✓ Catálogos (tipos_solicitud y estados) sembrados');
    } catch (err) {
        console.error('✗ Error sembrando catálogos:', err.message);
    }
}

async function ensureForeignKeyEventos() {
    try {
        // Agregar foreign key a zona_id si no existe
        await db.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.constraint_column_usage 
                    WHERE table_name = 'eventos' AND constraint_name = 'eventos_zona_id_fkey'
                ) THEN
                    ALTER TABLE eventos 
                    ADD CONSTRAINT eventos_zona_id_fkey 
                    FOREIGN KEY (zona_id) REFERENCES zonas(id);
                END IF;
            END $$;
        `);
        console.log('✓ Foreign key eventos->zonas verificada');
    } catch (err) {
        // Ignorar error si la tabla zonas no existe aún
        console.log('⚠ Foreign key eventos->zonas: ', err.message);
    }
}

async function initDatabase() {
    console.log('🔄 Inicializando base de datos...');
    try {
        const sqlPath = path.join(__dirname, 'database.sql');
        if (fs.existsSync(sqlPath)) {
            console.log('📖 Leyendo archivo database.sql para estructura inicial...');
            const sql = fs.readFileSync(sqlPath, 'utf8');
            await db.query(sql);
            console.log('✓ Estructura de database.sql aplicada con éxito');
        }
    } catch (err) {
        console.error('✗ Error al aplicar database.sql:', err.message);
    }
    
    await ensureOperadoresColumns();
    await ensureZonasTable();
    await ensureEventosTable();
    await ensureForeignKeyEventos();
    await ensureAuditoriaTable();
    await ensureAuditoriaSistemaTable();
    await ensureDirectorioColumns();
    await ensureSoftDeleteColumns();
    await ensureSolicitudesColumns();
    await ensureCatalogos();
    console.log('✅ Base de datos inicializada correctamente');
}

module.exports = { initDatabase };
