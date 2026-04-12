-- =============================================================================
-- SCRIPT: Migración 001 - Normalización de relaciones y bitácora global
-- =============================================================================
-- Este script:
-- 1. Agrega FK id_operador e id_evento a auditoria_eventos
-- 2. Crea la tabla auditoria_sistema (bitácora global interna)
-- 3. Pobla datos existentes donde sea posible
--
-- EJECUCIÓN:
-- psql -U postgres -d bd_proyecto -f db/migration-001-normalizacion.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- PASO 1: Agregar FK id_operador a auditoria_eventos
-- =============================================================================

-- 1a. Agregar columna id_operador si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'auditoria_eventos' AND column_name = 'id_operador'
    ) THEN
        ALTER TABLE auditoria_eventos ADD COLUMN id_operador INT;
        RAISE NOTICE '✓ Columna id_operador agregada a auditoria_eventos';
    ELSE
        RAISE NOTICE 'ℹ️  Columna id_operador ya existe en auditoria_eventos';
    END IF;
END $$;

-- 1b. Poblar id_operador desde operadores.usuario = auditoria_eventos.operador
UPDATE auditoria_eventos ae
SET id_operador = o.id_operador
FROM operadores o
WHERE ae.operador = o.usuario
AND ae.id_operador IS NULL;

DO $$
DECLARE
    updated_count INT;
BEGIN
    SELECT COUNT(*) INTO updated_count FROM auditoria_eventos WHERE id_operador IS NOT NULL;
    RAISE NOTICE '✓ id_operador poblado en % registros de auditoria_eventos', updated_count;
END $$;

-- 1c. Crear la FK
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_auditoria_eventos_operador'
    ) THEN
        ALTER TABLE auditoria_eventos
        ADD CONSTRAINT fk_auditoria_eventos_operador
        FOREIGN KEY (id_operador) REFERENCES operadores(id_operador) ON DELETE SET NULL;
        RAISE NOTICE '✓ FK fk_auditoria_eventos_operador creada';
    ELSE
        RAISE NOTICE 'ℹ️  FK fk_auditoria_eventos_operador ya existe';
    END IF;
END $$;

-- =============================================================================
-- PASO 2: Agregar FK id_evento a auditoria_eventos
-- =============================================================================

-- 2a. Agregar columna id_evento si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'auditoria_eventos' AND column_name = 'id_evento'
    ) THEN
        ALTER TABLE auditoria_eventos ADD COLUMN id_evento INT;
        RAISE NOTICE '✓ Columna id_evento agregada a auditoria_eventos';
    ELSE
        RAISE NOTICE 'ℹ️  Columna id_evento ya existe en auditoria_eventos';
    END IF;
END $$;

-- 2b. Intentar poblar id_evento desde el detalle (buscando "Evento ID: X")
-- Este es un intento best-effort; muchos registros quedarán sin vínculo
UPDATE auditoria_eventos ae
SET id_evento = CAST(REGEXP_REPLACE(ae.detalle, '.*Evento ID: (\d+).*', '\1') AS INT)
WHERE ae.detalle ~ 'Evento ID: \d+'
AND ae.id_evento IS NULL;

DO $$
DECLARE
    event_linked INT;
BEGIN
    SELECT COUNT(*) INTO event_linked FROM auditoria_eventos WHERE id_evento IS NOT NULL;
    RAISE NOTICE '✓ id_evento poblado en % registros (best-effort)', event_linked;
END $$;

-- 2c. Crear la FK
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_auditoria_eventos_evento'
    ) THEN
        ALTER TABLE auditoria_eventos
        ADD CONSTRAINT fk_auditoria_eventos_evento
        FOREIGN KEY (id_evento) REFERENCES eventos(id) ON DELETE SET NULL;
        RAISE NOTICE '✓ FK fk_auditoria_eventos_evento creada';
    ELSE
        RAISE NOTICE 'ℹ️  FK fk_auditoria_eventos_evento ya existe';
    END IF;
END $$;

-- =============================================================================
-- PASO 3: Crear tabla auditoria_sistema (bitácora global interna)
-- =============================================================================

CREATE TABLE IF NOT EXISTS auditoria_sistema (
    id_auditoria      SERIAL PRIMARY KEY,
    tabla_origen      VARCHAR(50)  NOT NULL,
    accion            VARCHAR(20)  NOT NULL,
    id_operador       INT          NOT NULL REFERENCES operadores(id_operador) ON DELETE SET NULL,
    id_registro       INT,
    datos_nuevos      JSONB,
    datos_anteriores  JSONB,
    descripcion       TEXT         NOT NULL,
    ip_cliente        VARCHAR(45),
    user_agent        TEXT,
    fecha_exac        TIMESTAMP    NOT NULL DEFAULT NOW()
);

RAISE NOTICE '✓ Tabla auditoria_sistema creada';

-- Crear índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_fecha ON auditoria_sistema(fecha_exac DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_tabla ON auditoria_sistema(tabla_origen);
CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_operador ON auditoria_sistema(id_operador);
CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_accion ON auditoria_sistema(accion);

RAISE NOTICE '✓ Índices de auditoria_sistema creados';

-- =============================================================================
-- RESUMEN
-- =============================================================================

DO $$
DECLARE
    total_auditoria INT;
    total_sistema INT;
    fk_op_count INT;
    fk_ev_count INT;
BEGIN
    SELECT COUNT(*) INTO total_auditoria FROM auditoria_eventos;
    SELECT COUNT(*) INTO total_sistema FROM auditoria_sistema;
    SELECT COUNT(*) INTO fk_op_count FROM auditoria_eventos WHERE id_operador IS NOT NULL;
    SELECT COUNT(*) INTO fk_ev_count FROM auditoria_eventos WHERE id_evento IS NOT NULL;

    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE '  RESUMEN DE MIGRACIÓN 001';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Registros en auditoria_eventos: %', total_auditoria;
    RAISE NOTICE '  - Con id_operador vinculado: %', fk_op_count;
    RAISE NOTICE '  - Con id_evento vinculado: %', fk_ev_count;
    RAISE NOTICE 'Registros en auditoria_sistema: % (nueva tabla vacía)', total_sistema;
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migración completada exitosamente';
    RAISE NOTICE '============================================';
END $$;

COMMIT;
