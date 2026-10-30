/**
 * Exporta la colección `questions` de Firestore al formato JSONL del asset
 * de la app móvil (`rutaUdea/app/src/main/assets/questions/questions.jsonl`).
 *
 * Dirección única: Firestore manda, el .jsonl obedece. El panel nunca
 * reescribe historia desde el asset.
 *
 * Uso:
 *   node scripts/export-bank-to-jsonl.js [--estado=aprobado] [--out=./exports/banco.jsonl] [--include-incomplete]
 *
 * Opciones:
 *   --estado=aprobado|pendiente|deshabilitado|all  (default: aprobado)
 *   --out=<ruta>      (default: ./exports/questions-<fecha>.jsonl)
 *   --include-incomplete  incluye preguntas incompletas (por defecto se omiten
 *                         con aviso: sin enunciado, opciones vacías o sin respuesta A–D)
 *
 * Lee credenciales desde `.env.local` (ver scripts/set-admin-claim.js).
 */

const fs = require('fs');
const path = require('path');

function cargarEnv() {
  const ruta = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(ruta)) {
    console.error('No existe .env.local. Cópialo desde .env.example primero.');
    process.exit(1);
  }
  for (const linea of fs.readFileSync(ruta, 'utf-8').split('\n')) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, clave, valor] = m;
    if (process.env[clave]) continue;
    process.env[clave] = valor.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  }
}

function args() {
  const out = { estado: 'aprobado', out: null, includeIncomplete: false };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--estado=')) out.estado = a.slice('--estado='.length);
    else if (a.startsWith('--out=')) out.out = a.slice('--out='.length);
    else if (a === '--include-incomplete') out.includeIncomplete = true;
    else {
      console.error(`Opción desconocida: ${a}`);
      process.exit(1);
    }
  }
  if (!['aprobado', 'pendiente', 'deshabilitado', 'all'].includes(out.estado)) {
    console.error('--estado debe ser aprobado, pendiente, deshabilitado o all');
    process.exit(1);
  }
  return out;
}

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const esOpcionValida = (v) => typeof v === 'string' && v.trim().length > 0;
const esRespuestaValida = (v) =>
  typeof v === 'string' && ['A', 'B', 'C', 'D'].includes(v.trim().toUpperCase());

/** Razones por las que una pregunta no sirve para simulacros. */
function incompleta(doc) {
  const razones = [];
  if (!str(doc.pregunta).trim()) razones.push('sin enunciado');
  const op = aOpciones(doc.opciones);
  for (const l of ['A', 'B', 'C', 'D']) {
    if (!esOpcionValida(op[l])) razones.push(`opcion_${l.toLowerCase()} vacía`);
  }
  if (!esRespuestaValida(doc.respuesta_correcta)) razones.push('sin respuesta A–D');
  if (!str(doc.area).trim())
    razones.push('sin area (no la seleccionará ningún simulacro)');
  return razones;
}

/** Normaliza opciones en forma lista [A..D] u objeto {A..D} a objeto. */
function aOpciones(op) {
  const vacias = { A: '', B: '', C: '', D: '' };
  if (Array.isArray(op)) {
    const letras = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < 4; i++) {
      if (letras[i]) vacias[letras[i]] = typeof op[i] === 'string' ? op[i] : '';
    }
    return vacias;
  }
  if (op && typeof op === 'object') {
    return {
      A: str(op.A),
      B: str(op.B),
      C: str(op.C),
      D: str(op.D),
    };
  }
  return vacias;
}

/** Mapea un doc de Firestore al shape exacto del asset questions.jsonl. */
function aJsonl(doc) {
  const op = aOpciones(doc.opciones);
  const base = {
    id: doc.id,
    area: str(doc.area),
    subtema: str(doc.subtema),
    dificultad: str(doc.dificultad, 'media'),
    pregunta: str(doc.pregunta),
    opciones: {
      A: str(op.A),
      B: str(op.B),
      C: str(op.C),
      D: str(op.D),
    },
    respuesta_correcta:
      typeof doc.respuesta_correcta === 'string' && doc.respuesta_correcta.trim()
        ? doc.respuesta_correcta.trim().toUpperCase()
        : null,
    explicacion: str(doc.explicacion),
    fuente: str(doc.fuente),
    tipo_fuente: str(doc.tipo_fuente),
    es_original: doc.es_original === true,
    verificada: doc.verificada === true,
    duplicado: doc.duplicado === true,
    estado: str(doc.estado, 'pendiente'),
  };
  // Campos por área (el banco real los trae así):
  // RL → competencia + contexto · CL → texto_base + tipo_texto.
  // Campos de trazabilidad del dataset original.
  if (doc.competencia !== undefined) base.competencia = str(doc.competencia);
  if (doc.contexto !== undefined) base.contexto = str(doc.contexto);
  if (doc.texto_base !== undefined) base.texto_base = str(doc.texto_base);
  if (doc.tipo_texto !== undefined) base.tipo_texto = str(doc.tipo_texto);
  if (doc.anio !== undefined) base.anio = doc.anio;
  if (doc.pagina !== undefined) base.pagina = doc.pagina;
  if (doc.licencia !== undefined) base.licencia = str(doc.licencia);
  return base;
}

async function main() {
  const opts = args();
  cargarEnv();

  const admin = require('firebase-admin');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  }
  const db = admin.firestore();

  const snap = await db.collection('questions').get();
  let total = 0;
  let exportadas = 0;
  let omitidas = 0;
  const lineas = [];
  const omitidasDetalle = [];

  snap.forEach((d) => {
    const doc = { id: d.id, ...d.data() };
    total++;
    if (opts.estado !== 'all' && doc.estado !== opts.estado) {
      omitidas++;
      return;
    }
    const razones = incompleta(doc);
    if (razones.length > 0 && !opts.includeIncomplete) {
      omitidas++;
      omitidasDetalle.push({ id: doc.id, razones });
      return;
    }
    lineas.push(JSON.stringify(aJsonl(doc)));
    exportadas++;
  });

  const fecha = new Date().toISOString().slice(0, 10);
  const destino =
    opts.out || path.join(__dirname, '..', 'exports', `questions-${fecha}.jsonl`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, lineas.join('\n') + '\n', 'utf-8');

  console.log(`Destino: ${destino}`);
  console.log(`Total en Firestore: ${total}`);
  console.log(`Exportadas (estado=${opts.estado}): ${exportadas}`);
  console.log(`Omitidas: ${omitidas}`);
  if (omitidasDetalle.length > 0) {
    console.log(`Incompletas omitidas (${omitidasDetalle.length}):`);
    for (const o of omitidasDetalle.slice(0, 50)) {
      console.log(`  - ${o.id}: ${o.razones.join(', ')}`);
    }
    if (omitidasDetalle.length > 50) {
      console.log(`  … y ${omitidasDetalle.length - 50} más`);
    }
    console.log('Corríjalas en /panel/preguntas con el filtro "Solo incompletas".');
  }
  console.log(
    'Para usarlo en la app: copie el archivo a rutaUdea/app/src/main/assets/questions/questions.jsonl',
  );
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
