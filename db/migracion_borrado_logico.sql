-- ============================================================
-- MIGRACIÓN: BORRADO LÓGICO + updated_at + CATÁLOGOS
-- Proyecto: Sistema de Gestión Call Center - SAGUAPAC
-- ============================================================
-- Aplica los cambios de estructura que el código nuevo requiere.
-- Es IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
--
-- ¿Cuándo usarlo?
--   En Supabase (o cualquier BD ya existente) porque en Vercel
--   el init-db.js NO se ejecuta automáticamente.
--
-- Ejecutar en: Supabase → SQL Editor → Run
-- ============================================================

-- 1. Borrado lógico (deleted_at / deleted_by)
ALTER TABLE operadores  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE operadores  ADD COLUMN IF NOT EXISTS deleted_by INT;
ALTER TABLE directorio  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE directorio  ADD COLUMN IF NOT EXISTS deleted_by INT;
ALTER TABLE eventos     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE eventos     ADD COLUMN IF NOT EXISTS deleted_by INT;
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS deleted_by INT;

-- 2. updated_at en solicitudes (reglas de estado 24h/48h)
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
UPDATE solicitudes SET updated_at = fecha_registro WHERE updated_at IS NULL;

-- 3. Índices para la papelera
CREATE INDEX IF NOT EXISTS idx_operadores_deleted_at  ON operadores(deleted_at);
CREATE INDEX IF NOT EXISTS idx_directorio_deleted_at  ON directorio(deleted_at);
CREATE INDEX IF NOT EXISTS idx_eventos_deleted_at     ON eventos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_solicitudes_deleted_at ON solicitudes(deleted_at);

-- 4. Deduplicar tipos_solicitud (remapea solicitudes y borra repetidos)
UPDATE solicitudes s
SET id_tipo_solicitud = k.id_keep
FROM tipos_solicitud t
JOIN (SELECT nombre, MIN(id) AS id_keep FROM tipos_solicitud GROUP BY nombre) k
  ON k.nombre = t.nombre
WHERE s.id_tipo_solicitud = t.id AND t.id <> k.id_keep;

DELETE FROM tipos_solicitud t
USING (SELECT nombre, MIN(id) AS id_keep FROM tipos_solicitud GROUP BY nombre) k
WHERE t.nombre = k.nombre AND t.id <> k.id_keep;

-- 5. Deduplicar estados
UPDATE solicitudes s
SET id_estado = k.id_keep
FROM estados e
JOIN (SELECT nombre, MIN(id) AS id_keep FROM estados GROUP BY nombre) k
  ON k.nombre = e.nombre
WHERE s.id_estado = e.id AND e.id <> k.id_keep;

DELETE FROM estados e
USING (SELECT nombre, MIN(id) AS id_keep FROM estados GROUP BY nombre) k
WHERE e.nombre = k.nombre AND e.id <> k.id_keep;

-- 5b. Normalizar nombres con codificación dañada (mojibake) en tipos_solicitud
UPDATE solicitudes s
SET id_tipo_solicitud = c.id
FROM tipos_solicitud b
JOIN tipos_solicitud c
  ON c.nombre = replace(replace(b.nombre, 'Ã­', 'í'), 'Ã³', 'ó')
WHERE s.id_tipo_solicitud = b.id AND b.nombre <> c.nombre;

DELETE FROM tipos_solicitud b
USING tipos_solicitud c
WHERE b.nombre <> c.nombre
  AND c.nombre = replace(replace(b.nombre, 'Ã­', 'í'), 'Ã³', 'ó');

UPDATE tipos_solicitud
SET nombre = replace(replace(nombre, 'Ã­', 'í'), 'Ã³', 'ó')
WHERE nombre LIKE '%Ã%';

-- 6. Restricciones UNIQUE (para que el sembrado sea idempotente)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estados_nombre_key') THEN
    ALTER TABLE estados ADD CONSTRAINT estados_nombre_key UNIQUE (nombre);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipos_solicitud_nombre_key') THEN
    ALTER TABLE tipos_solicitud ADD CONSTRAINT tipos_solicitud_nombre_key UNIQUE (nombre);
  END IF;
END $$;

-- 7. Sembrar catálogos canónicos
INSERT INTO tipos_solicitud (nombre) VALUES
('En Base (8.01)'),
('Arreglo de fuga (8.01)'),
('Promedio Elevado (8.02)'),
('Cambio de medidor (8.03)'),
('Mala lectura (8.04)'),
('Cambio de categoría (8.06)'),
('Purga de instalación (8.07)')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO estados (nombre) VALUES
('Pendiente'),
('En proceso'),
('Procedente'),
('No procedente'),
('Cerrado'),
('Cerrado - Procedente'),
('Cerrado - No procedente')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================
