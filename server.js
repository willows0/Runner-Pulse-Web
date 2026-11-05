import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const base = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const GARMIN_API_KEY = process.env.GARMIN_API_KEY;
const ALLOWED_EMAIL = 'utrefiletti@gmail.com';
const firebaseServiceAccount = JSON.parse(await readFile('/etc/secrets/firebase-service-account.json', 'utf8'));
if (firebaseServiceAccount.project_id !== 'runnerpulse') throw new Error('Il file Firebase appartiene a un progetto diverso da runnerpulse');
initializeApp({ credential: cert(firebaseServiceAccount), projectId: 'runnerpulse' });

const files = {
  '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js',
  '/style.css': 'style.css', '/orange.css': 'orange.css',
  '/login.js': 'login.js', '/login.css': 'login.css', '/privacy.html': 'privacy.html'
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
async function authorized(req) {
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return false;
  try {
    const user = await getAuth().verifyIdToken(match[1], true);
    return user.email_verified === true && user.email?.toLowerCase() === ALLOWED_EMAIL;
  } catch (error) {
    console.warn('Firebase token non valido:', error.code || error.message);
    return false;
  }
}
async function readJsonBody(req, maxBytes = 4096) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) { const error = new Error('Richiesta troppo grande'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const error = new Error('JSON non valido'); error.status = 400; throw error; }
}

const GARMIN_BASE = 'https://personal.connectapi.garmin.com';
const GARMIN_TOKEN_URL = `${GARMIN_BASE}/personalapitoken-service/personal-api/personal-api-key/token`;
async function getGarminToken() {
  if (!GARMIN_API_KEY) throw new Error('Chiave Garmin non configurata');
  const response = await fetch(GARMIN_TOKEN_URL, { method: 'POST', headers: { Authorization: `ApiKey ${GARMIN_API_KEY}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Garmin token HTTP ${response.status}`);
  const token = (await response.text()).trim();
  if (!token) throw new Error('Garmin token vuoto');
  return token;
}
async function garminJson(endpoint, token) {
  const response = await fetch(`${GARMIN_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Garmin HTTP ${response.status} per ${endpoint.split('?')[0]}`);
  return response.json();
}
async function getGarminActivities() {
  const token = await getGarminToken();
  const url = new URL('/activitylist-service/activities/search/activities', GARMIN_BASE);
  url.searchParams.set('start', '0'); url.searchParams.set('limit', '20');
  const data = await garminJson(url.pathname + url.search, token);
  if (!Array.isArray(data)) throw new Error('Formato attività Garmin inatteso');
  return data;
}

// Diagnostica PRIVACY-SAFE: mostra soltanto nomi di campi relativi ai Lap e conteggi.
// Non registra token, coordinate GPS, campioni, valori personali o risposte complete.
function lapShape(value) {
  if (Array.isArray(value)) return { type: 'array', count: value.length };
  if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value).filter(k => /lap|split|interval/i.test(k)).slice(0, 30) };
  return { type: value === null ? 'null' : typeof value };
}
function lapDiagnostics(detail, splits, laps, errors) {
  const topKeys = detail && typeof detail === 'object' ? Object.keys(detail) : [];
  const candidates = {};
  for (const key of topKeys.filter(k => /lap|split|interval/i.test(k)).slice(0, 30)) {
    candidates[key] = lapShape(detail[key]);
  }
  for (const parentKey of ['activity', 'activityDetail', 'summaryDTO', 'activitySummary']) {
    const parent = detail?.[parentKey];
    if (parent && typeof parent === 'object' && !Array.isArray(parent)) {
      for (const key of Object.keys(parent).filter(k => /lap|split|interval/i.test(k)).slice(0, 15)) {
        candidates[`${parentKey}.${key}`] = lapShape(parent[key]);
      }
    }
  }
  return {
    detailTopLevelKeys: topKeys.filter(k => !/token|auth|password|email|location|gps|coordinate|position|lat|lon/i.test(k)).slice(0, 40),
    lapFields: candidates,
    splits: lapShape(splits),
    laps: lapShape(laps),
    endpointErrors: errors
  };
}
async function getGarminActivityDetail(activityId) {
  const token = await getGarminToken();
  const detail = await garminJson(`/activity-service/activity/${activityId}/details`, token);
  let splits = null; let laps = null;
  const errors = {};
  for (const [name, endpoint] of [
    ['splits', `/activity-service/activity/${activityId}/splits`],
    ['laps', `/activity-service/activity/${activityId}/laps`]
  ]) {
    try {
      const result = await garminJson(endpoint, token);
      if (name === 'splits') splits = result; else laps = result;
    } catch (error) {
      // Registra solo il codice HTTP, non l'URL con l'ID dell'attività.
      errors[name] = /HTTP (\d{3})/.exec(error.message)?.[1] || 'errore di rete';
    }
  }
  const diagnostic = lapDiagnostics(detail, splits, laps, errors);
  console.info('Runner Pulse — diagnostica Lap Garmin:', JSON.stringify(diagnostic));
  // Compatibilità con il login.js esistente: la proprietà splits rimane invariata.
  // Se l'endpoint /laps funziona, restituiamo il suo risultato nello stesso campo.
  return { activityId, detail, splits: splits ?? laps, splitsAvailable: splits !== null || laps !== null };
}

http.createServer(async (req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { json(res, 400, { message: 'URL non valido' }); return; }
  if (pathname === '/api/status') {
    if (req.method !== 'GET') { json(res, 405, { message: 'Method not allowed' }); return; }
    json(res, 200, { garminConfigured: Boolean(GARMIN_API_KEY), garminConnected: false, message: 'La connessione Garmin non è ancora verificata. Usa il test autenticato.' });
    return;
  }
  if (pathname === '/api/garmin/test' || pathname === '/api/garmin/activities' || pathname === '/api/garmin/activity-detail') {
    if (req.method !== 'POST') { json(res, 405, { message: 'Method not allowed' }); return; }
    if (!await authorized(req)) { json(res, 403, { success: false, message: 'Accesso Google non autorizzato.' }); return; }
    if (!GARMIN_API_KEY) { json(res, 503, { success: false, message: 'GARMIN_API_KEY non configurata su Render.' }); return; }
    try {
      if (pathname === '/api/garmin/test') {
        await getGarminToken();
        json(res, 200, { success: true, garminConnected: true, message: 'Il server ha ottenuto una risposta valida dal servizio token Garmin. Il caricamento delle attività va verificato separatamente.' });
      } else if (pathname === '/api/garmin/activities') {
        const activities = await getGarminActivities();
        json(res, 200, { success: true, count: activities.length, activities });
      } else {
        let body;
        try { body = await readJsonBody(req); }
        catch (error) { json(res, error.status || 400, { success: false, message: error.message }); return; }
        const id = String(body?.activityId ?? '');
        if (!/^\d{1,20}$/.test(id)) { json(res, 400, { success: false, message: 'activityId non valido: è richiesto un identificativo numerico Garmin.' }); return; }
        const result = await getGarminActivityDetail(id);
        json(res, 200, { success: true, ...result });
      }
    } catch (error) {
      console.error('Errore Garmin:', error.message);
      json(res, 502, { success: false, message: 'Richiesta Garmin non riuscita. Controlla i log di Render per il codice di errore.' });
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { message: 'Method not allowed' }); return; }
  const name = files[pathname];
  if (!name) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(path.join(base, 'public', name));
    res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    console.error('Errore file statico:', pathname, error.code);
    res.writeHead(error.code === 'ENOENT' ? 404 : 500);
    res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
}).listen(port, '0.0.0.0', () => console.log('Runner Pulse Web on ' + port));
