-- MIGRACIÓN 002: Agregar relaciones de auditoría a la tabla directorio
-- Propósito: Rastrear qué operador creó y modificó cada contacto del directorio
-- Fecha: 2026-04-12

-- 1. Agregar columna: quién creó el contacto
ALTER TABLE directorio
ADD COLUMN IF NOT EXISTS id_operador_creacion INT REFERENCES operadores(id_operador) ON DELETE SET NULL;

-- 2. Agregar columna: quién modificó el contacto por última vez
ALTER TABLE directorio
ADD COLUMN IF NOT EXISTS id_operador_actualizacion INT REFERENCES operadores(id_operador) ON DELETE SET NULL;

-- 3. Índices para mejorar consultas de auditoría
CREATE INDEX IF NOT EXISTS idx_directorio_operador_creacion ON directorio(id_operador_creacion);
CREATE INDEX IF NOT EXISTS idx_directorio_operador_actualizacion ON directorio(id_operador_actualizacion);

-- 4. Actualizar contactos existentes con NULL (se pueden asignar manualmente si se sabe quién los creó)
-- Los contactos existentes no tienen información de quién los creó, así que quedan como NULL
-- Esto es intencional: preserva la integridad de datos sin asumir información inexistente

COMMENT ON COLUMN directorio.id_operador_creacion IS 'Operador que creó este contacto del directorio';
COMMENT ON COLUMN directorio.id_operador_actualizacion IS 'Último operador que modificó este contacto';
