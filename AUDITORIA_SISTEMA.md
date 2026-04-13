# 📋 Sistema de Auditoría - Documentación Completa

## 🎯 Overview

El sistema de auditoría registra **TODAS** las acciones críticas realizadas en el sistema, proporcionando trazabilidad completa y capacidad de auditoría para múltiples administradores.

## 🗄️ Estructura de la Base de Datos

### Tabla: `auditoria_sistema` (Bitácora Global Interna)

Esta tabla **NO** es visible en el frontend. Solo accesible mediante consulta directa a la base de datos.

```sql
CREATE TABLE auditoria_sistema (
    id_auditoria      SERIAL PRIMARY KEY,
    tabla_origen      VARCHAR(50)  NOT NULL,  -- Tabla afectada
    accion            VARCHAR(20)  NOT NULL,  -- Tipo de acción
    id_operador       INT          NOT NULL REFERENCES operadores(id_operador) ON DELETE SET NULL,
    id_registro       INT,                     -- ID del registro afectado
    datos_nuevos      JSONB,                   -- Estado después del cambio
    datos_anteriores  JSONB,                   -- Estado antes del cambio
    descripcion       TEXT         NOT NULL,   -- Resumen legible
    ip_cliente        VARCHAR(45),             -- IP del cliente
    user_agent        TEXT,                    -- Navegador/agente
    fecha_exac        TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

#### Índices de Rendimiento:
- `idx_auditoria_sistema_fecha` - Búsqueda por fecha (DESC)
- `idx_auditoria_sistema_tabla` - Búsqueda por tabla
- `idx_auditoria_sistema_operador` - Búsqueda por operador
- `idx_auditoria_sistema_accion` - Búsqueda por tipo de acción

### Tabla: `auditoria_eventos` (Auditoría Pública)

Esta tabla **SÍ** es visible en el frontend para eventos/cortes programados.

```sql
CREATE TABLE auditoria_eventos (
    id           SERIAL PRIMARY KEY,
    tipo         VARCHAR(50)  NOT NULL,
    id_operador  INT          REFERENCES operadores(id_operador) ON DELETE SET NULL,
    operador     VARCHAR(100),
    id_evento    INT          REFERENCES eventos(id) ON DELETE SET NULL,
    resultado    TEXT         NOT NULL,
    detalle      TEXT,
    fecha_exac   TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

## 📝 Módulo de Logging: `db/log-sistema.js`

### Funciones Disponibles

#### 1. `logSistema(params)` - Función Base
Función genérica para registrar cualquier acción.

```javascript
await logSistema({
    tabla: 'usuarios',           // Tabla afectada
    accion: 'CREATE',            // Tipo de acción
    operadorId: 1,               // ID del operador
    registroId: 42,              // ID del registro (opcional)
    descripcion: 'Usuario creado',
    datosNuevos: { ... },        // Estado nuevo (opcional)
    datosAnteriores: { ... },    // Estado anterior (opcional)
    req: req                     // Request object (para IP y user-agent)
});
```

#### 2. `logCreate(params)` - Registrar Creación
```javascript
await logCreate({
    tabla: 'directorio',
    operadorId: 1,
    registroId: 5,
    descripcion: 'Contacto creado: Juan Pérez',
    datosNuevos: { nombre: 'Juan Pérez', cargo: 'Gerente' },
    req
});
```

#### 3. `logUpdate(params)` - Registrar Actualización
```javascript
await logUpdate({
    tabla: 'usuarios',
    operadorId: 1,
    registroId: 10,
    descripcion: 'Usuario actualizado',
    datosNuevos: { codigo_asociado: '987654' },
    datosAnteriores: { codigo_asociado: '123456' },
    req
});
```

#### 4. `logDelete(params)` - Registrar Eliminación
```javascript
await logDelete({
    tabla: 'eventos',
    operadorId: 1,
    registroId: 3,
    descripcion: 'Evento eliminado: Corte programado Zona Norte',
    datosAnteriores: { titulo: 'Corte programado Zona Norte' },
    req
});
```

#### 5. `logLogin(params)` - Registrar Inicio de Sesión
```javascript
await logLogin({
    operadorId: 1,
    descripcion: 'Inicio de sesión: admin',
    req
});
```

#### 6. `logLogout(params)` - Registrar Cierre de Sesión
```javascript
await logLogout({
    operadorId: 1,
    descripcion: 'Cierre de sesión: admin',
    req
});
```

#### 7. `logPasswordChange(params)` - Registrar Cambio de Contraseña
```javascript
await logPasswordChange({
    operadorId: 1,
    registroId: 5,
    descripcion: 'Contraseña actualizada para usuario: Juan Pérez',
    req
});
```

## ✅ Implementación Actual por Módulo

### 1. ✅ **Autenticación** (`routes/auth.js`)
- ✅ Login de usuario
- ✅ Logout de usuario
- ✅ Registro de operadores

**Ejemplo:**
```javascript
// Login
await logLogin({
    operadorId: operador.id_operador,
    descripcion: `Inicio de sesión: ${operador.usuario}`,
    req
});
```

---

### 2. ✅ **Usuarios del Sistema** (`routes/users-contacts.js`)
- ✅ Creación de operador
- ✅ Actualización de operador
- ✅ Eliminación de operador
- ✅ Cambio de contraseña

**Ejemplo:**
```javascript
// Crear operador
await logCreate({
    tabla: 'operadores',
    operadorId: result.rows[0].id_operador,
    registroId: result.rows[0].id_operador,
    descripcion: `Usuario del sistema creado: ${full_name} (${username}) con rol ${userRole}`,
    datosNuevos: { full_name, username, role: userRole, codigo_interno: codigo },
    req
});
```

---

### 3. ✅ **Directorio de Contactos** (`routes/users-contacts.js`)
- ✅ Creación de contacto
- ✅ Actualización de contacto
- ✅ Eliminación de contacto

**Ejemplo:**
```javascript
// Crear contacto
await logCreate({
    tabla: 'directorio',
    operadorId: req.body.id_operador_log || null,
    registroId: result.rows[0].id,
    descripcion: `Contacto creado: ${nombre} (${cargo})`,
    datosNuevos: result.rows[0],
    req
});
```

---

### 4. ✅ **Usuarios/Socios** (`routes/usuarios.js`)
- ✅ Creación de socio
- ✅ Actualización de socio
- ✅ Eliminación de socio

**Ejemplo:**
```javascript
// Crear socio
await logCreate({
    tabla: 'usuarios',
    operadorId: id_operador || null,
    registroId: result.rows[0].id_usuario,
    descripcion: `Usuario creado: codigo_asociado=${codigo_asociado}`,
    datosNuevos: result.rows[0],
    req
});
```

---

### 5. ✅ **Eventos/Cortes Programados** (`routes/eventos-zonas.js`)
- ✅ Creación de evento (también registra en `auditoria_eventos`)
- ✅ Actualización de evento (también registra en `auditoria_eventos`)
- ✅ Eliminación de evento (también registra en `auditoria_eventos`)

**Ejemplo:**
```javascript
// Crear evento
await logCreate({
    tabla: 'eventos',
    operadorId: req.body.id_operador_log || null,
    registroId: nuevoEvento.id,
    descripcion: `Evento creado: ${titulo} - Zona: ${zona_id || 'N/A'} - Fecha: ${fecha}`,
    datosNuevos: nuevoEvento,
    req
});

// También registra en auditoría pública
await db.query(
    `INSERT INTO auditoria_eventos (tipo, id_operador, operador, id_evento, resultado, detalle, fecha_exac)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    ['evento', operador, `Corte programado: ${titulo}`, idEvento, ...]
);
```

---

### 6. ✅ **Solicitudes** (`routes/solicitudes.js`)
- ✅ Creación de solicitud
- ✅ Actualización de solicitud
- ✅ Eliminación de solicitud

---

### 7. ✅ **Controles** (`routes/controles-lecturas.js`)
- ✅ Creación de control
- ✅ Actualización de control
- ✅ Eliminación de control

---

### 8. ✅ **Lecturas** (`routes/controles-lecturas.js`)
- ✅ Creación de lectura
- ✅ Actualización de lectura
- ✅ Eliminación de lectura

---

### 9. ✅ **Cálculos** (`routes/calculos.js`)
- ✅ Creación de cálculo
- ✅ Actualización de cálculo
- ✅ Actualización de estado de cálculo
- ✅ Eliminación de cálculo

---

### 10. ✅ **Historial** (`routes/historial-seguimientos.js`)
- ✅ Creación de registro en historial
- ✅ Eliminación de registro en historial

---

### 11. ✅ **Seguimientos** (`routes/historial-seguimientos.js`)
- ✅ Creación de seguimiento
- ✅ Actualización de seguimiento
- ✅ Eliminación de seguimiento

---

### 12. ✅ **Tipos de Solicitud** (`routes/tipos-estados.js`) - ¡NUEVO!
- ✅ Creación de tipo de solicitud
- ✅ Actualización de tipo de solicitud
- ✅ Eliminación de tipo de solicitud

---

### 13. ✅ **Estados** (`routes/tipos-estados.js`) - ¡NUEVO!
- ✅ Creación de estado
- ✅ Actualización de estado
- ✅ Eliminación de estado

---

## 🔍 Consultas de Auditoría

### Ver todos los registros de auditoría del sistema
```sql
SELECT 
    a.id_auditoria,
    o.usuario as operador,
    a.tabla_origen,
    a.accion,
    a.descripcion,
    a.fecha_exac
FROM auditoria_sistema a
LEFT JOIN operadores o ON a.id_operador = o.id_operador
ORDER BY a.fecha_exac DESC;
```

### Ver acciones de un operador específico
```sql
SELECT * FROM auditoria_sistema
WHERE id_operador = 1
ORDER BY fecha_exac DESC;
```

### Ver todas las eliminaciones
```sql
SELECT * FROM auditoria_sistema
WHERE accion = 'DELETE'
ORDER BY fecha_exac DESC;
```

### Ver cambios en una tabla específica
```sql
SELECT * FROM auditoria_sistema
WHERE tabla_origen = 'directorio'
ORDER BY fecha_exac DESC;
```

### Ver cambios en un registro específico
```sql
SELECT 
    a.*,
    o.usuario as operador
FROM auditoria_sistema a
LEFT JOIN operadores o ON a.id_operador = o.id_operador
WHERE tabla_origen = 'usuarios' AND id_registro = 42
ORDER BY a.fecha_exac DESC;
```

### Ver auditoría pública de eventos
```sql
SELECT * FROM auditoria_eventos
ORDER BY fecha_exac DESC;
```

## 📊 Tipos de Acciones Registradas

| Acción | Descripción | Ejemplo |
|--------|-------------|---------|
| `CREATE` | Creación de registro | Nuevo usuario, contacto, evento |
| `UPDATE` | Actualización de registro | Modificar datos de usuario |
| `DELETE` | Eliminación de registro | Eliminar contacto, evento |
| `LOGIN` | Inicio de sesión | Usuario ingresa al sistema |
| `LOGOUT` | Cierre de sesión | Usuario cierra sesión |
| `PASSWORD_CHANGE` | Cambio de contraseña | Usuario actualiza contraseña |

## 🛡️ Características de Seguridad

1. **Nunca falla la operación principal**: Si el logging falla, la operación principal continúa
2. **Captura de IP y User-Agent**: Automáticamente extraídos del request
3. **Datos antes/después**: Permite ver exactamente qué cambió
4. **Relación formal con operador**: Usa `id_operador` (no texto)
5. **Timestamp preciso**: Registra fecha y hora exacta

## 🚀 Uso en Nuevos Módulos

Para agregar auditoría a un nuevo módulo:

```javascript
// 1. Importar funciones de logging
const { logCreate, logUpdate, logDelete } = require('../db/log-sistema');

// 2. Agregar en CREATE
router.post('/recurso', async (req, res) => {
    const result = await db.query('INSERT INTO ... RETURNING *', [...]);
    
    await logCreate({
        tabla: 'recurso',
        operadorId: req.body.id_operador_log || null,
        registroId: result.rows[0].id,
        descripcion: `Recurso creado: ${nombre}`,
        datosNuevos: result.rows[0],
        req
    });
    
    res.json({ success: true, data: result.rows[0] });
});

// 3. Agregar en UPDATE
router.put('/recurso/:id', async (req, res) => {
    const oldResult = await db.query('SELECT * FROM recurso WHERE id = $1', [id]);
    const datosAnteriores = oldResult.rows[0];
    
    const result = await db.query('UPDATE recurso SET ... WHERE id = $1 RETURNING *', [...]);
    
    await logUpdate({
        tabla: 'recurso',
        operadorId: req.body.id_operador_log || null,
        registroId: parseInt(id),
        descripcion: `Recurso actualizado: ${nombre}`,
        datosNuevos: result.rows[0],
        datosAnteriores,
        req
    });
    
    res.json({ success: true, data: result.rows[0] });
});

// 4. Agregar en DELETE
router.delete('/recurso/:id', async (req, res) => {
    const oldResult = await db.query('SELECT * FROM recurso WHERE id = $1', [id]);
    const datosAnteriores = oldResult.rows[0];
    
    await db.query('DELETE FROM recurso WHERE id = $1 RETURNING *', [id]);
    
    await logDelete({
        tabla: 'recurso',
        operadorId: req.body.id_operador_log || null,
        registroId: parseInt(id),
        descripcion: `Recurso eliminado: ${datosAnteriores?.nombre || 'id=' + id}`,
        datosAnteriores,
        req
    });
    
    res.json({ success: true, message: 'Recurso eliminado' });
});
```

## 📋 Checklist de Implementación

- [x] Tabla `auditoria_sistema` creada con estructura completa
- [x] Módulo `log-sistema.js` con todas las funciones helper
- [x] Autenticación (login, logout, registro)
- [x] Usuarios del sistema (operadores)
- [x] Directorio de contactos
- [x] Usuarios/Socios
- [x] Eventos/Cortes programados
- [x] Solicitudes
- [x] Controles
- [x] Lecturas
- [x] Cálculos
- [x] Historial
- [x] Seguimientos
- [x] Tipos de solicitud
- [x] Estados

## ✅ Resultado Final

**Sistema completamente auditable** con:
- ✅ Control total sobre acciones de administradores
- ✅ Historial claro de quién hizo qué y cuándo
- ✅ Trazabilidad completa de todas las operaciones CRUD
- ✅ Datos antes y después para ver cambios exactos
- ✅ IP y user-agent capturados automáticamente
- ✅ Relación formal con operador (ID, no texto)
- ✅ Fecha y hora exacta para cada acción
