/**
 * backup-db.js
 * Creates a backup of all important data before cleanup
 */

const db = require('./connection');
const fs = require('fs');
const path = require('path');

async function createBackup() {
    const backupDir = path.join(__dirname, '..');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `db\\backup_pre_cleanup_${timestamp}.json`);

    console.log('🔄 Creando backup de la base de datos...');

    try {
        const tables = [
            'operadores',
            'usuarios',
            'tipos_solicitud',
            'estados',
            'solicitudes',
            'controles',
            'lecturas',
            'calculos',
            'historial',
            'seguimientos',
            'directorio',
            'zonas',
            'eventos',
            'auditoria_eventos',
            'auditoria_sistema'
        ];

        const backup = { timestamp, tables: {} };

        for (const table of tables) {
            const result = await db.query(`SELECT * FROM ${table}`);
            backup.tables[table] = result.rows;
            console.log(`  ✓ ${table}: ${result.rows.length} registros guardados`);
        }

        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
        console.log(`\n✅ Backup guardado en: ${backupFile}`);
        console.log(`   Total tablas: ${tables.length}`);
        console.log(`   Tamaño: ${(fs.statSync(backupFile).size / 1024).toFixed(2)} KB`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error creando backup:', err.message);
        process.exit(1);
    }
}

createBackup();
