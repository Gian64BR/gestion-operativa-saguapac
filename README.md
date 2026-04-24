# Sistema de Gestión Call Center — Cooperativa de Agua (SAGUAPAC)

Este proyecto es un sistema integral de gestión operativa diseñado específicamente para un Call Center. Su propósito es centralizar, optimizar y administrar eficientemente las solicitudes, seguimientos, historiales y el control de zonas operativas de la cooperativa de agua, garantizando un servicio eficiente y rastreable.

## 🚀 Características Principales

- **Gestión Integral**: Administración completa de usuarios, operadores y áreas mediante operaciones CRUD.
- **Solicitudes y Reportes**: Generación y seguimiento de solicitudes de servicio técnico y atención al cliente.
- **Herramientas Operativas**: Módulo de cálculos para ajustes técnicos e intervenciones operativas.
- **Control y Auditoría**: Registro exhaustivo de historiales de sistema y eventos con trazabilidad por operador.
- **Arquitectura Robusta**: API REST modular construida sobre Node.js y Express.
- **Base de Datos Relacional**: Integración nativa con PostgreSQL para garantizar la integridad y seguridad de la información.

## 📁 Estructura del Proyecto

El repositorio sigue una arquitectura de capas bien definida:

- `/public/`: Frontend, recursos estáticos, componentes de la interfaz de usuario (HTML/CSS) y la lógica de presentación (JS).
- `/routes/`: Controladores y enrutadores de la API (Autenticación, Usuarios, Operadores, Tareas, etc.).
- `/db/`: Scripts SQL, inicializadores de esquemas y configuraciones de conexión.
- `/scripts/`: Utilidades para administración, auditoría y limpieza de base de datos.
- `server.js`: Punto de entrada principal que inicializa el servidor backend.

## 📦 Requisitos Previos

- [Node.js](https://nodejs.org/) (v16.x o superior recomendado)
- [PostgreSQL](https://www.postgresql.org/) (v12 o superior recomendado)

## ⚙️ Instalación y Despliegue Local

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Gian64BR/gestion-operativa-saguapac.git
   cd gestion-operativa-saguapac
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar Variables de Entorno (.env):**
   Crea un archivo llamado `.env` en la raíz del proyecto. **Este archivo NO debe subirse a Git por motivos de seguridad**. Utiliza la siguiente plantilla:
   ```env
   # Configuración del Servidor
   PORT=3000
   SESSION_SECRET=tu_secreto_super_seguro

   # Configuración de Base de Datos PostgreSQL
   DB_HOST=localhost
   DB_USER=postgres
   DB_PASSWORD=tu_password
   DB_NAME=bd_proyecto
   DB_PORT=5432

   # Opcional: Variables para despliegue
   NODE_ENV=development
   ```

4. **Inicializar la Base de Datos:**
   El sistema está diseñado para inicializar automáticamente las tablas necesarias al arrancar si la base de datos `bd_proyecto` ya existe en tu servidor de PostgreSQL local.

5. **Iniciar la aplicación:**
   - Para desarrollo (con recarga automática):
     ```bash
     npm run dev
     ```
   - Para producción:
     ```bash
     npm start
     ```

## 📖 Uso Básico

1. Accede a la aplicación navegando a `http://localhost:3000` en tu navegador.
2. Inicia sesión con las credenciales de administrador configuradas en la base de datos (o la cuenta por defecto si existe).
3. Utiliza la barra de navegación lateral para acceder a la gestión de Operadores, Tareas, Directorio y el panel de Auditoría.

## 🛠️ Tecnologías y Stack

- **Backend:** Node.js, Express.js
- **Base de Datos:** PostgreSQL, módulo `pg`
- **Seguridad:** Bcryptjs (Hash de contraseñas)
- **Frontend:** HTML5, CSS3 Vanilla, JavaScript (Módulos)
- **Otras dependencias:** CORS, Dotenv, Nodemon (Desarrollo)
