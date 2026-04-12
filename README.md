# Sistema de Gestión Call Center — Cooperativa de Agua (SAGUAPAC)

Este proyecto es un sistema de gestión operativa para un Call Center, diseñado para manejar solicitudes, controles, historiales y la administración de zonas relacionadas con los servicios de la cooperativa de agua.

## 🚀 Características

- Gestión de usuarios y áreas (CRUD completo).
- Generación de reportes y solicitudes de servicio.
- Módulo de cálculos operativos y técnicos.
- Control de lecturas e historiales de seguimiento.
- API REST documentada y modular con Express.js.
- Conexión e integración con PostgreSQL usando `pg`.

## 📁 Estructura del Proyecto

El sistema está dividido en las siguientes partes clave integradas en el entorno:
- `/public/`: Frontend, recursos gráficos, hojas de estilo (CSS) y código cliente (JS/HTML).
- `/routes/`: Enrutadores de la API (Auth, Usuarios, Solicitudes, etc.).
- `/db/`: Scripts de inicialización, configuraciones y rutinas de backup para PostgreSQL.
- `server.js`: Archivo principal que levanta el backend e inicializa el servidor.
- `.env`: (NO inluido en el repositorio por seguridad) Variables de entorno.

## 📦 Instalación

1. Clona este repositorio:
   ```bash
   git clone https://github.com/tu-usuario/gestion-operativa-saguapac.git
   cd gestion-operativa-saguapac
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Crea un archivo `.env` en la raíz basado en tu configuración local:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_USER=postgres
   DB_PASSWORD=tu_password
   DB_NAME=bd_proyecto
   DB_PORT=5432
   SESSION_SECRET=tu_secreto
   ```

4. Ejecuta el servidor en modo desarrollo:
   ```bash
   npm run dev
   ```
   *O inicia en producción:* `npm start`

## 🛠️ Tecnologías Utilizadas

- **Node.js** con **Express.js** (Backend)
- **PostgreSQL** con paquete `pg` (Base de datos remota/local)
- **Bcryptjs** (Seguridad y Hash de contraseñas)
- **CORS** & **Dotenv** (Configuraciones seguras y políticas transversales)
