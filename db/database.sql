-- BASE DE DATOS: bd_proyecto
-- SCRIPTS DE CREACIÓN PARA LAS 14 TABLAS DEL SISTEMA CALL CENTER

-- 1. operadores
CREATE TABLE IF NOT EXISTS operadores (
    id_operador     SERIAL PRIMARY KEY,
    nombre_completo VARCHAR(150) NOT NULL,
    usuario         VARCHAR(50)  NOT NULL UNIQUE,
    contrasena      VARCHAR(255) NOT NULL,  -- Almacenada con Bcrypt
    codigo_interno  VARCHAR(30)  NOT NULL UNIQUE,
    role            VARCHAR(20)  NOT NULL DEFAULT 'operador',  -- administrador u operador
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 2. usuarios (socios) - SOLO código de asociado
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario      SERIAL PRIMARY KEY,
    codigo_asociado VARCHAR(30) NOT NULL UNIQUE
);

-- 3. tipos_solicitud
CREATE TABLE IF NOT EXISTS tipos_solicitud (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

-- 4. estados
CREATE TABLE IF NOT EXISTS estados (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL
);

-- 5. solicitudes
CREATE TABLE IF NOT EXISTS solicitudes (
    id_solicitud      SERIAL PRIMARY KEY,
    id_usuario        INT       NOT NULL REFERENCES usuarios(id_usuario),
    id_operador       INT       NOT NULL REFERENCES operadores(id_operador),
    id_tipo_solicitud INT       NOT NULL REFERENCES tipos_solicitud(id),
    id_estado         INT       NOT NULL REFERENCES estados(id),
    descripcion       TEXT,
    fecha_registro    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. controles
CREATE TABLE IF NOT EXISTS controles (
    id_control     SERIAL PRIMARY KEY,
    id_solicitud   INT         NOT NULL REFERENCES solicitudes(id_solicitud),
    fecha_inicio   TIMESTAMP   NOT NULL DEFAULT NOW(),
    fecha_fin      TIMESTAMP,
    estado_control VARCHAR(50)
);

-- 7. lecturas
CREATE TABLE IF NOT EXISTS lecturas (
    id_lectura   SERIAL PRIMARY KEY,
    id_control   INT          NOT NULL REFERENCES controles(id_control),
    tipo_lectura VARCHAR(20)  NOT NULL CHECK (tipo_lectura IN ('inspector', 'usuario')),
    lectura      NUMERIC(10,2) NOT NULL,
    fecha        TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 8. calculos
CREATE TABLE IF NOT EXISTS calculos (
    id_calculo        SERIAL PRIMARY KEY,
    id_control        INT          NOT NULL REFERENCES controles(id_control),
    consumo_original  NUMERIC(10,2) NOT NULL,
    consumo_estimado  NUMERIC(10,2) NOT NULL,
    consumo_corregido NUMERIC(10,2) NOT NULL,
    diferencia        NUMERIC(10,2) NOT NULL,
    es_procedente     BOOLEAN      NOT NULL,
    estado            VARCHAR(50)  NOT NULL DEFAULT 'En espera' 
                    CHECK (estado IN ('Prueba de modificacion', 'Verificacion de Modificacion', 'En espera'))
);

-- 9. historial
CREATE TABLE IF NOT EXISTS historial (
    id           SERIAL PRIMARY KEY,
    id_operador  INT       NOT NULL REFERENCES operadores(id_operador),
    id_solicitud INT       REFERENCES solicitudes(id_solicitud),
    accion       TEXT      NOT NULL,
    fecha        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 10. seguimientos
CREATE TABLE IF NOT EXISTS seguimientos (
    id           SERIAL PRIMARY KEY,
    id_solicitud INT       NOT NULL REFERENCES solicitudes(id_solicitud),
    fecha        TIMESTAMP NOT NULL DEFAULT NOW(),
    observacion  TEXT      NOT NULL
);

-- 11. directorio
CREATE TABLE IF NOT EXISTS directorio (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    cargo       VARCHAR(100) NOT NULL,
    area        VARCHAR(100) NOT NULL DEFAULT '',
    gerencia    VARCHAR(100) NOT NULL DEFAULT '',
    telefono    VARCHAR(30)  NOT NULL DEFAULT '',
    internal_id VARCHAR(30)  NOT NULL DEFAULT '',
    nota        TEXT,
    avatar      TEXT
);

-- 12. zonas (para los eventos/cortes programados)
CREATE TABLE IF NOT EXISTS zonas (
    id       SERIAL PRIMARY KEY,
    nombre   VARCHAR(100) NOT NULL UNIQUE
);

-- 13. eventos (eventos/cortes programados con más detalle)
CREATE TABLE IF NOT EXISTS eventos (
    id           SERIAL PRIMARY KEY,
    titulo       VARCHAR(200) NOT NULL,
    detalle      TEXT,
    fecha        DATE         NOT NULL,
    hora_inicio  TIME,
    hora_fin     TIME,
    zona_id      INT          REFERENCES zonas(id) ON DELETE SET NULL,
    uv_afectada  VARCHAR(100),
    estado       VARCHAR(50)  NOT NULL DEFAULT 'programado', -- programado, en_proceso, completado, cancelado
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 14. auditoria_eventos (para notificaciones globales e historial visible)
CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id           SERIAL PRIMARY KEY,
    tipo         VARCHAR(50)  NOT NULL, -- evento, alerta, sistema
    id_operador  INT          REFERENCES operadores(id_operador) ON DELETE SET NULL,
    operador     VARCHAR(100),            -- Mantenido por compatibilidad con datos existentes
    id_evento    INT          REFERENCES eventos(id) ON DELETE SET NULL,
    resultado    TEXT         NOT NULL,
    detalle      TEXT,
    fecha_exac   TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 15. auditoria_sistema (BITÁCORA GLOBAL INTERNA — no visible en frontend)
-- Registra TODAS las acciones del sistema: login, logout, CRUD, cambios de contraseña, etc.
CREATE TABLE IF NOT EXISTS auditoria_sistema (
    id_auditoria      SERIAL PRIMARY KEY,
    tabla_origen      VARCHAR(50)  NOT NULL,  -- 'operadores', 'usuarios', 'directorio', 'eventos', 'solicitudes', 'controles', 'lecturas', 'calculos', 'seguimientos', 'zonas', 'tipos_solicitud', 'estados', 'auth'
    accion            VARCHAR(20)  NOT NULL,  -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW', 'PASSWORD_CHANGE'
    id_operador       INT          NOT NULL REFERENCES operadores(id_operador) ON DELETE SET NULL,
    id_registro       INT,                     -- ID del registro afectado (usuario, evento, contacto, etc.)
    datos_nuevos      JSONB,                   -- Datos después del cambio (nuevo estado)
    datos_anteriores  JSONB,                   -- Datos antes del cambio (estado anterior)
    descripcion       TEXT         NOT NULL,   -- Resumen legible para humanos
    ip_cliente        VARCHAR(45),             -- Dirección IP del cliente
    user_agent        TEXT,                    -- Navegador/agente del cliente
    fecha_exac        TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Índice para consultas frecuentes en la bitácora
CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_fecha ON auditoria_sistema(fecha_exac DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_tabla ON auditoria_sistema(tabla_origen);
CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_operador ON auditoria_sistema(id_operador);
CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_accion ON auditoria_sistema(accion);

-- INSERCIÓN DE DATOS CATÁLOGO POR DEFECTO
INSERT INTO tipos_solicitud (nombre) VALUES
('En Base (8.01)'),
('Arreglo de fuga (8.01)'),
('Promedio Elevado (8.02)'),
('Cambio de medidor (8.03)'),
('Mala lectura (8.04)'),
('Cambio de categoría (8.06)'),
('Purga de instalación (8.07)')
ON CONFLICT DO NOTHING;

INSERT INTO estados (nombre) VALUES
('Pendiente'),
('En proceso'),
('Procedente'),
('No procedente'),
('Cerrado')
ON CONFLICT DO NOTHING;

-- Zonas por defecto
INSERT INTO zonas (nombre) VALUES
('Zona Norte'),
('Zona Sur'),
('Zona Este'),
('Zona Oeste'),
('Zona Centro')
ON CONFLICT DO NOTHING;
