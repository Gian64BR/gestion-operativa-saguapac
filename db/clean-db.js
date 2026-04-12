/**
 * clean-db.js
 * Limpieza completa de datos de prueba para producción
 * 
 * PLAN DE LIMPIEZA:
 * 1. Eliminar usuarios TEST-*
 * 2. Eliminar evento de prueba "Programados para hoy"
 * 3. Eliminar contacto de directorio con "Nota de prueba hack"
 * 4. Limpiar auditoria_eventos (todos son de prueba)
 * 5. Limpiar auditoria_sistema (todos son de prueba)
 * 6. Resetear secuencias
 */

const db = require('./connection');

async function cleanDatabase() {
    console.log('🧹 INICIANDO LIMPIEZA DE BASE DE DATOS...\n');

    try {
        // ==========================================
        // PASO 1: Limpiar usuarios de prueba (TEST-*)
        // ==========================================
        console.log('📋 PASO 1: Eliminando usuarios de prueba...');
        const testUsersResult = await db.query("DELETE FROM usuarios WHERE codigo_asociado LIKE 'TEST-%'");
        console.log(`   ✓ Eliminados ${testUsersResult.rowCount} usuarios de prueba`);

        // ==========================================
        // PASO 2: Eliminar evento de prueba
        // ==========================================
        console.log('\n📋 PASO 2: Eliminando eventos de prueba...');
        const testEventsResult = await db.query("DELETE FROM eventos WHERE titulo LIKE '%Programados para hoy%' OR titulo LIKE '%test%' OR titulo LIKE '%prueba%'");
        console.log(`   ✓ Eliminados ${testEventsResult.rowCount} eventos de prueba`);

        // ==========================================
        // PASO 3: Limpiar directorio completo
        // ==========================================
        console.log('\n📋 PASO 3: Limpiando directorio (todos los contactos son de prueba)...');
        const testContactsResult = await db.query('DELETE FROM directorio');
        console.log(`   ✓ Eliminados ${testContactsResult.rowCount} contactos de prueba`);

        // ==========================================
        // PASO 4: Limpiar auditoria_eventos (todos son de prueba)
        // ==========================================
        console.log('\n📋 PASO 4: Limpiando auditoria_eventos...');
        const auditEventsResult = await db.query('DELETE FROM auditoria_eventos');
        console.log(`   ✓ Eliminados ${auditEventsResult.rowCount} registros de auditoria_eventos`);

        // ==========================================
        // PASO 5: Limpiar auditoria_sistema (todos son de prueba)
        // ==========================================
        console.log('\n📋 PASO 5: Limpiando auditoria_sistema...');
        const auditSystemResult = await db.query('DELETE FROM auditoria_sistema');
        console.log(`   ✓ Eliminados ${auditSystemResult.rowCount} registros de auditoria_sistema`);

        // ==========================================
        // PASO 6: Resetear secuencias
        // ==========================================
        console.log('\n📋 PASO 6: Reseteando secuencias autoincrementales...');

        await db.query("ALTER SEQUENCE usuarios_id_usuario_seq RESTART WITH 1");
        console.log('   ✓ usuarios_id_usuario_seq reseteada');

        await db.query("ALTER SEQUENCE eventos_id_seq RESTART WITH 1");
        console.log('   ✓ eventos_id_seq reseteada');

        await db.query("ALTER SEQUENCE directorio_id_seq RESTART WITH 1");
        console.log('   ✓ directorio_id_seq reseteada');

        await db.query("ALTER SEQUENCE auditoria_eventos_id_seq RESTART WITH 1");
        console.log('   ✓ auditoria_eventos_id_seq reseteada');

        await db.query("ALTER SEQUENCE auditoria_sistema_id_auditoria_seq RESTART WITH 1");
        console.log('   ✓ auditoria_sistema_id_auditoria_seq reseteada');

        await db.query("ALTER SEQUENCE zonas_id_seq RESTART WITH 1");
        console.log('   ✓ zonas_id_seq reseteada');

        // NOTA: operadores_id_operador_seq NO se resetea para evitar conflictos
        // con el administrador existente. Se mantiene para integridad del sistema.

        // ==========================================
        // RESUMEN FINAL
        // ==========================================
        console.log('\n' + '='.repeat(50));
        console.log('✅ LIMPIEZA COMPLETADA EXITOSAMENTE');
        console.log('='.repeat(50));
        console.log('\n📊 RESUMEN:');
        console.log(`   • Usuarios de prueba eliminados: ${testUsersResult.rowCount}`);
        console.log(`   • Eventos de prueba eliminados: ${testEventsResult.rowCount}`);
        console.log(`   • Contactos de prueba eliminados: ${testContactsResult.rowCount}`);
        console.log(`   • Logs auditoria_eventos eliminados: ${auditEventsResult.rowCount}`);
        console.log(`   • Logs auditoria_sistema eliminados: ${auditSystemResult.rowCount}`);
        console.log(`   • Secuencias reseteadas: 5`);

        // Verificar estado final
        console.log('\n🔍 VERIFICACIÓN FINAL:');
        const tables = ['operadores', 'usuarios', 'tipos_solicitud', 'estados', 'solicitudes',
            'controles', 'lecturas', 'calculos', 'historial', 'seguimientos',
            'directorio', 'zonas', 'eventos', 'auditoria_eventos', 'auditoria_sistema'];

        for (const table of tables) {
            const count = await db.query(`SELECT COUNT(*) FROM ${table}`);
            console.log(`   • ${table}: ${count.rows[0].count} registros`);
        }

        console.log('\n🚀 SISTEMA LISTO PARA PRODUCCIÓN');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ ERROR durante la limpieza:', err.message);
        console.error('   Rolling back...');
        process.exit(1);
    }
}

cleanDatabase();
