import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { handleCoachAI } from './coach-api.js';

const base = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const GARMIN_API_KEY = process.env.GARMIN_API_KEY;
const OWNER_EMAIL = 'utrefiletti@gmail.com';
const firebaseServiceAccount = JSON.parse(await readFile('/etc/secrets/firebase-service-account.json', 'utf8'));
if (firebaseServiceAccount.project_id !== 'runnerpulse') throw new Error('Il file Firebase appartiene a un progetto diverso da runnerpulse');
initializeApp({ credential: cert(firebaseServiceAccount), projectId: 'runnerpulse' });

const files = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/orange.css':'orange.css','/login.js':'login.js','/coach-memory.js':'coach-memory.js','/login.css':'login.css','/privacy.html':'privacy.html'};
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
function verifiedGoogleIdentity(user){return user.email_verified===true || (user.firebase?.sign_in_provider==='google.com' && user.firebase?.identities?.['google.com']?.length>0);}
async function authorized(req){const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');if(!match)return false;try{const user=await getAuth().verifyIdToken(match[1],true);return verifiedGoogleIdentity(user);}catch(error){console.warn('Firebase token non valido:',error.code||error.message);return false;}}
async function ownerAuthorized(req){const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');if(!match)return false;try{const user=await getAuth().verifyIdToken(match[1],true);return verifiedGoogleIdentity(user)&&user.email?.toLowerCase()===OWNER_EMAIL;}catch{return false;}}
async function readJsonBody(req,maxBytes=4096){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maxBytes){const error=new Error('Richiesta troppo grande');error.status=413;throw error;}chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{const error=new Error('JSON non valido');error.status=400;throw error;}}

const GARMIN_BASE='https://personal.connectapi.garmin.com';
const GARMIN_TOKEN_URL=GARMIN_BASE+'/personalapitoken-service/personal-api/personal-api-key/token';
async function getGarminToken(){if(!GARMIN_API_KEY)throw new Error('Chiave Garmin non configurata');const response=await fetch(GARMIN_TOKEN_URL,{method:'POST',headers:{Authorization:`ApiKey ${GARMIN_API_KEY}`},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`Garmin token HTTP ${response.status}`);const token=(await response.text()).trim();if(!token)throw new Error('Garmin token vuoto');return token;}
async function garminJson(endpoint,token){const response=await fetch(GARMIN_BASE+endpoint,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`Garmin HTTP ${response.status} per ${endpoint.split('?')[0]}`);return response.json();}
async function getGarminActivities(){const token=await getGarminToken();const url=new URL('/activitylist-service/activities/search/activities',GARMIN_BASE);url.searchParams.set('start','0');url.searchParams.set('limit','20');const data=await garminJson(url.pathname+url.search,token);if(!Array.isArray(data))throw new Error('Formato attività Garmin inatteso');return data;}

// FIT global message 19 = Lap. No synthetic laps or sensitive logging.
function fitLaps(bytes){
  if(bytes.length<14)throw new Error('FIT troppo corto');
  const headerSize=bytes.readUInt8(0);
  if(headerSize<12||headerSize>bytes.length-2||bytes.toString('ascii',8,12)!=='.FIT')throw new Error('Intestazione FIT non valida');
  const end=headerSize+bytes.readUInt32LE(4);
  if(end>bytes.length-2)throw new Error('FIT incompleto');
  const defs=new Map(),laps=[];let offset=headerSize;
  function fieldNumber(data,baseType,little){
    const t=baseType&31,n=data.length;
    if(!n)return null;
    let v=null;
    if((t===0||t===2||t===10||t===13)&&n===1)v=data.readUInt8(0);
    else if(t===1&&n===1)v=data.readInt8(0);
    else if((t===3||t===4||t===11)&&n===2)v=little?data.readUInt16LE(0):data.readUInt16BE(0);
    else if(t===5&&n===4)v=little?data.readInt32LE(0):data.readInt32BE(0);
    else if((t===6||t===12)&&n===4)v=little?data.readUInt32LE(0):data.readUInt32BE(0);
    else if(t===8&&n===4)v=little?data.readFloatLE(0):data.readFloatBE(0);
    else if(t===9&&n===8)v=little?data.readDoubleLE(0):data.readDoubleBE(0);
    if(v===null||!Number.isFinite(v))return null;
    const invalid={0:255,1:127,2:255,3:32767,4:65535,5:2147483647,6:4294967295,10:0,11:0,12:0,13:255};
    return v===invalid[t]?null:v;
  }
  while(offset<end){
    const record=bytes.readUInt8(offset++),compressed=Boolean(record&0x80);
    const local=compressed?(record>>5)&3:record&15;
    if(!compressed&&(record&0x40)){
      if(offset+5>end)throw new Error('Definizione FIT incompleta');
      offset++;const architecture=bytes.readUInt8(offset++);
      if(architecture!==0&&architecture!==1)throw new Error('Architettura FIT sconosciuta');
      const little=architecture===0;
      const global=little?bytes.readUInt16LE(offset):bytes.readUInt16BE(offset);offset+=2;
      const count=bytes.readUInt8(offset++),fields=[];
      if(offset+count*3>end)throw new Error('Campi FIT incompleti');
      for(let i=0;i<count;i++){fields.push({id:bytes[offset],size:bytes[offset+1],type:bytes[offset+2]});offset+=3;}
      if(record&0x20){if(offset>=end)throw new Error('Campi sviluppatore FIT incompleti');const n=bytes.readUInt8(offset++);if(offset+n*3>end)throw new Error('Campi sviluppatore FIT incompleti');for(let i=0;i<n;i++){fields.push({id:-1,size:bytes[offset+1],type:13});offset+=3;}}
      defs.set(local,{global,little,fields,length:fields.reduce((n,f)=>n+f.size,0)});
    }else{
      const def=defs.get(local);if(!def)throw new Error('Messaggio FIT senza definizione');
      if(offset+def.length>end)throw new Error('Messaggio FIT incompleto');
      if(def.global===19){
        const values=new Map();let p=offset;
        for(const f of def.fields){if(f.id>=0&&[7,8,9,13].includes(f.id))values.set(f.id,fieldNumber(bytes.subarray(p,p+f.size),f.type,def.little));p+=f.size;}
        const distance=values.get(9),timer=values.get(8),elapsed=values.get(7),avgSpeed=values.get(13);
        laps.push({
          distance:distance===null||distance===undefined?null:distance/100,
          duration:timer!==null&&timer!==undefined?timer/1000:elapsed!==null&&elapsed!==undefined?elapsed/1000:null,
          elapsedDuration:elapsed===null||elapsed===undefined?null:elapsed/1000,
          averageSpeed:avgSpeed===null||avgSpeed===undefined?null:avgSpeed/1000
        });
      }
      offset+=def.length;
    }
  }
  return laps;
}
function fitFromZip(bytes){
  let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(bytes.readUInt32LE(i)===0x06054b50){eocd=i;break;}}
  if(eocd<0)throw new Error('Archivio ZIP non valido');
  const entries=bytes.readUInt16LE(eocd+10);let p=bytes.readUInt32LE(eocd+16);
  for(let i=0;i<entries;i++){
    if(p+46>bytes.length||bytes.readUInt32LE(p)!==0x02014b50)throw new Error('Indice ZIP non valido');
    const method=bytes.readUInt16LE(p+10),compressed=bytes.readUInt32LE(p+20),uncompressed=bytes.readUInt32LE(p+24);
    const nameLen=bytes.readUInt16LE(p+28),extraLen=bytes.readUInt16LE(p+30),commentLen=bytes.readUInt16LE(p+32);
    const name=bytes.toString('utf8',p+46,p+46+nameLen),local=bytes.readUInt32LE(p+42);
    p+=46+nameLen+extraLen+commentLen;
    if(!name.toLowerCase().endsWith('.fit'))continue;
    if(uncompressed>20*1024*1024||compressed>20*1024*1024)throw new Error('FIT supera il limite di 20 MB');
    if(local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50)throw new Error('Voce ZIP non valida');
    const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
    if(start+compressed>bytes.length)throw new Error('ZIP incompleto');
    const raw=bytes.subarray(start,start+compressed);
    const fit=method===0?raw:method===8?inflateRawSync(raw,{maxOutputLength:20*1024*1024}):null;
    if(!fit)throw new Error('Compressione ZIP non supportata');
    if(fit.length!==uncompressed)throw new Error('Dimensione FIT non valida');
    return fit;
  }
  throw new Error('Nessun file FIT nello ZIP');
}
async function diagnoseFit(activityId,token){
  const endpoint=`/download-service/files/activity/${activityId}`;
  try{
    const response=await fetch(GARMIN_BASE+endpoint,{headers:{Authorization:`Bearer ${token}`,Accept:'application/zip, application/octet-stream, */*'},signal:AbortSignal.timeout(25000)});
    if(!response.ok)return {status:'http_error',httpStatus:response.status};
    const declared=Number(response.headers.get('content-length'));
    if(declared>20*1024*1024)return {status:'too_large'};
    const reader=response.body?.getReader();if(!reader)return {status:'empty_body'};
    const chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>20*1024*1024){await reader.cancel();return {status:'too_large'};}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
    const bytes=Buffer.concat(chunks);
    let fit,format;
    if(bytes.length>=12&&bytes.toString('ascii',8,12)==='.FIT'){fit=bytes;format='fit';}
    else if(bytes.length>=4&&bytes.readUInt32LE(0)===0x04034b50){fit=fitFromZip(bytes);format='zip';}
    else return {status:'unexpected_format',contentType:(response.headers.get('content-type')||'').split(';')[0]};
    const laps=fitLaps(fit);return {status:'ok',format,lapCount:laps.length,laps};
  }catch(error){return {status:'parse_or_network_error',reason:error.name==='TimeoutError'?'timeout':String(error.message||error).slice(0,120)};}
}
async function getGarminActivityDetail(activityId){
  const token=await getGarminToken();
  const detail=await garminJson(`/activity-service/activity/${activityId}/details`,token);
  let splits=null,splitsAvailable=false;
  for(const kind of ['splits','laps']){
    try{splits=await garminJson(`/activity-service/activity/${activityId}/${kind}`,token);splitsAvailable=true;break;}
    catch(error){console.warn(`Lap Garmin (${kind}) non disponibili:`,error.message);}
  }
  const fitDiagnostic=await diagnoseFit(activityId,token);
  console.log('Runner Pulse — diagnostica FIT Garmin:',JSON.stringify({status:fitDiagnostic.status,format:fitDiagnostic.format,lapCount:fitDiagnostic.lapCount,httpStatus:fitDiagnostic.httpStatus,reason:fitDiagnostic.reason}));
  if(fitDiagnostic.status==='ok'&&fitDiagnostic.laps?.length){splits={laps:fitDiagnostic.laps};splitsAvailable=true;}
  const {laps:ignored,...fitStatus}=fitDiagnostic;
  return {activityId,detail,splits,splitsAvailable,fitDiagnostic:fitStatus};
}

// Sync a blocchi, riprendibile tra accessi. Le richieste sono autenticate.
const syncLocks = new Set();
async function syncRequest(req,res,pathname){
  if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
  if(!await ownerAuthorized(req))return json(res,403,{success:false,message:'Garmin disponibile soltanto per il proprietario.'});
  const uid=(await getAuth().verifyIdToken(/^Bearer (\S+)$/i.exec(req.headers.authorization)[1],true)).uid;
  if(!GARMIN_API_KEY)return json(res,503,{success:false,message:'Chiave Garmin non configurata'});
  const db=getFirestore(), root=db.collection('runnerPulseGarmin').doc(uid), activities=root.collection('activities');
  if(pathname==='/api/garmin/sync-status'){
    const snap=await root.get(), state=snap.exists?snap.data():{};
    return json(res,200,{success:true,state:{phase:state.phase||'new',discovered:state.discovered||0,processed:state.processed||0,failed:state.failed||0,updatedAt:state.updatedAt||null}});
  }
  if(syncLocks.has(uid))return json(res,409,{success:false,message:'Sincronizzazione già in corso. Riprova tra poco.'});
  syncLocks.add(uid);
  try{
    const snap=await root.get();let state=snap.exists?snap.data():{};
    const now=Date.now();
    // Un nuovo accesso riparte dalla pagina più recente, senza cancellare lo storico salvato.
    // Riavvio esplicito dall'orologio: non elimina le attività già archiviate.
    // Riparte anche dallo stato partial, che altrimenti rimarrebbe bloccato.
    const restart=Boolean((await readJsonBody(req)).restart);
    if(restart||state.phase==='done'||state.phase==='new'||!state.phase){state={phase:'discover',cursor:0,discovered:0,processed:0,failed:0,startedAt:now};}
    if(state.phase==='discover'){
      const token=await getGarminToken();
      const url=new URL('/activitylist-service/activities/search/activities',GARMIN_BASE);
      url.searchParams.set('start',String(state.cursor||0));url.searchParams.set('limit','20');
      const list=await garminJson(url.pathname+url.search,token);
      if(!Array.isArray(list))throw new Error('Elenco Garmin non valido');
      const batch=db.batch();let valid=0;
      for(const a of list){const id=String(a?.activityId??a?.id??'');if(!/^\d{1,20}$/.test(id))continue;
        // Conservarne la scheda riepilogativa originale, senza inventare metriche.
        const ref=activities.doc(id);batch.set(ref,{summary:a,garminId:id,seenAt:now},{merge:true});valid++;
      }
      if(valid)await batch.commit();
      state.cursor=(state.cursor||0)+list.length;state.discovered=(state.discovered||0)+valid;
      if(list.length<20){state.phase='details';state.detailCursor='';}
      state.updatedAt=now;await root.set(state);
      return json(res,200,{success:true,state:{phase:state.phase,discovered:state.discovered,processed:state.processed,failed:state.failed},activities:list});
    }
    if(state.phase==='details'){
      const q=activities.orderBy('__name__').limit(1);
      const query=state.detailCursor?q.startAfter(activities.doc(state.detailCursor)):q;
      const page=await query.get();
      if(page.empty){state.phase=state.failed?'partial':'done';state.updatedAt=now;await root.set(state);return json(res,200,{success:true,state});}
      const doc=page.docs[0],id=doc.id;
      try{
        // Recupera i dettagli reali. FIT/Lap rimangono disponibili dall'endpoint originale.
        const token=await getGarminToken();
        const detail=await garminJson(`/activity-service/activity/${id}/details`,token);
        const serialized=JSON.stringify(detail);
        if(Buffer.byteLength(serialized)>850000)throw new Error('Dettaglio troppo grande per un documento Firestore');
        await doc.ref.set({detail,detailSyncedAt:now,detailError:null},{merge:true});
      }catch(e){state.failed=(state.failed||0)+1;console.warn('Dettaglio Garmin non sincronizzato:',id,e.message);await doc.ref.set({detailError:String(e.message).slice(0,100)},{merge:true});}
      state.detailCursor=id;state.processed=(state.processed||0)+1;state.updatedAt=now;await root.set(state);
      return json(res,200,{success:true,state:{phase:state.phase,discovered:state.discovered,processed:state.processed,failed:state.failed}});
    }
    if(state.phase==='partial')return json(res,200,{success:true,state});
    throw new Error('Stato sincronizzazione non valido');
  }catch(e){console.error('Sync Garmin:',e.message);return json(res,502,{success:false,message:'Sincronizzazione Garmin interrotta: '+e.message});}
  finally{syncLocks.delete(uid);}
}

http.createServer(async(req,res)=>{
  let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{json(res,400,{message:'URL non valido'});return;}
  if(['/api/garmin/sync-status','/api/garmin/sync-step'].includes(pathname)){await syncRequest(req,res,pathname);return;}
  if(pathname==='/api/coach/chat'){await handleCoachAI(req,res,authorized);return;}
  if(pathname==='/api/status'){if(req.method!=='GET'){json(res,405,{message:'Method not allowed'});return;}json(res,200,{garminConfigured:Boolean(GARMIN_API_KEY),garminConnected:false,message:'La connessione Garmin non è ancora verificata. Usa il test autenticato.'});return;}
  if(['/api/garmin/test','/api/garmin/activities','/api/garmin/activity-detail'].includes(pathname)){
    if(req.method!=='POST'){json(res,405,{message:'Method not allowed'});return;}
    if(!await ownerAuthorized(req)){json(res,403,{success:false,message:'Garmin disponibile soltanto per il proprietario.'});return;}
    if(!GARMIN_API_KEY){json(res,503,{success:false,message:'GARMIN_API_KEY non configurata su Render.'});return;}
    try{
      if(pathname==='/api/garmin/test'){await getGarminToken();json(res,200,{success:true,garminConnected:true,message:'Il server ha ottenuto una risposta valida dal servizio token Garmin. Il caricamento delle attività va verificato separatamente.'});}
      else if(pathname==='/api/garmin/activities'){const activities=await getGarminActivities();json(res,200,{success:true,count:activities.length,activities});}
      else{let body;try{body=await readJsonBody(req);}catch(error){json(res,error.status||400,{success:false,message:error.message});return;}const id=String(body?.activityId??'');if(!/^\d{1,20}$/.test(id)){json(res,400,{success:false,message:'activityId non valido: è richiesto un identificativo numerico Garmin.'});return;}const result=await getGarminActivityDetail(id);json(res,200,{success:true,...result});}
    }catch(error){console.error('Errore Garmin:',error.message);json(res,502,{success:false,message:'Richiesta Garmin non riuscita. Controlla i log di Render per il codice di errore.'});}
    return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{message:'Method not allowed'});return;}
  const name=files[pathname];if(!name){res.writeHead(404);res.end('Not found');return;}
  try{const data=await readFile(path.join(base,'public',name));res.writeHead(200,{'Content-Type':types[path.extname(name)],'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);}
  catch(error){console.error('Errore file statico:',pathname,error.code);res.writeHead(error.code==='ENOENT'?404:500);res.end(error.code==='ENOENT'?'Not found':'Server error');}
}).listen(port,'0.0.0.0',()=>console.log('Runner Pulse Web on '+port));
