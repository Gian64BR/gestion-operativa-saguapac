/**
 * init-db.js
 * Inicializa la base de datos creando tablas y columnas faltantes automáticamente
 * 
 * NOTA: Las columnas 'role', 'area', 'nota', 'avatar', 'internal_id' ahora están
 * definidas en database.sql. Este archivo mantiene compatibilidad con BD existentes.
 */

const db = require('./connection');

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
    await ensureOperadoresColumns();
    await ensureZonasTable();
    await ensureEventosTable();
    await ensureForeignKeyEventos();
    await ensureAuditoriaTable();
    await ensureAuditoriaSistemaTable();
    await ensureDirectorioColumns();
    console.log('✅ Base de datos inicializada correctamente');
}

module.exports = { initDatabase };
