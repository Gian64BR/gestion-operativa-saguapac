const { Pool } = require('pg');
require('dotenv').config();

// Determinar si estamos en entorno local
const isLocal = !process.env.DATABASE_URL && 
  (process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1');

let pool;

if (process.env.DATABASE_URL) {
  // Conexión vía connection string (Vercel + Supabase)
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else {
  // Conexión vía variables individuales (desarrollo local)
  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
}

// Probar la conexión a la base de datos al arrancar
pool.connect()
  .then(() => console.log('Conexión a la base de datos exitosa'))
  .catch(err => console.error('Error al conectar a la base de datos', err.stack));

module.exports = {
  query: (text, params) => pool.query(text, params),
};
