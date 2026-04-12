/**
 * tareas_logic.js — Versión 4.0
 * Gestión de Tareas Operativas
 */

'use strict';

let currentProcId = 'base';
let currentAuditRecord = null; // Tracks the ID of the active audit entry for the current task session.
// While on the same task, showResult reuses the same ID (UPSERT = overwrite).
// Resets to null when user switches the calculator tab or presses 'Nueva tarea'.
let auditSealedForThisTask = false;

// Helper: Calculate days between two ISO date strings (YYYY-MM-DD) using LOCAL time
// This prevents the -1 day shift caused by UTC timezone conversion
function daysBetweenDates(dateStr1, dateStr2) {
    const [year1, month1, day1] = dateStr1.split('-').map(Number);
    const [year2, month2, day2] = dateStr2.split('-').map(Number);
    // Create dates at noon to avoid DST issues
    const d1 = new Date(year1, month1 - 1, day1, 12, 0, 0);
    const d2 = new Date(year2, month2 - 1, day2, 12, 0, 0);
    const diffTime = d2.getTime() - d1.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// Helper: Format ISO date string (YYYY-MM-DD) to DD/MM without timezone shift
function fmtDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof setupHeader === 'function') setupHeader();
    selectProc('base', document.querySelector('.proc-btn.active'));
    const viewId = new URLSearchParams(window.location.search).get('viewId');
    if (viewId) enableReadOnlyAuditorMode(viewId);
});

// ============================================================
// REDONDEO GLOBAL: 0.0–0.79 → piso, >=0.80 → techo
// ============================================================
function customRound(val) {
    const floor = Math.floor(val);
    const decimal = val - floor;
    return decimal >= 0.80 ? floor + 1 : floor;
}

// ============================================================
// VALIDACIÓN DE CÓDIGO DE SOCIO (9 dígitos obligatorios)
// ============================================================

// Helper: Format codigo de asociado field - removes spaces, limits to 9 digits
function formatCodigoAsociado(value) {
    // Remove all spaces and non-digit characters
    const soloDigitos = value.replace(/\D/g, '');
    // Limit to first 9 digits
    return soloDigitos.slice(0, 9);
}

function validarCodigoSocio(codigo) {
    if (!codigo || codigo.trim() === '') {
        return { valido: false, mensaje: 'El código de asociado es obligatorio' };
    }
    // Remover guiones y espacios para validar solo dígitos
    const soloDigitos = codigo.replace(/[-\s]/g, '');
    if (!/^\d+$/.test(soloDigitos)) {
        return { valido: false, mensaje: 'El código de asociado solo puede contener números' };
    }
    if (soloDigitos.length !== 9) {
        return { valido: false, mensaje: 'El código de asociado debe tener exactamente 9 dígitos' };
    }
    return { valido: true, mensaje: '' };
}

// ============================================================
// SELECTOR — siempre limpia completamente
// ============================================================
window.selectProc = function (procId, btnElement) {
    document.querySelectorAll('.proc-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    currentProcId = procId;
    currentAuditRecord = null; // New calculator = new audit id
    auditSealedForThisTask = false;
    sessionStorage.removeItem('form801');
    const container = document.getElementById('procFormContainer');
    container.innerHTML = '';
    switch (procId) {
        case 'base': renderFormBase(container); break;
        case '8.01': renderForm801(container); break;
        case '8.02': renderForm802(container); break;
        case '8.03': renderForm803(container); break;
        case '8.04': renderForm804(container); break;
        case '8.06': renderForm806(container); break;
        case '8.07': renderForm807(container); break;
    }
};

// ============================================================
// UI HELPERS
// ============================================================
function mkHeader(title, infoFn = 'mostrarInfo()') {
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h3 style="color:var(--color-sidebar);margin:0;">${title}</h3>
        <div style="display:flex;gap:0.5rem;align-items:center;">
            <button class="btn" style="background:#dbeafe;color:#1d4ed8;padding:0.5rem 1rem;border:1px solid #bfdbfe;cursor:pointer;" onclick="${infoFn}">Información</button>
            <button class="btn" style="background:#f1f5f9;color:var(--color-text-dark);padding:0.5rem 1rem;border:1px solid var(--color-border);cursor:pointer;" onclick="window.selectProc(currentProcId, document.querySelector('.proc-btn.active'))">Nueva tarea ↻</button>
        </div>
    </div>`;
}

function mkGroup(label, inputHtml) {
    return `<div class="form-group"><label class="form-label">${label}</label>${inputHtml}</div>`;
}

// Helper: Generate codigo de asociado input with automatic formatting
function mkCodigoInput(id = 'codSocio', placeholder = 'Ej. 123456789', extraAttrs = '') {
    const onInputHandler = `oninput="this.value=formatCodigoAsociado(this.value)"`;
    const onPasteHandler = `onpaste="setTimeout(() => { this.value=formatCodigoAsociado(this.value); }, 0)"`;
    return `<input type="text" id="${id}" class="form-input" placeholder="${placeholder}" ${onInputHandler} ${onPasteHandler} ${extraAttrs} maxlength="9" inputmode="numeric" pattern="[0-9]{9}">`;
}

function mkCalcBtn(fn) {
    return `<div style="text-align:center;margin-bottom:2rem;">
        <button class="btn" style="background:var(--color-sidebar);color:white;padding:0.8rem 2rem;border-radius:24px;font-size:1rem;width:100%;max-width:300px;" onclick="${fn}">Calcular resultado final</button>
    </div>`;
}

// Result box: ticket-style - formula left, boxed result right
function mkResultBox() {
    return `
    <div id="finalResultBox" style="display:none;border:2px solid #334155;border-radius:14px;background:white;margin-bottom:1rem;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:1.4rem 2rem;gap:2rem;">
            <div id="resultFormula" style="font-size:1.05rem;color:#1e293b;font-family:'Courier New',monospace;line-height:2;flex:1;"></div>
            <div id="resultFinalBox" style="border:3px solid #334155;border-radius:8px;padding:0.6rem 1.2rem;white-space:nowrap;font-size:1.1rem;font-weight:700;color:#1e293b;font-family:'Courier New',monospace;min-width:130px;text-align:center;"></div>
        </div>
    </div>
    <div id="reduccionMesesBox" style="display:none;margin-bottom:1.5rem;"></div>`;
}

// ============================================================
// CONSUMO RANGE VALIDATION
// ============================================================
function mostrarValidacionConsumo(resultado) {
    const el = document.getElementById('validacionAlert');
    if (!el) return;
    if (resultado <= 5) {
        el.style.cssText = 'display:block;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:1rem;border-radius:8px;margin-bottom:1.5rem;font-weight:500;';
        el.innerHTML = '❌ <strong>No es procedente.</strong> El consumo es menor o igual a 5 m³.';
    } else if (resultado <= 10) {
        el.style.cssText = 'display:block;background:#fefce8;color:#854d0e;border:1px solid #fde68a;padding:1rem;border-radius:8px;margin-bottom:1.5rem;font-weight:500;';
        el.innerHTML = '⚠️ <strong>El consumo está dentro del rango normal.</strong> La modificación procede pero la reducción será mínima.';
    } else {
        el.style.cssText = 'display:block;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;padding:1rem;border-radius:8px;margin-bottom:1.5rem;font-weight:500;';
        el.innerHTML = '✅ <strong>Procedente.</strong> La reducción del consumo es significativa.';
    }
}

// ============================================================
// AUDITORÍA
// ============================================================
async function saveToAudit(record) {
    try {
        // Construir detalle con datos estructurados en JSON para persistencia completa
        // El backend SOLO guarda: tipo, operador, resultado, detalle, fecha_exac
        // Por eso empacamos TODA la información en el campo detalle como JSON
        const datosCompletos = record.datosFormato || record.datosJson || {};
        const detalleEstructurado = JSON.stringify({
            tipo: record.type,
            codSocio: record.codSocio,
            operador: record.operador,
            resultado: record.resultado,
            formulaHtml: record.formulaHtml || '',
            ...datosCompletos  // Spread all calculation fields
        });

        // Detalle legible para humanos + JSON parseable al final
        const detalle = `Tarea operativa ${record.type} | Socio: ${record.codSocio} | Resultado: ${record.resultado} | __JSON__:${detalleEstructurado}`;

        const response = await apiFetch('/api/audit-history', {
            method: 'POST',
            body: JSON.stringify({
                id: record.id,
                type: record.type,
                operador: record.operador,
                resultado: record.resultado,
                detalle: detalle
            })
        });

        if (!response.success) {
            console.warn('Advertencia: auditoría guardada pero response.success=false');
        }
        return response;
    } catch (err) {
        // Error silencioso en segundo plano - no interrumpir la UX
        console.error('[AUDITORÍA] Error al guardar:', err.message);
    }
}

// formulaHtml = inner HTML for the left side (can use <br>, <b> etc)
// finalText = boxed result label e.g. '22 m³ / 8.01'
// datosCompletos = object with all calculation fields for persistence
function showResult(formulaHtml, finalText, resultado, codSocio, datosCompletos) {
    const box = document.getElementById('finalResultBox');
    const formula = document.getElementById('resultFormula');
    const fin = document.getElementById('resultFinalBox');
    if (!box || !formula || !fin) return;

    formula.innerHTML = formulaHtml;
    fin.textContent = finalText;
    box.style.display = 'block';

    const record = {
        // Reuse the same ID for subsequent calculates within the same task session
        id: currentAuditRecord ? currentAuditRecord : Date.now().toString(),
        type: currentProcId,
        operador: localStorage.getItem('userName') || 'Operador',
        codSocio: codSocio || 'Sin código',
        resultado: finalText,
        formulaHtml: formulaHtml,
        datosFormato: datosCompletos || { valorNumerico: resultado }
    };

    // Guardar en auditoría en segundo plano sin bloquear la UI
    // Usamos .then() sin await para no bloquear la interfaz
    saveToAudit(record).then((response) => {
        // Capture the REAL database ID from the server response (SERIAL auto-increment)
        // so that subsequent recalculations UPSERT the same row instead of creating duplicates
        if (response && response.data && response.data.id) {
            currentAuditRecord = String(response.data.id);
        } else {
            currentAuditRecord = record.id;
        }
    }).catch(err => {
        console.error('Error al guardar auditoría (segundo plano):', err);
    });
}

// ============================================================
// PER-MONTH REDUCTION HELPERS (shared across all calculators)
// ============================================================

// Add a 'factura afectada' row to any container
window.addMesAfectado = function (containerId) {
    const c = document.getElementById(containerId);
    if (!c) return;
    const row = document.createElement('div');
    row.className = 'mes-afectado-row';
    row.style.cssText = 'display:flex;gap:1rem;align-items:center;margin-bottom:0.5rem;';
    row.innerHTML = `<select class="form-input mes-af-mes" style="flex:1;">
        <option value="">Mes</option>
        <option>Enero</option><option>Febrero</option><option>Marzo</option>
        <option>Abril</option><option>Mayo</option><option>Junio</option>
        <option>Julio</option><option>Agosto</option><option>Septiembre</option>
        <option>Octubre</option><option>Noviembre</option><option>Diciembre</option>
    </select>
    <input type="number" class="form-input mes-af-consumo" placeholder="Consumo original (m³)" style="flex:1;">
    <button class="btn" style="background:#fee2e2;color:#ef4444;padding:0.8rem;" onclick="this.parentElement.remove()">&#128465;</button>`;
    c.appendChild(row);
};

// Read 'facturas afectadas' rows from a container
function getMesesAfectados(containerId) {
    const rows = document.querySelectorAll(`#${containerId} .mes-afectado-row`);
    const meses = [];
    rows.forEach(r => {
        const mes = r.querySelector('.mes-af-mes')?.value;
        const consumo = parseFloat(r.querySelector('.mes-af-consumo')?.value);
        if (mes && !isNaN(consumo) && consumo > 0) meses.push({ mes, consumo });
    });
    return meses;
}

// Show per-month reduction evaluation below the result box
function evaluarReduccionPorFactura(resultado, meses) {
    const reduccionBox = document.getElementById('reduccionMesesBox');
    if (!reduccionBox) return;
    if (!meses || meses.length === 0) { reduccionBox.style.display = 'none'; return; }

    const filas = meses.map(m => {
        const reduccion = m.consumo - resultado;
        let bg, icono, etiqueta, textoExtra;
        if (reduccion <= 0) {
            bg = 'background:#fef2f2;color:#991b1b;border:1px solid #fecaca;';
            icono = '🔴'; etiqueta = 'Improcedente';
            textoExtra = 'El resultado es mayor al consumo original. Sin reducción.';
        } else if (reduccion <= 5) {
            bg = 'background:#fef2f2;color:#991b1b;border:1px solid #fecaca;';
            icono = '🔴'; etiqueta = 'Improcedente';
            textoExtra = 'Reducción de ' + reduccion + ' m³';
        } else if (reduccion <= 10) {
            bg = 'background:#fefce8;color:#854d0e;border:1px solid #fde68a;';
            icono = '🟡'; etiqueta = 'Procede con observación';
            textoExtra = 'Reducción de ' + reduccion + ' m³';
        } else {
            bg = 'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;';
            icono = '🟢'; etiqueta = 'Procedente';
            textoExtra = 'Reducción de ' + reduccion + ' m³';
        }
        return `<div style="${bg}border-radius:8px;padding:0.85rem 1rem;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:center;">
            <div>
                <strong style="font-size:0.95rem;">${m.mes}</strong><br>
                <small>Original: ${m.consumo} m³ → Ajustado: ${resultado} m³</small>
            </div>
            <div style="text-align:right;font-weight:700;font-size:0.95rem;">
                ${icono} ${etiqueta}<br>
                <small style="font-weight:400;">${textoExtra}</small>
            </div>
        </div>`;
    }).join('');

    reduccionBox.innerHTML =
        `<h4 style="color:var(--color-sidebar);margin-bottom:0.8rem;font-size:1rem;">Evaluación por factura</h4>` + filas;
    reduccionBox.style.display = 'block';
}

// Helper HTML block for 'facturas afectadas' section
function mkMesesAfectados(containerId) {
    return `
    <h4 style="color:var(--color-sidebar);margin-bottom:0.4rem;margin-top:1.5rem;">Facturas afectadas</h4>
    <p style="font-size:0.85rem;color:var(--color-text-muted);margin-bottom:0.8rem;">Añade cada mes con su consumo original para ver la evaluación individual.</p>
    <div id="${containerId}" style="margin-bottom:0.8rem;"></div>
    <div style="margin-bottom:2rem;">
        <button class="btn btn-outline" onclick="addMesAfectado('${containerId}')">+ Añadir mes afectado</button>
    </div>`;
}

window.nuevaTarea = function () {
    currentAuditRecord = null; // Reset: the next calculate on the fresh form will create a brand new record
    window.selectProc(currentProcId, document.querySelector('.proc-btn.active'));
};

// ============================================================
// MODALES DE INFORMACIÓN
// ============================================================
function showInfoModal(title, html) {
    const id = 'genericInfoModal';
    let m = document.getElementById(id);
    if (!m) { m = document.createElement('div'); m.id = id; m.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;'; document.body.appendChild(m); }
    m.innerHTML = `<div style="background:white;border-radius:16px;padding:2rem;max-width:600px;width:90%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 40px rgba(0,0,0,0.2);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
            <h3 style="color:var(--color-sidebar);margin:0;">ℹ️ ${title}</h3>
            <button onclick="document.getElementById('genericInfoModal').style.display='none'" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">×</button>
        </div>${html}
        <div style="text-align:center;margin-top:1.5rem;">
            <button onclick="document.getElementById('genericInfoModal').style.display='none'" style="background:var(--color-sidebar);color:white;border:none;padding:0.7rem 2rem;border-radius:20px;cursor:pointer;font-weight:600;">Entendido</button>
        </div></div>`;
    m.style.display = 'flex';
}

const INFOS = {
    base: {
        title: 'En Base (8.01)',
        body: `
        <div style="line-height:1.8;">
            <h4 style="color:#1d4ed8;margin-top:0;">¿Qué hace esta calculadora?</h4>
            <p>Esta calculadora te ayuda a ajustar el consumo de agua cuando un mes tuvo un consumo muy alto. Calcula un promedio justo entre el mes elevado y un mes normal.</p>
            
            <h4 style="color:#1d4ed8;">¿Cómo se usa paso a paso?</h4>
            <ol style="padding-left:1.5rem;">
                <li><strong>Ingresa el código del asociado:</strong> Escribe los 9 dígitos del código. Si copias y pegas un código largo, automáticamente se quedan solo los primeros 9 números.</li>
                <li><strong>Escribe el consumo normal:</strong> Este es el consumo típico del asociado en meses normales (por ejemplo, 20 m³).</li>
                <li><strong>Agrega los meses con consumo alto:</strong> Haz clic en "+ Añadir mes" y selecciona el mes y escribe cuánto consumió.</li>
                <li><strong>Revisa el promedio:</strong> La calculadora muestra automáticamente el promedio de los meses altos.</li>
                <li><strong>Haz clic en "Calcular resultado final":</strong> 
                    <ul style="margin-top:0.5rem;">
                        <li>Si agregaste <strong>un solo mes alto</strong>: se suma con el normal y se divide entre 2</li>
                        <li>Si agregaste <strong>varios meses altos</strong>: primero se promedian entre ellos, luego ese resultado se promedia con el normal</li>
                    </ul>
                </li>
            </ol>
            
            <h4 style="color:#1d4ed8;">Ejemplo sencillo</h4>
            <div style="background:#f0f9ff;padding:1rem;border-radius:8px;margin:1rem 0;">
                <p><strong>Situación:</strong> Un mes consumió 50 m³ (muy alto), pero normalmente consume 20 m³</p>
                <p><strong>Cálculo:</strong> (50 + 20) ÷ 2 = 35 m³</p>
                <p><strong>Resultado:</strong> El consumo ajustado será 35 m³ en lugar de 50 m³</p>
            </div>
            
            <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:1rem;border-radius:4px;margin-top:1rem;">
                <strong>⚠️ Importante:</strong> El resultado debe ser mayor a 10 m³ para que el ajuste sea significativo. Si hay varios meses altos, se promedian primero entre ellos y luego con el mes normal.
            </div>
        </div>`
    },
    '8.01': {
        title: 'Arreglo de Fuga (8.01)',
        body: `
        <div style="line-height:1.8;">
            <h4 style="color:#1d4ed8;margin-top:0;">¿Qué hace esta calculadora?</h4>
            <p>Esta calculadora se usa cuando un asociado tuvo una fuga de agua que ya fue reparada. Calcula cuánto agua se perdió por la fuga y lo combina con el consumo normal del asociado.</p>
            
            <h4 style="color:#1d4ed8;">¿Cómo se usa paso a paso?</h4>
            <ol style="padding-left:1.5rem;">
                <li><strong>Ingresa el código del asociado:</strong> Escribe los 9 dígitos del código.</li>
                <li><strong>Fecha de la inspección:</strong> Cuando el inspector visitó y revisó el medidor por primera vez.</li>
                <li><strong>Lectura del inspector:</strong> El número que marcaba el medidor cuando el inspector lo revisó.</li>
                <li><strong>Fecha actual:</strong> La fecha de hoy (se pone automáticamente, pero puedes cambiarla).</li>
                <li><strong>Lectura actual del asociado:</strong> El número que marca el medidor ahora.</li>
                <li><strong>Agrega meses con consumo alto anteriores:</strong> Meses antes de la fuga que tuvieron consumo elevado.</li>
                <li><strong>Haz clic en "Calcular resultado final":</strong> La calculadora hace lo siguiente:
                    <ul style="margin-top:0.5rem;">
                        <li>Calcula cuántos días pasaron entre la inspección y hoy</li>
                        <li>Calcula el consumo diario por la fuga: (lectura actual - lectura inicial) ÷ días</li>
                        <li>Lo convierte a consumo mensual: multiplica por 30 días</li>
                        <li>Promedia este consumo de fuga con el promedio de los meses altos anteriores</li>
                    </ul>
                </li>
            </ol>
            
            <h4 style="color:#1d4ed8;">Ejemplo sencillo</h4>
            <div style="background:#f0f9ff;padding:1rem;border-radius:8px;margin:1rem 0;">
                <p><strong>Inspección:</strong> Día 1, medidor marcaba 1200 m³</p>
                <p><strong>Hoy:</strong> Día 15, medidor marca 1250 m³</p>
                <p><strong>Pasaron:</strong> 14 días</p>
                <p><strong>Consumo por fuga:</strong> (1250 - 1200) ÷ 14 × 30 = 107 m³</p>
                <p><strong>Promedio meses anteriores:</strong> 50 m³</p>
                <p><strong>Resultado final:</strong> (107 + 50) ÷ 2 = 79 m³</p>
            </div>
            
            <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:1rem;border-radius:4px;margin-top:1rem;">
                <strong>⚠️ Reglas importantes:</strong>
                <ul style="margin-top:0.5rem;margin-bottom:0;">
                    <li>Deben pasar al menos 10 días desde la inspección</li>
                    <li>El consumo calculado debe ser mayor a 5 m³</li>
                    <li>Si pasan más de 29 días, puede ser observado</li>
                </ul>
            </div>
        </div>`
    },
    '8.02': {
        title: 'Promedio Elevado (8.02)',
        body: `
        <div style="line-height:1.8;">
            <h4 style="color:#1d4ed8;margin-top:0;">¿Qué hace esta calculadora?</h4>
            <p>Esta calculadora estima el consumo mensual cuando tienes una lectura reciente del inspector y la última lectura correcta que se registró antes.</p>
            
            <h4 style="color:#1d4ed8;">¿Para qué sirve?</h4>
            <p>Imagina que un inspector visita hoy y lee el medidor. Necesitas saber cuánto consumió el asociado desde la última lectura buena que se tomó. Esta calculadora convierte esa diferencia en un consumo mensual estimado.</p>
            
            <h4 style="color:#1d4ed8;">¿Cómo se usa paso a paso?</h4>
            <ol style="padding-left:1.5rem;">
                <li><strong>Ingresa el código del asociado:</strong> Escribe los 9 dígitos del código.</li>
                <li><strong>Fecha de la última lectura correcta:</strong> Cuando se tomó la última lectura que sabes que está bien.</li>
                <li><strong>Fecha actual (del inspector):</strong> La fecha de la lectura del inspector (se pone hoy automáticamente).</li>
                <li><strong>Lectura anterior correcta:</strong> El número del medidor en esa última lectura correcta.</li>
                <li><strong>Lectura actual del inspector:</strong> El número que leyó el inspector hoy.</li>
                <li><strong>Haz clic en "Calcular resultado final":</strong> La calculadora:
                    <ul style="margin-top:0.5rem;">
                        <li>Cuenta cuántos días pasaron entre las dos fechas</li>
                        <li>Resta la lectura actual menos la anterior para ver cuánto consumió</li>
                        <li>Divide ese consumo entre los días para saber el consumo diario</li>
                        <li>Multiplica por 30 para estimar el consumo mensual</li>
                    </ul>
                </li>
            </ol>
            
            <h4 style="color:#1d4ed8;">Ejemplo sencillo</h4>
            <div style="background:#f0f9ff;padding:1rem;border-radius:8px;margin:1rem 0;">
                <p><strong>Última lectura correcta:</strong> 1 de enero, medidor marcaba 1000 m³</p>
                <p><strong>Lectura del inspector hoy:</strong> 16 de enero, medidor marca 1021 m³</p>
                <p><strong>Pasaron:</strong> 15 días</p>
                <p><strong>Consumo:</strong> (1021 - 1000) ÷ 15 × 30 = 42 m³</p>
                <p><strong>Resultado:</strong> El consumo mensual estimado es 42 m³</p>
            </div>
            
            <div style="background:#dbeafe;border-left:4px solid #3b82f6;padding:1rem;border-radius:4px;margin-top:1rem;">
                <strong>💡 Fórmula:</strong> (Lectura actual - Lectura anterior) ÷ Días transcurridos × 30 = Consumo mensual estimado
            </div>
        </div>`
    },
    '8.03': {
        title: 'Cambio de Medidor (8.03)',
        body: `
        <div style="line-height:1.8;">
            <h4 style="color:#1d4ed8;margin-top:0;">¿Qué hace esta calculadora?</h4>
            <p>Esta calculadora se usa cuando se le cambia el medidor a un asociado. El medidor nuevo empieza en cero, y necesitas saber cuánto consumió desde que se instaló.</p>
            
            <h4 style="color:#1d4ed8;">¿Cómo funciona?</h4>
            <p>Cuando ponen un medidor nuevo, este empieza desde 0. La calculadora toma la lectura actual del medidor nuevo, cuenta cuántos días pasaron desde que se instaló, y calcula cuántos m³ consumiría en un mes completo (30 días).</p>
            
            <h4 style="color:#1d4ed8;">¿Cómo se usa paso a paso?</h4>
            <ol style="padding-left:1.5rem;">
                <li><strong>Ingresa el código del asociado:</strong> Escribe los 9 dígitos del código.</li>
                <li><strong>Fecha de inspección (cambio de medidor):</strong> El día que instalaron el medidor nuevo.</li>
                <li><strong>Fecha actual:</strong> Hoy (se pone automáticamente, pero puedes cambiarla).</li>
                <li><strong>Lectura actual del medidor nuevo:</strong> El número que marca el medidor nuevo ahora.</li>
                <li><strong>Haz clic en "Calcular resultado final":</strong> La calculadora:
                    <ul style="margin-top:0.5rem;">
                        <li>Cuenta los días desde el cambio de medidor</li>
                        <li>Divide la lectura actual entre esos días</li>
                        <li>Multiplica por 30 para obtener el consumo mensual estimado</li>
                    </ul>
                </li>
            </ol>
            
            <h4 style="color:#1d4ed8;">Ejemplo sencillo</h4>
            <div style="background:#f0f9ff;padding:1rem;border-radius:8px;margin:1rem 0;">
                <p><strong>Cambio de medidor:</strong> 1 de enero (medidor nuevo empezó en 0)</p>
                <p><strong>Hoy:</strong> 15 de enero, medidor marca 12 m³</p>
                <p><strong>Pasaron:</strong> 14 días</p>
                <p><strong>Cálculo:</strong> 12 ÷ 14 × 30 = 26 m³</p>
                <p><strong>Resultado:</strong> Si continuara así, consumiría 26 m³ en un mes</p>
            </div>
            
            <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:1rem;border-radius:4px;margin-top:1rem;">
                <strong>⚠️ Reglas importantes:</strong>
                <ul style="margin-top:0.5rem;margin-bottom:0;">
                    <li>Deben pasar al menos 10 días desde el cambio</li>
                    <li>El consumo debe ser mayor a 5 m³ para ser procedente</li>
                    <li>Si pasan más de 29 días, puede ser observado</li>
                </ul>
            </div>
        </div>`
    },
    '8.04': {
        title: 'Mala Lectura (8.04)',
        body: `
        <div style="line-height:1.8;">
            <h4 style="color:#1d4ed8;margin-top:0;">¿Qué hace esta calculadora?</h4>
            <p>Esta calculadora corrige el consumo cuando se registró mal la lectura del medidor. Restas la lectura correcta actual de la lectura anterior correcta para obtener el consumo real.</p>
            
            <h4 style="color:#1d4ed8;">¿Cuándo se usa?</h4>
            <p>Imagina que en un mes anotaron mal el número del medidor (por ejemplo, anotaron 80 en vez de 19). Esta calculadora encuentra la diferencia entre lo que realmente marca el medidor ahora y lo que marcaba antes, para calcular el consumo verdadero.</p>
            
            <h4 style="color:#1d4ed8;">¿Cómo se usa paso a paso?</h4>
            <ol style="padding-left:1.5rem;">
                <li><strong>Ingresa el código del asociado:</strong> Escribe los 9 dígitos del código.</li>
                <li><strong>Lectura anterior correcta:</strong> El número del medidor en la última lectura que sabes que está bien (mes anterior).</li>
                <li><strong>Lectura correcta actual verificada:</strong> El número real del medidor ahora (puede ser de una foto o de un inspector).</li>
                <li><strong>Haz clic en "Calcular resultado final":</strong> La calculadora simplemente resta:
                    <ul style="margin-top:0.5rem;">
                        <li>Lectura correcta actual - Lectura anterior correcta = Consumo real</li>
                    </ul>
                </li>
            </ol>
            
            <h4 style="color:#1d4ed8;">Ejemplo sencillo</h4>
            <div style="background:#f0f9ff;padding:1rem;border-radius:8px;margin:1rem 0;">
                <p><strong>Lectura anterior correcta:</strong> 8 m³</p>
                <p><strong>Lectura correcta actual:</strong> 19 m³</p>
                <p><strong>Cálculo:</strong> 19 - 8 = 11 m³</p>
                <p><strong>Resultado:</strong> El consumo real es 11 m³ (no 80 como se había anotado mal)</p>
            </div>
            
            <div style="background:#dbeafe;border-left:4px solid #3b82f6;padding:1rem;border-radius:4px;margin-top:1rem;">
                <strong>💡 Fórmula:</strong> Lectura correcta actual − Lectura anterior correcta = Consumo real
            </div>
        </div>`
    },
    '8.06': {
        title: 'Cambio de Categoría (8.06)',
        body: `
        <div style="line-height:1.8;">
            <h4 style="color:#1d4ed8;margin-top:0;">¿Qué hace esta calculadora?</h4>
            <p>Esta calculadora te ayuda a revisar si el consumo de un asociado corresponde a una categoría tarifaria diferente. A veces un consumo muy alto puede indicar que el uso del agua cambió (por ejemplo, de uso doméstico a comercial).</p>
            
            <h4 style="color:#1d4ed8;">¿Para qué sirve?</h4>
            <p>Las tarifas de agua dependen del tipo de uso (casa, negocio, industria, etc.). Si un asociado tiene un consumo muy alto, podría ser que ahora usa el agua para otra actividad y debería pagar con otra categoría. Esta calculadora te ayuda a identificar esos meses.</p>
            
            <h4 style="color:#1d4ed8;">¿Cómo se usa paso a paso?</h4>
            <ol style="padding-left:1.5rem;">
                <li><strong>Ingresa el código del asociado:</strong> Escribe los 9 dígitos del código.</li>
                <li><strong>Agrega los meses a revisar:</strong> Haz clic en "+ Añadir mes" y selecciona el mes y escribe cuánto consumió.</li>
                <li><strong>Puedes agregar varios meses:</strong> Agrega todos los meses que quieras revisar.</li>
                <li><strong>Haz clic en "Calcular resultado final":</strong> La calculadora muestra todos los meses con sus consumos para que puedas ver si corresponde cambiar la categoría.</li>
            </ol>
            
            <h4 style="color:#1d4ed8;">Ejemplo sencillo</h4>
            <div style="background:#f0f9ff;padding:1rem;border-radius:8px;margin:1rem 0;">
                <p><strong>Enero:</strong> 45 m³</p>
                <p><strong>Febrero:</strong> 50 m³</p>
                <p><strong>Marzo:</strong> 48 m³</p>
                <p><strong>Resultado:</strong> Los 3 meses muestran consumo alto y constante → Podría necesitar cambio de categoría (de casa a negocio, por ejemplo)</p>
            </div>
            
            <div style="background:#dbeafe;border-left:4px solid #3b82f6;padding:1rem;border-radius:4px;margin-top:1rem;">
                <strong>💡 Consejo:</strong> Revisa varios meses seguidos para ver si el consumo alto es constante o fue algo de un solo mes.
            </div>
        </div>`
    },
    '8.07': {
        title: 'Purga de Instalación (8.07)',
        body: `
        <div style="line-height:1.8;">
            <h4 style="color:#1d4ed8;margin-top:0;">¿Qué hace esta calculadora?</h4>
            <p>Esta calculadora se usa cuando se hace una purga (limpieza) de la instalación de agua. Calcula el consumo promedio de los 3 meses anteriores para reemplazar un mes con consumo anormalmente alto.</p>
            
            <h4 style="color:#1d4ed8;">¿Cuándo se usa?</h4>
            <p>Después de hacer una purga de la instalación, el consumo del mes puede salir muy alto porque se usó mucha agua para limpiar las tuberías. Esta calculadora toma los meses anteriores normales y calcula un promedio para usar en lugar del mes afectado por la purga.</p>
            
            <h4 style="color:#1d4ed8;">¿Cómo se usa paso a paso?</h4>
            <ol style="padding-left:1.5rem;">
                <li><strong>Ingresa el código del asociado:</strong> Escribe los 9 dígitos del código.</li>
                <li><strong>Mes 1 - Consumo previo:</strong> El consumo del primer mes anterior a la purga (por ejemplo, 3 meses atrás).</li>
                <li><strong>Mes 2 - Consumo previo:</strong> El consumo del segundo mes anterior (2 meses atrás).</li>
                <li><strong>Mes 3 - Consumo previo:</strong> El consumo del tercer mes anterior (el mes justo antes de la purga).</li>
                <li><strong>Haz clic en "Calcular resultado final":</strong> La calculadora:
                    <ul style="margin-top:0.5rem;">
                        <li>Suma los 3 consumos</li>
                        <li>Divide entre 3 para obtener el promedio</li>
                        <li>Ese promedio es el consumo que se usa en lugar del mes con la purga</li>
                    </ul>
                </li>
            </ol>
            
            <h4 style="color:#1d4ed8;">Ejemplo sencillo</h4>
            <div style="background:#f0f9ff;padding:1rem;border-radius:8px;margin:1rem 0;">
                <p><strong>3 meses atrás:</strong> 49 m³</p>
                <p><strong>2 meses atrás:</strong> 45 m³</p>
                <p><strong>Mes anterior:</strong> 43 m³</p>
                <p><strong>Cálculo:</strong> (49 + 45 + 43) ÷ 3 = 46 m³</p>
                <p><strong>Resultado:</strong> En lugar del consumo alto por la purga, se usa 46 m³</p>
            </div>
            
            <div style="background:#dbeafe;border-left:4px solid #3b82f6;padding:1rem;border-radius:4px;margin-top:1rem;">
                <strong>💡 Fórmula:</strong> (Mes1 + Mes2 + Mes3) ÷ 3 = Promedio que reemplaza el consumo elevado
            </div>
        </div>`
    }
};

window.mostrarInfo = function () {
    const info = INFOS[currentProcId];
    if (info) showInfoModal(info.title, info.body);
};

// ============================================================
// EN BASE (8.01)
// ============================================================
function renderFormBase(container) {
    container.innerHTML = `
    ${mkHeader('Calculadora — En Base (8.01)')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;border-bottom:1px solid var(--color-border);padding-bottom:2rem;margin-bottom:2rem;">
        ${mkGroup('Código del asociado', mkCodigoInput('codSocio', 'Ingresa 9 dígitos'))}
        ${mkGroup('Consumo normal (m³)', '<input type="number" id="baseNormal" class="form-input" placeholder="Ej. 20" oninput="calcBaseRealtime()">')}
    </div>
    <h4 style="color:var(--color-sidebar);margin-bottom:0.5rem;">Meses anteriores con consumo elevado</h4>
    <p style="font-size:0.85rem;color:var(--color-text-muted);margin-bottom:1rem;">Añade cada mes con consumo alto.</p>
    <div id="baseMesesContainer" style="display:flex;flex-direction:column;gap:0.8rem;margin-bottom:1rem;"></div>
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:2rem;">
        <button class="btn btn-outline" onclick="addMesBase()">+ Añadir mes</button>
        <div style="border:1px solid var(--color-border);border-radius:8px;padding:0.5rem 1rem;background:#f8fafc;min-width:130px;text-align:center;">
            <span style="display:block;font-size:0.75rem;color:var(--color-text-muted);margin-bottom:0.2rem;">Promedio elevados</span>
            <span id="basePromedioDisplay" style="font-weight:600;font-size:1.1rem;color:var(--color-sidebar);">–</span>
        </div>
    </div>
    ${mkCalcBtn('ejecutarBase()')}
    ${mkResultBox()}`;
    addMesBase();
}

window.addMesBase = function () {
    const c = document.getElementById('baseMesesContainer');
    if (!c) return;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:1rem;align-items:center;';
    row.innerHTML = `<select class="form-input base-mes-sel" style="flex:1;" onchange="calcBaseRealtime()">
        <option value="">Mes</option>
        <option>Enero</option><option>Febrero</option><option>Marzo</option>
        <option>Abril</option><option>Mayo</option><option>Junio</option>
        <option>Julio</option><option>Agosto</option><option>Septiembre</option>
        <option>Octubre</option><option>Noviembre</option><option>Diciembre</option>
    </select>
    <input type="number" class="form-input base-consumo-input" placeholder="Consumo (m³)" style="flex:1;" oninput="calcBaseRealtime()">
    <button class="btn" style="background:#fee2e2;color:#ef4444;padding:0.8rem;" onclick="this.parentElement.remove(); calcBaseRealtime()">🗑</button>`;
    c.appendChild(row);
};

window.calcBaseRealtime = function () {
    const inputs = document.querySelectorAll('.base-consumo-input');
    let suma = 0, count = 0;
    inputs.forEach(i => { const v = parseFloat(i.value); if (!isNaN(v) && v > 0) { suma += v; count++; } });
    const prom = count > 0 ? customRound(suma / count) : 0;
    const el = document.getElementById('basePromedioDisplay');
    if (el) el.textContent = count > 0 ? prom : '–';
    return { suma, count, prom };
};

window.ejecutarBase = function () {
    const codSocioInput = document.getElementById('codSocio')?.value || '';
    const codSocio = codSocioInput || 'Sin código';
    const normal = parseFloat(document.getElementById('baseNormal')?.value) || 0;
    const { suma, count, prom } = calcBaseRealtime();

    // VALIDAR CÓDIGO DE SOCIO ANTES DE CALCULAR
    const validacion = validarCodigoSocio(codSocioInput);
    if (!validacion.valido) {
        alert('⚠️ ' + validacion.mensaje + '.');
        return;
    }

    if (count === 0 || !normal) { alert('Añade al menos un mes elevado e ingresa el consumo normal.'); return; }

    const elevadosInputs = Array.from(document.querySelectorAll('.base-consumo-input')).map(i => parseFloat(i.value)).filter(v => !isNaN(v) && v > 0);
    let formulaHtml, resultado;

    if (count === 1) {
        const raw = (elevadosInputs[0] + normal) / 2;
        resultado = customRound(raw);
        formulaHtml = `
        <div style="display:flex;align-items:center;gap:1.5rem;font-family:'Courier New',monospace;font-size:1.2rem;font-weight:700;">
            <div style="display:flex;flex-direction:column;align-items:center;">
                <div>${elevadosInputs[0]} + ${normal}</div>
                <div style="border-top:3px solid #1e293b;margin:2px 0;width:100%;"></div>
                <div>2</div>
            </div>
            <div>= ${resultado}</div>
        </div>`;
    } else {
        const rawProm = suma / count;
        const promRedondeado = customRound(rawProm);
        const raw = (promRedondeado + normal) / 2;
        resultado = customRound(raw);
        const eleStr = elevadosInputs.join(' + ');
        formulaHtml = `
        <div style="display:flex;align-items:center;gap:3rem;font-family:'Courier New',monospace;font-size:1.1rem;font-weight:700;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:1rem;">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <div>${eleStr}</div>
                    <div style="border-top:3px solid #1e293b;margin:2px 0;width:100%;"></div>
                    <div>${count}</div>
                </div>
                <div>= ${promRedondeado}</div>
            </div>
            <div style="display:flex;align-items:center;gap:1rem;">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <div>${promRedondeado} + ${normal}</div>
                    <div style="border-top:3px solid #1e293b;margin:2px 0;width:100%;"></div>
                    <div>2</div>
                </div>
                <div>= ${resultado}</div>
            </div>
        </div>`;
    }

    showResult(formulaHtml, `${resultado} m³ / 8.01`, resultado, codSocio);

    // Per-month evaluation using the elevated months entered by the user
    const selects = document.querySelectorAll('.base-mes-sel');
    const mesesParaEval = elevadosInputs.map((v, i) => ({
        mes: selects[i]?.value || `Mes ${i + 1}`,
        consumo: v
    }));
    evaluarReduccionPorFactura(resultado, mesesParaEval);
};

// ============================================================
// ARREGLO DE FUGA (8.01)
// ============================================================
function renderForm801(container) {
    container.innerHTML = `
    ${mkHeader('Calculadora — Arreglo de fuga (8.01)')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;border-bottom:1px solid var(--color-border);padding-bottom:2rem;margin-bottom:2rem;">
        ${mkGroup('Código del asociado', mkCodigoInput('codSocio', 'Ingresa 9 dígitos'))}
        <div></div>
        ${mkGroup('Fecha de la inspección', '<input type="date" id="fechaInicial" class="form-input" onchange="saveFormState()">')}
        ${mkGroup('Lectura del inspector (m³)', '<input type="number" id="lecInicial" class="form-input" placeholder="Ej. 1200" oninput="saveFormState()">')}
        ${mkGroup('Fecha actual', '<input type="date" id="fechaActual" class="form-input" onchange="saveFormState()">')}
        ${mkGroup('Lectura actual del asociado (m³)', '<input type="number" id="lecActual" class="form-input" placeholder="Ej. 1250" oninput="saveFormState()">')}
    </div>
    <h4 style="color:var(--color-sidebar);margin-bottom:0.5rem;">Meses anteriores con consumo elevado (Promedio C2)</h4>
    <p style="font-size:0.85rem;color:var(--color-text-muted);margin-bottom:1rem;">Añade los meses previos con consumo alto para calcular el promedio C2.</p>
    <div id="mesesAltosContainer" style="display:flex;flex-direction:column;gap:0.8rem;margin-bottom:1rem;"></div>
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:2rem;">
        <button class="btn btn-outline" onclick="addMesAlto()">+ Añadir mes</button>
        <div style="border:1px solid var(--color-border);border-radius:8px;padding:0.5rem 1rem;background:#f8fafc;min-width:120px;text-align:center;">
            <span style="display:block;font-size:0.75rem;color:var(--color-text-muted);margin-bottom:0.2rem;">Promedio C2</span>
            <span id="resPromedioRealtime" style="font-weight:600;font-size:1.1rem;color:var(--color-sidebar);">–</span>
        </div>
    </div>
    ${mkCalcBtn('ejecutarCalculoFinal()')}
    <div id="diasWarningAlert" style="display:none;padding:0.8rem;border-radius:8px;margin-bottom:1rem;"></div>
    <div id="finalResultBox" style="display:none;border:2px solid #334155;border-radius:14px;background:white;margin-bottom:1rem;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:1.4rem 2rem;gap:2rem;">
            <div id="resultFormula" style="font-size:1.05rem;color:#1e293b;font-family:'Courier New',monospace;line-height:2;flex:1;"></div>
            <div id="resultFinalBox" style="border:3px solid #334155;border-radius:8px;padding:0.6rem 1.2rem;white-space:nowrap;font-size:1.1rem;font-weight:700;color:#1e293b;font-family:'Courier New',monospace;min-width:130px;text-align:center;"></div>
        </div>
    </div>
    <div id="reduccionMesesBox" style="display:none;margin-bottom:1.5rem;"></div>
    <div id="procAccionesContainer" style="display:none;margin-bottom:1rem;"></div>`;

    const fa = document.getElementById('fechaActual');
    if (fa && !fa.value) fa.value = new Date().toLocaleDateString('en-CA');
    loadFormState();
}

// ============================================================
// PROMEDIO ELEVADO (8.02)
// ============================================================
function renderForm802(container) {
    container.innerHTML = `
    ${mkHeader('Calculadora — Promedio Elevado (8.02)')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;border-bottom:1px solid var(--color-border);padding-bottom:2rem;margin-bottom:2rem;">
        ${mkGroup('Código del asociado', mkCodigoInput('codSocio', 'Ingresa 9 dígitos'))}
        <div></div>
        ${mkGroup('Fecha de la última lectura correcta', '<input type="date" id="f802FechaUltima" class="form-input">')}
        ${mkGroup('Fecha actual (del inspector)', '<input type="date" id="f802FechaActual" class="form-input">')}
        ${mkGroup('Lectura anterior correcta (m³)', '<input type="number" id="f802LecAnterior" class="form-input" placeholder="Ej. 21">')}
        ${mkGroup('Lectura actual del inspector (m³)', '<input type="number" id="f802LecActual" class="form-input" placeholder="Ej. 34">')}
    </div>
    ${mkCalcBtn('ejecutar802()')}
    ${mkResultBox()}`;
    const fa = document.getElementById('f802FechaActual');
    if (fa) fa.value = new Date().toLocaleDateString('en-CA');
}

window.ejecutar802 = function () {
    const codSocioInput = document.getElementById('codSocio')?.value || '';
    const codSocio = codSocioInput || 'Sin código';
    const fechaUltima = document.getElementById('f802FechaUltima')?.value;
    const fechaActual = document.getElementById('f802FechaActual')?.value;
    const lecAnterior = parseFloat(document.getElementById('f802LecAnterior')?.value);
    const lecActual = parseFloat(document.getElementById('f802LecActual')?.value);

    // VALIDAR CÓDIGO DE SOCIO ANTES DE CALCULAR
    const validacion = validarCodigoSocio(codSocioInput);
    if (!validacion.valido) {
        alert('⚠️ ' + validacion.mensaje + '.');
        return;
    }

    if (!fechaUltima || !fechaActual || isNaN(lecAnterior) || isNaN(lecActual)) {
        alert('Completa todos los campos.');
        return;
    }
    const dias = daysBetweenDates(fechaUltima, fechaActual);
    if (dias <= 0) { alert('La fecha actual debe ser posterior a la última lectura.'); return; }
    const diferencia = lecActual - lecAnterior;
    if (diferencia <= 0) { alert('La lectura del inspector debe ser mayor que la anterior.'); return; }
    const raw = (diferencia / dias) * 30;
    const resultado = customRound(raw);
    const formulaHtml = `
        <div style="display:flex;flex-direction:column;gap:1.2rem;font-family:'Courier New',monospace;">
            <div style="font-size:0.95rem;color:#475569;">
                ${fmtDate(fechaUltima)} &rarr; ${lecAnterior} m³<br>
                ${fmtDate(fechaActual)} &rarr; ${lecActual} m³
            </div>
            <div style="display:flex;align-items:center;gap:1rem;font-size:1.15rem;font-weight:700;">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <div>(${lecActual} &minus; ${lecAnterior})</div>
                    <div style="border-top:3px solid #1e293b;margin:2px 0;width:100%;"></div>
                    <div>${dias} d&iacute;as</div>
                </div>
                <div>&times; 30 = ${resultado}</div>
            </div>
        </div>`;
    showResult(formulaHtml, `${resultado} m³ / 8.02`, resultado, codSocio);
};

// ============================================================
// CAMBIO DE MEDIDOR (8.03)
// ============================================================
function renderForm803(container) {
    container.innerHTML = `
    ${mkHeader('Calculadora — Cambio de medidor (8.03)')}
    <div id="diasWarningAlert803" style="display:none;padding:0.8rem;border-radius:8px;margin-bottom:1rem;"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;border-bottom:1px solid var(--color-border);padding-bottom:2rem;margin-bottom:2rem;">
        ${mkGroup('Código del asociado', mkCodigoInput('codSocio', 'Ingresa 9 dígitos'))}
        <div></div>
        ${mkGroup('Fecha de inspección (cambio de medidor)', '<input type="date" id="f803FechaInsp" class="form-input">')}
        ${mkGroup('Fecha actual', '<input type="date" id="f803FechaActual" class="form-input">')}
        ${mkGroup('Lectura actual del medidor nuevo (m³)', '<input type="number" id="f803LecActual" class="form-input" placeholder="Ej. 12">')}
    </div>
    ${mkCalcBtn('ejecutar803()')}
    ${mkResultBox()}`;
    const fa = document.getElementById('f803FechaActual');
    if (fa) fa.value = new Date().toLocaleDateString('en-CA');
}

window.ejecutar803 = function () {
    const codSocioInput = document.getElementById('codSocio')?.value || '';
    const codSocio = codSocioInput || 'Sin código';
    const fechaInsp = document.getElementById('f803FechaInsp')?.value;
    const fechaActual = document.getElementById('f803FechaActual')?.value;
    const lecActual = parseFloat(document.getElementById('f803LecActual')?.value) || 0;

    // VALIDAR CÓDIGO DE SOCIO ANTES DE CALCULAR
    const validacion = validarCodigoSocio(codSocioInput);
    if (!validacion.valido) {
        alert('⚠️ ' + validacion.mensaje + '.');
        return;
    }

    if (!fechaInsp || !fechaActual || !lecActual) { alert('Completa todos los campos.'); return; }
    const dias = daysBetweenDates(fechaInsp, fechaActual);
    const alertEl = document.getElementById('diasWarningAlert803');

    if (alertEl) {
        alertEl.style.display = 'block';
        if (dias >= 1 && dias <= 6) {
            alertEl.style.cssText = 'display:block;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:1rem;border-radius:8px;margin-bottom:1.5rem;font-weight:500;';
            alertEl.innerHTML = `🔴 <strong>No es procedente.</strong> Solo han pasado ${dias} días. Aún no ha pasado el tiempo mínimo requerido.`;
        } else if (dias >= 7 && dias <= 9) {
            alertEl.style.cssText = 'display:block;background:#fefce8;color:#854d0e;border:1px solid #fde68a;padding:1rem;border-radius:8px;margin-bottom:1.5rem;font-weight:500;';
            alertEl.innerHTML = `🟡 <strong>Advertencia.</strong> Han pasado ${dias} días. Aún no es el tiempo recomendado, lo ideal es esperar hasta 10 días o más.`;
        } else if (dias >= 10) {
            alertEl.style.cssText = 'display:block;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;padding:1rem;border-radius:8px;margin-bottom:1.5rem;font-weight:500;';
            alertEl.innerHTML = `🟢 <strong>Procedente.</strong> Han pasado ${dias} días. Ya pasó el tiempo adecuado para la solicitud.`;
        } else {
            alertEl.style.display = 'none';
        }
    }
    const raw = (lecActual / dias) * 30;
    const resultado = customRound(raw);
    const formulaHtml = `
        <div style="display:flex;flex-direction:column;gap:1.2rem;font-family:'Courier New',monospace;">
            <div style="font-size:0.95rem;color:#475569;">
                ${fmtDate(fechaInsp)} &rarr; 000 m³<br>
                ${fmtDate(fechaActual)} &rarr; ${String(lecActual).padStart(3, '0')} m³
            </div>
            <div style="display:flex;align-items:center;gap:1rem;font-size:1.15rem;font-weight:700;">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <div>${lecActual}</div>
                    <div style="border-top:3px solid #1e293b;margin:2px 0;width:100%;"></div>
                    <div>${dias} d&iacute;as</div>
                </div>
                <div>&times; 30 = ${resultado}</div>
            </div>
        </div>`;
    showResult(formulaHtml, `${resultado} m³ / 8.03`, resultado, codSocio);
};

// ============================================================
// MALA LECTURA (8.04)
// ============================================================
function renderForm804(container) {
    container.innerHTML = `
    ${mkHeader('Calculadora — Mala lectura (8.04)')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;border-bottom:1px solid var(--color-border);padding-bottom:2rem;margin-bottom:2rem;">
        ${mkGroup('Código del asociado', mkCodigoInput('codSocio', 'Ingresa 9 dígitos'))}
        <div></div>
        ${mkGroup('Lectura anterior correcta (m³)', '<input type="number" id="f804LecAnterior" class="form-input" placeholder="Ej. 8">')}
        ${mkGroup('Lectura correcta actual verificada (m³)', '<input type="number" id="f804LecCorrecta" class="form-input" placeholder="Ej. 19">')}
    </div>
    ${mkCalcBtn('ejecutar804()')}
    ${mkResultBox()}`;
}

window.ejecutar804 = function () {
    const codSocioInput = document.getElementById('codSocio')?.value || '';
    const codSocio = codSocioInput || 'Sin código';
    const lecAnterior = parseFloat(document.getElementById('f804LecAnterior')?.value) || 0;
    const lecCorrecta = parseFloat(document.getElementById('f804LecCorrecta')?.value) || 0;

    // VALIDAR CÓDIGO DE SOCIO ANTES DE CALCULAR
    const validacion = validarCodigoSocio(codSocioInput);
    if (!validacion.valido) {
        alert('⚠️ ' + validacion.mensaje + '.');
        return;
    }

    if (!lecAnterior || !lecCorrecta) { alert('Ingresa ambas lecturas.'); return; }
    const diferencia = Math.max(0, lecCorrecta - lecAnterior);
    const resultado = customRound(diferencia);
    const formulaHtml = `<div style="font-family:'Courier New',monospace;font-size:1.3rem;font-weight:700;">${lecCorrecta} − ${lecAnterior} = ${resultado}</div>`;
    showResult(formulaHtml, `${resultado} m³ / 8.04`, resultado, codSocio);
};

// ============================================================
// CAMBIO DE CATEGORÍA (8.06)
// ============================================================
function renderForm806(container) {
    container.innerHTML = `
    ${mkHeader('Calculadora — Cambio de categoría (8.06)')}
    ${mkGroup('Código del asociado', mkCodigoInput('codSocio', 'Ingresa 9 dígitos'))}
    <br>
    <h4 style="color:var(--color-sidebar);margin-bottom:0.5rem;">Meses a revisar</h4>
    <div id="meses806Container" style="display:flex;flex-direction:column;gap:0.8rem;margin-bottom:1rem;"></div>
    <div style="margin-bottom:2rem;"><button class="btn btn-outline" onclick="addMes806()">+ Añadir mes</button></div>
    ${mkCalcBtn('ejecutar806()')}
    ${mkResultBox()}`;
    addMes806();
}

window.addMes806 = function () {
    const c = document.getElementById('meses806Container');
    if (!c) return;
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:1rem;align-items:center;';
    row.innerHTML = `<select class="form-input mes806-mes" style="flex:1;">
        <option value="">Mes</option>
        <option>Enero</option><option>Febrero</option><option>Marzo</option>
        <option>Abril</option><option>Mayo</option><option>Junio</option>
        <option>Julio</option><option>Agosto</option><option>Septiembre</option>
        <option>Octubre</option><option>Noviembre</option><option>Diciembre</option>
    </select>
    <input type="number" class="form-input mes806-consumo" placeholder="Consumo (m³)" style="flex:1;">
    <button class="btn" style="background:#fee2e2;color:#ef4444;padding:0.8rem;" onclick="this.parentElement.remove()">🗑</button>`;
    c.appendChild(row);
};

window.ejecutar806 = function () {
    const codSocioInput = document.getElementById('codSocio')?.value || '';
    const codSocio = codSocioInput || 'Sin código';
    const rows = document.querySelectorAll('#meses806Container > div');
    const datos = [];
    rows.forEach(r => { const mes = r.querySelector('.mes806-mes')?.value; const consumo = parseFloat(r.querySelector('.mes806-consumo')?.value); if (mes && !isNaN(consumo) && consumo > 0) datos.push({ mes, consumo }); });

    // VALIDAR CÓDIGO DE SOCIO ANTES DE CALCULAR
    const validacion = validarCodigoSocio(codSocioInput);
    if (!validacion.valido) {
        alert('⚠️ ' + validacion.mensaje + '.');
        return;
    }

    if (datos.length === 0) { alert('Añade al menos un mes con consumo.'); return; }
    const valores = datos.map(d => customRound(d.consumo));
    const resultLine = valores.length === 1 ? `${valores[0]} m³ / 8.06` : `${valores.join(' – ')} m³ / 8.06`;
    const formulaHtml = datos.map(d => `<div style="font-family:'Courier New',monospace;font-size:1.15rem;font-weight:700;"><b>${d.mes}:</b> ${d.consumo}</div>`).join('');
    const box = document.getElementById('finalResultBox');
    const formula = document.getElementById('resultFormula');
    const fin = document.getElementById('resultFinalBox');
    if (formula) formula.innerHTML = formulaHtml;
    if (fin) fin.textContent = resultLine;
    if (box) box.style.display = 'block';

    // NOTA: fecha_exac se genera automáticamente en el servidor con NOW()
    const record = { id: currentAuditRecord || Date.now().toString(), type: '8.06', operador: localStorage.getItem('userName') || 'Operador', codSocio, resultado: resultLine, formulaHtml };
    saveToAudit(record).then((response) => {
        if (response && response.data && response.data.id) {
            currentAuditRecord = String(response.data.id);
        } else {
            currentAuditRecord = record.id;
        }
    }).catch(err => {
        console.error('Error al guardar auditoría 8.06:', err);
    });

    const reduccionBox = document.getElementById('reduccionMesesBox');
    if (!reduccionBox) {
        const newBox = document.createElement('div');
        newBox.id = 'reduccionMesesBox';
        document.getElementById('procFormContainer').appendChild(newBox);
    }

    const theBox = document.getElementById('reduccionMesesBox');
    if (theBox) {
        const mesesHtml = datos.map(d => `<strong>${d.mes}</strong>`).join(', ');
        theBox.innerHTML = `
            <div style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:8px;padding:1rem;font-weight:600;font-size:1.1rem;margin-top:1.5rem;text-align:center;">
                ✅ Cambio de categoría correcta (${mesesHtml})
            </div>`;
        theBox.style.display = 'block';
    }
};

// ============================================================
// PURGA DE INSTALACIÓN (8.07)
// ============================================================
function renderForm807(container) {
    container.innerHTML = `
    ${mkHeader('Calculadora — Purga de instalación (8.07)')}
    ${mkGroup('Código del asociado', mkCodigoInput('codSocio', 'Ingresa 9 dígitos'))}
    <br>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.5rem;border-bottom:1px solid var(--color-border);padding-bottom:2rem;margin-bottom:2rem;">
        ${mkGroup('Mes 1 — Consumo previo (m³)', '<input type="number" id="f807m1" class="form-input" placeholder="Ej. 49">')}
        ${mkGroup('Mes 2 — Consumo previo (m³)', '<input type="number" id="f807m2" class="form-input" placeholder="Ej. 45">')}
        ${mkGroup('Mes 3 — Consumo previo (m³)', '<input type="number" id="f807m3" class="form-input" placeholder="Ej. 43">')}
    </div>
    ${mkCalcBtn('ejecutar807()')}
    ${mkResultBox()}`;
}

window.ejecutar807 = function () {
    const codSocioInput = document.getElementById('codSocio')?.value || '';
    const codSocio = codSocioInput || 'Sin código';
    const m1 = parseFloat(document.getElementById('f807m1')?.value) || 0;
    const m2 = parseFloat(document.getElementById('f807m2')?.value) || 0;
    const m3 = parseFloat(document.getElementById('f807m3')?.value) || 0;
    const validos = [m1, m2, m3].filter(v => v > 0);

    // VALIDAR CÓDIGO DE SOCIO ANTES DE CALCULAR
    const validacion = validarCodigoSocio(codSocioInput);
    if (!validacion.valido) {
        alert('⚠️ ' + validacion.mensaje + '.');
        return;
    }

    if (validos.length === 0) { alert('Ingresa al menos un mes.'); return; }
    const suma = validos.reduce((a, b) => a + b, 0);
    const raw = suma / validos.length;
    const resultado = customRound(raw);
    const formulaHtml = `
        <div style="display:flex;align-items:center;gap:1.5rem;font-family:'Courier New',monospace;font-size:1.15rem;font-weight:700;">
            <div style="display:flex;flex-direction:column;align-items:center;">
                <div>${validos.join(' + ')}</div>
                <div style="border-top:3px solid #1e293b;margin:2px 0;width:100%;"></div>
                <div>${validos.length}</div>
            </div>
            <div>= ${suma} &divide; ${validos.length} = ${resultado}</div>
        </div>`;
    showResult(formulaHtml, `${resultado} m³ / 8.07`, resultado, codSocio);
};

// ============================================================
// 8.01 FUGA — CÁLCULO COMPLETO
// ============================================================
window.addMesAlto = function (existingConsumo = '') {
    const c = document.getElementById('mesesAltosContainer');
    if (!c) return;
    const row = document.createElement('div');
    row.className = 'mes-alto-row';
    row.style.cssText = 'display:flex;gap:1rem;align-items:center;';
    row.innerHTML = `<input type="number" class="form-input consumo-input" placeholder="Consumo (m³)" oninput="calcularPromedioRealtime(); saveFormState()" style="flex:1;" value="${existingConsumo}">
    <button class="btn trash-btn" style="background:#fee2e2;color:#ef4444;padding:0.8rem;" onclick="this.parentElement.remove(); calcularPromedioRealtime(); saveFormState()">🗑</button>`;
    c.appendChild(row);
};

window.calcularPromedioRealtime = function () {
    const inputs = document.querySelectorAll('.consumo-input');
    let suma = 0, n = 0;
    inputs.forEach(i => { const v = parseFloat(i.value); if (!isNaN(v) && v > 0) { suma += v; n++; } });
    const C2 = n > 0 ? customRound(suma / n) : 0;
    const el = document.getElementById('resPromedioRealtime');
    if (el) el.textContent = n > 0 ? C2 : '–';
    return C2;
};

window.saveFormState = function () {
    if (currentProcId !== '8.01') return;
    const state = {
        lecInicial: document.getElementById('lecInicial')?.value || '',
        lecActual: document.getElementById('lecActual')?.value || '',
        codSocio: document.getElementById('codSocio')?.value || '',
        fechaInicial: document.getElementById('fechaInicial')?.value || '',
        fechaActual: document.getElementById('fechaActual')?.value || '',
        mesesAltos: []
    };
    document.querySelectorAll('.mes-alto-row').forEach(row => {
        state.mesesAltos.push({ consumo: row.querySelector('.consumo-input')?.value || '' });
    });
    sessionStorage.setItem('form801', JSON.stringify(state));
};

window.loadFormState = function () {
    const raw = sessionStorage.getItem('form801');
    if (!raw) return false;
    try {
        const s = JSON.parse(raw);
        if (s.lecInicial) document.getElementById('lecInicial').value = s.lecInicial;
        if (s.lecActual) document.getElementById('lecActual').value = s.lecActual;
        if (s.codSocio) document.getElementById('codSocio').value = s.codSocio;
        if (s.fechaInicial) document.getElementById('fechaInicial').value = s.fechaInicial;
        if (s.fechaActual) document.getElementById('fechaActual').value = s.fechaActual;
        if (s.mesesAltos?.length > 0) { const c = document.getElementById('mesesAltosContainer'); if (c) { c.innerHTML = ''; s.mesesAltos.forEach(m => addMesAlto(m.consumo)); } }
        calcularPromedioRealtime();
        return true;
    } catch (e) { return false; }
};

window.resetFormState = function () {
    sessionStorage.removeItem('form801');
    window.location.href = 'tareas.html';
};

window.ejecutarCalculoFinal = function () {
    const lecInspector = parseFloat(document.getElementById('lecInicial')?.value) || 0;
    const lecSocio = parseFloat(document.getElementById('lecActual')?.value) || 0;
    const codSocioInput = document.getElementById('codSocio')?.value || '';
    const codSocio = codSocioInput || 'Sin código';
    const fechaInicial = document.getElementById('fechaInicial')?.value;
    const fechaActual = document.getElementById('fechaActual')?.value;

    // VALIDAR CÓDIGO DE SOCIO ANTES DE CALCULAR
    const validacion = validarCodigoSocio(codSocioInput);
    if (!validacion.valido) {
        alert('⚠️ ' + validacion.mensaje + '.');
        return;
    }

    if (!fechaInicial || !fechaActual || !lecInspector || !lecSocio) {
        alert('Completa todos los campos obligatorios.');
        return;
    }
    const D = daysBetweenDates(fechaInicial, fechaActual);
    const alertEl = document.getElementById('diasWarningAlert');

    // ---- REGLA DE DÍAS ----
    if (alertEl) alertEl.style.display = 'none';
    if (D >= 1 && D <= 6) {
        if (alertEl) {
            alertEl.style.cssText = 'display:block;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:0.9rem 1rem;border-radius:8px;margin-bottom:1rem;font-weight:500;';
            alertEl.innerHTML = `🔴 <strong>No es procedente.</strong> Solo han pasado <strong>${D} días</strong>. Aún no ha pasado el tiempo mínimo requerido.`;
        }
        return;
    }
    if (D >= 7 && D <= 9) {
        if (alertEl) {
            alertEl.style.cssText = 'display:block;background:#fefce8;color:#854d0e;border:1px solid #fde68a;padding:0.9rem 1rem;border-radius:8px;margin-bottom:1rem;font-weight:500;';
            alertEl.innerHTML = `🟡 <strong>Advertencia.</strong> Han pasado <strong>${D} días</strong>. Aún no es el tiempo recomendado, lo ideal es esperar hasta 10 días o más.`;
        }
        // Continues — does NOT return
    } else if (D >= 10) {
        if (alertEl) {
            alertEl.style.cssText = 'display:block;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;padding:0.9rem 1rem;border-radius:8px;margin-bottom:1rem;font-weight:500;';
            alertEl.innerHTML = `🟢 <strong>Procedente.</strong> Han pasado <strong>${D} días</strong>. Ya pasó el tiempo adecuado para la solicitud.`;
        }
    }

    // ---- CÁLCULO ----
    const restaLecturas = Math.max(0, lecSocio - lecInspector);
    const rawFuga = (restaLecturas / D) * 30;
    const consumoFuga = customRound(rawFuga);
    if (consumoFuga <= 5) {
        if (alertEl) {
            alertEl.style.cssText = 'display:block;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:0.9rem 1rem;border-radius:8px;margin-bottom:1rem;font-weight:500;';
            alertEl.innerHTML = `&#x274C; <strong>No procede.</strong> El consumo de fuga calculado es <strong>${consumoFuga} m&sup3;</strong> (m&iacute;nimo requerido: m&aacute;s de 5 m&sup3;).`;
        }
        return;
    }
    const C2 = calcularPromedioRealtime();
    if (C2 === 0) {
        if (alertEl) {
            alertEl.style.cssText = 'display:block;background:#fefce8;color:#854d0e;border:1px solid #fde68a;padding:0.9rem 1rem;border-radius:8px;margin-bottom:1rem;font-weight:500;';
            alertEl.innerHTML = '&#x26A0;&#xFE0F; <strong>Atenci&oacute;n.</strong> Agrega al menos un mes anterior en el Promedio C2 para completar el c&aacute;lculo.';
        }
        return;
    }
    const rawFinal = (C2 + consumoFuga) / 2;
    const resultadoFinal = customRound(rawFinal);

    // ---- TICKET BOX (wireframe style: flexbox accurate mathematical fractions) ----
    const formulaHtml = `
        <div style="display:flex;flex-direction:column;gap:1.2rem;font-family:'Courier New',monospace;">
            <div style="font-size:0.95rem;color:#475569;">
                ${fmtDate(fechaInicial)} &rarr; ${lecInspector} m³<br>
                ${fmtDate(fechaActual)} &rarr; ${lecSocio} m³
            </div>
            <div style="display:flex;align-items:center;gap:2.5rem;font-size:1.1rem;font-weight:700;flex-wrap:wrap;">
                <!-- Parte 1: Cálculo de fuga -->
                <div style="display:flex;align-items:center;gap:1rem;">
                    <div style="display:flex;flex-direction:column;align-items:center;">
                        <div>(${lecSocio} &minus; ${lecInspector})</div>
                        <div style="border-top:3px solid #1e293b;margin:2px 0;width:100%;"></div>
                        <div>${D} d&iacute;as</div>
                    </div>
                    <div>&times; 30 = ${consumoFuga}</div>
                </div>
                
                <!-- Parte 2: Promedio con C2 -->
                <div style="display:flex;align-items:center;gap:1rem;">
                    <div style="display:flex;flex-direction:column;align-items:center;">
                        <div>${consumoFuga} + ${C2}</div>
                        <div style="border-top:3px solid #1e293b;margin:2px 0;width:100%;"></div>
                        <div>2</div>
                    </div>
                    <div>= ${resultadoFinal}</div>
                </div>
            </div>
        </div>`;

    // ---- REDUCCIÓN POR MES ----
    const mesesAltos = [];
    let index = 1;
    document.querySelectorAll('.mes-alto-row').forEach(row => {
        const consumo = parseFloat(row.querySelector('.consumo-input')?.value) || 0;
        if (consumo > 0) mesesAltos.push({ mes: `Factura ${index++}`, consumo });
    });

    // Construir datos completos para persistencia en auditoría
    const datosCompletos = {
        codSocio: codSocio,
        fechaInicial: fechaInicial,
        fechaActual: fechaActual,
        lecInspector: lecInspector,
        lecSocio: lecSocio,
        diasTranscurridos: D,
        consumoFuga: consumoFuga,
        promedioC2: C2,
        resultadoFinal: resultadoFinal,
        mesesAltos: mesesAltos.map((m, i) => ({ mes: m.mes, consumo: m.consumo, reduccion: customRound(m.consumo - resultadoFinal) }))
    };

    showResult(formulaHtml, `${resultadoFinal} m³ / 8.01`, resultadoFinal, codSocio, datosCompletos);

    let reduccionBox = document.getElementById('reduccionMesesBox');
    if (!reduccionBox) {
        reduccionBox = document.createElement('div');
        reduccionBox.id = 'reduccionMesesBox';
        document.getElementById('procFormContainer').appendChild(reduccionBox);
    }

    if (mesesAltos.length > 0) {
        const filas = mesesAltos.map(m => {
            const reduccion = customRound(m.consumo - resultadoFinal);
            let color, icono, etiqueta;
            if (reduccion >= 10) {
                color = '#f0fdf4;color:#166534;border:1px solid #bbf7d0;';
                icono = '🟢'; etiqueta = 'Sí es procedente';
            } else if (reduccion >= 6) {
                color = '#fefce8;color:#854d0e;border:1px solid #fde68a;';
                icono = '🟡'; etiqueta = 'Reducción pequeña (procedente)';
            } else {
                color = '#fef2f2;color:#991b1b;border:1px solid #fecaca;';
                icono = '🔴'; etiqueta = 'No es procedente';
            }
            return `<div style="background:${color}border-radius:8px;padding:0.8rem 1rem;display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <div><strong>${m.mes}</strong><br><small>Original: ${m.consumo} m³ → Ajustado: ${resultadoFinal} m³ &nbsp; Reducción: ${reduccion} m³</small></div>
                <div style="text-align:right;font-weight:600;">${icono} ${etiqueta}<br><small>Reducción de ${reduccion} m³</small></div>
            </div>`;
        }).join('');
        reduccionBox.innerHTML = `<h4 style="color:var(--color-sidebar);margin-bottom:0.8rem;">Evaluación por factura</h4>${filas}`;
        reduccionBox.style.display = 'block';
    } else {
        reduccionBox.style.display = 'none';
    }
};

// ============================================================
// MODO COMPROBANTE (Solo lectura)
// ============================================================
window.enableReadOnlyAuditorMode = async function (recordId) {
    try {
        const auditHistory = await apiFetch('/api/audit-history');
        const record = auditHistory.find(r => r.id === recordId);
        if (!record) { alert('Registro no encontrado.'); return; }

        const btnWithType = document.querySelector(`.proc-btn[onclick*="'${record.type}'"]`)
            || document.querySelector('.proc-btn');
        selectProc(record.type, btnWithType);

        setTimeout(() => {
            const data = (typeof record.datos_json === 'string') ? JSON.parse(record.datos_json) : (record.datos_json || record.datosFormato);
            if (record.type === '8.01' && data) {
                const fi = document.getElementById('lecInicial'); if (fi) fi.value = data.lecInspector;
                const fa = document.getElementById('lecActual'); if (fa) fa.value = data.lecSocio;
                const fc = document.getElementById('codSocio'); if (fc) fc.value = record.cod_socio || record.codSocio;
                const fd = document.getElementById('fechaInicial'); if (fd) fd.value = data.fechaInicial;
                const fe = document.getElementById('fechaActual'); if (fe) fe.value = data.fechaActual;
                const cont = document.getElementById('mesesAltosContainer');
                const mAltos = (typeof record.meses_altos === 'string') ? JSON.parse(record.meses_altos) : (record.meses_altos || record.mesesAltos);
                if (cont && mAltos) { cont.innerHTML = ''; mAltos.forEach(m => addMesAlto(m.consumo)); }
            }
            document.querySelectorAll('input, select').forEach(el => { el.setAttribute('readonly', 'true'); el.style.background = '#f1f5f9'; el.style.border = '1px dashed #cbd5e1'; });
            document.querySelectorAll('.trash-btn').forEach(btn => btn.style.display = 'none');
            setTimeout(() => {
                if (record.type === '8.01') ejecutarCalculoFinal();
                else { const proc = document.getElementById('resultProcedimiento'); const fin = document.getElementById('resultFinal'); const box = document.getElementById('finalResultBox'); if (proc) proc.textContent = record.detalle || ''; if (fin) fin.textContent = record.resultado || ''; if (box) box.style.display = 'block'; }
                const banner = document.createElement('div');
                banner.innerHTML = `<strong>MODO COMPROBANTE — SOLO LECTURA</strong> (${record.operador} · ${new Date(record.fechaExac).toLocaleDateString()})`;
                banner.style.cssText = 'background:#fef08a;padding:1rem;color:#854d0e;border-radius:8px;margin-bottom:2rem;border:1px solid #fde047;font-weight:500;text-align:center;';
                document.getElementById('procFormContainer').prepend(banner);
            }, 200);
        }, 100);
    } catch (err) {
        console.error('Error loading auditor mode:', err);
        alert('Error al cargar datos del registro.');
    }
};
