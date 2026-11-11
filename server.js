import {parseGarminArchive} from './garmin-fit-import.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {randomBytes,createHash,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { handleCoachAI, generateWeeklyCoachReport } from './coach-api.js';
import {handleActivityCoach,activityCoachReport} from './activity-coach.js';

const base = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const GARMIN_API_KEY = process.env.GARMIN_API_KEY;
const OWNER_EMAIL = 'utrefiletti@gmail.com';
const firebaseServiceAccount = JSON.parse(await readFile('/etc/secrets/firebase-service-account.json', 'utf8'));
if (firebaseServiceAccount.project_id !== 'runnerpulse') throw new Error('Il file Firebase appartiene a un progetto diverso da runnerpulse');
initializeApp({ credential: cert(firebaseServiceAccount), projectId: 'runnerpulse' });

const files = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/dashboard.js':'dashboard.js','/style.css':'style.css','/orange.css':'orange.css','/login.js':'login.js','/garmin-account.js':'garmin-account.js','/coach-memory.js':'coach-memory.js','/runner-profile.js':'runner-profile.js','/login.css':'login.css','/privacy.html':'privacy.html','/coach-robot.png':'coach-robot.png','/coach-notification.png':'coach-notification.png','/firebase-messaging-sw.js':'firebase-messaging-sw.js','/weekly-push.js':'weekly-push.js'};
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.gif':'image/gif','.ico':'image/x-icon'};
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

// Garmin Business OAuth 2.0 + PKCE. Isolato dalla Personal API esistente.
const GARMIN_CLIENT_ID=process.env.GARMIN_CLIENT_ID;
const GARMIN_CLIENT_SECRET=process.env.GARMIN_CLIENT_SECRET;
const GARMIN_REDIRECT_URI='https://runner-pulse-web.onrender.com/api/garmin/callback';
const GARMIN_AUTH_URL='https://connect.garmin.com/oauth2Confirm';
const GARMIN_OAUTH_TOKEN_URL='https://diauth.garmin.com/di-oauth2-service/oauth/token';
const garminOAuthReady=Boolean(GARMIN_CLIENT_ID&&GARMIN_CLIENT_SECRET);
const garminCryptoKey=GARMIN_CLIENT_SECRET?createHash('sha256').update('runner-pulse-garmin-oauth-tokens-v1\0'+GARMIN_CLIENT_SECRET).digest():null;
function encryptGarminToken(value){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',garminCryptoKey,iv);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return {iv:iv.toString('base64'),data:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
function decryptGarminToken(blob){
 const decipher=createDecipheriv('aes-256-gcm',garminCryptoKey,Buffer.from(blob.iv,'base64'));
 decipher.setAuthTag(Buffer.from(blob.tag,'base64'));
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(blob.data,'base64')),decipher.final()]).toString('utf8'));
}
async function garminGoogleUser(req){
 const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');
 if(!match)return null;
 try{const user=await getAuth().verifyIdToken(match[1],true);return verifiedGoogleIdentity(user)?user:null;}catch{return null;}
}
function garminOAuthDoc(uid){return getFirestore().collection('runnerPulseGarminOAuth').doc(uid);}
async function garminOAuthExchange(params){
 const response=await fetch(GARMIN_OAUTH_TOKEN_URL,{method:'POST',headers:{
  'Content-Type':'application/x-www-form-urlencoded',
  Authorization:'Basic '+Buffer.from(GARMIN_CLIENT_ID+':'+GARMIN_CLIENT_SECRET).toString('base64'),
  Accept:'application/json'
 },body:new URLSearchParams(params),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('Garmin OAuth token HTTP '+response.status);
 const data=await response.json();
 if(typeof data.access_token!=='string'||!data.access_token)throw new Error('Risposta token Garmin non valida');
 return data;
}
async function garminOAuthRoutes(req,res,pathname){
 if(pathname==='/api/garmin/account-status'){
  if(req.method!=='GET')return json(res,405,{success:false,message:'Metodo non consentito'});
  const user=await garminGoogleUser(req);if(!user)return json(res,401,{success:false,message:'Accedi con Google'});
  const doc=await garminOAuthDoc(user.uid).get();
  const connected=garminOAuthReady&&Boolean(doc.data()?.encryptedToken);
  return json(res,200,{success:true,connected,oauthAvailable:garminOAuthReady,accountId:user.uid,
   connectUrl:garminOAuthReady?'/api/garmin/connect':'',
   message:connected?'Dispositivo collegato.':'Nessun dispositivo collegato.'});
 }
 if(pathname==='/api/garmin/connect'){
  if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
  const user=await garminGoogleUser(req);if(!user)return json(res,401,{success:false,message:'Accedi con Google'});
  if(!garminOAuthReady)return json(res,503,{success:false,message:'Credenziali Garmin OAuth mancanti su Render'});
  const state=randomBytes(32).toString('base64url');
  const verifier=randomBytes(48).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const stateHash=createHash('sha256').update(state).digest('hex');
  await getFirestore().collection('runnerPulseGarminOAuthStates').doc(stateHash).create({uid:user.uid,verifier,createdAt:Date.now(),expiresAt:Date.now()+10*60*1000});
  const url=new URL(GARMIN_AUTH_URL);
  for(const [k,v] of Object.entries({client_id:GARMIN_CLIENT_ID,response_type:'code',redirect_uri:GARMIN_REDIRECT_URI,code_challenge:challenge,code_challenge_method:'S256',state}))url.searchParams.set(k,v);
  return json(res,200,{success:true,authorizationUrl:url.toString()});
 }
 if(pathname==='/api/garmin/callback'){
  if(req.method!=='GET')return json(res,405,{success:false,message:'Metodo non consentito'});
  const url=new URL(req.url,'http://localhost');
  const state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'';
  const fail=reason=>{res.writeHead(303,{Location:'/index.html?garmin='+encodeURIComponent(reason),'Cache-Control':'no-store'});res.end();};
  if(!/^[A-Za-z0-9_-]{40,100}$/.test(state))return fail('invalid_state');
  const ref=getFirestore().collection('runnerPulseGarminOAuthStates').doc(createHash('sha256').update(state).digest('hex'));
  // Claim state atomically: a callback can only be used once.
  const pending=await getFirestore().runTransaction(async tx=>{
   const doc=await tx.get(ref);if(!doc.exists)return null;
   tx.delete(ref);return doc.data();
  });
  if(!pending||Date.now()>pending.expiresAt)return fail('expired');
  if(url.searchParams.has('error')||!code)return fail('denied');
  try{
   const token=await garminOAuthExchange({grant_type:'authorization_code',client_id:GARMIN_CLIENT_ID,code,redirect_uri:GARMIN_REDIRECT_URI,code_verifier:pending.verifier});
   await garminOAuthDoc(pending.uid).set({encryptedToken:encryptGarminToken(token),connectedAt:Date.now(),updatedAt:Date.now()},{merge:true});
   return fail('connected');
  }catch(error){console.error('Garmin OAuth callback:',error.message);return fail('token_error');}
 }
 if(pathname==='/api/garmin/disconnect'){
  if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
  const user=await garminGoogleUser(req);if(!user)return json(res,401,{success:false,message:'Accedi con Google'});
  const ref=garminOAuthDoc(user.uid),doc=await ref.get();
  if(!doc.exists||!doc.data()?.encryptedToken)return json(res,200,{success:true,connected:false});
  try{
   let token=decryptGarminToken(doc.data().encryptedToken);
   if(token.refresh_token&&token.expires_in&&Date.now()-doc.data().updatedAt>Math.max(0,Number(token.expires_in)-300)*1000){
    token=await garminOAuthExchange({grant_type:'refresh_token',refresh_token:token.refresh_token,client_id:GARMIN_CLIENT_ID});
    await ref.set({encryptedToken:encryptGarminToken(token),updatedAt:Date.now()},{merge:true});
   }
   const response=await fetch('https://apis.garmin.com/wellness-api/rest/user/registration',{method:'DELETE',headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error('Garmin revoke HTTP '+response.status);
   await ref.delete();return json(res,200,{success:true,connected:false});
  }catch(error){console.warn('Garmin disconnect:',error.message);return json(res,502,{success:false,message:'Scollegamento Garmin non riuscito. Riprova più tardi.'});}
 }
}

// Garmin official identity: retrieved from Garmin itself using the user's OAuth token.
// This never uses the legacy Personal API key. If Garmin does not return a user ID,
// automatic import remains blocked rather than attributing data to the wrong person.
async function officialGarminIdentity(uid){
 const ref=garminOAuthDoc(uid),snap=await ref.get();
 if(!snap.exists||!snap.data()?.encryptedToken)return null;
 let token=decryptGarminToken(snap.data().encryptedToken);
 if(token.refresh_token&&token.expires_in&&Date.now()-snap.data().updatedAt>Math.max(0,Number(token.expires_in)-300)*1000){
  token=await garminOAuthExchange({grant_type:'refresh_token',refresh_token:token.refresh_token,client_id:GARMIN_CLIENT_ID});
  await ref.set({encryptedToken:encryptGarminToken(token),updatedAt:Date.now()},{merge:true});
 }
 const response=await fetch('https://apis.garmin.com/wellness-api/rest/user/id',{headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('Garmin user identity HTTP '+response.status);
 const result=await response.json();
 const id=result?.userId;
 if(typeof id!=='string'||!id||id.length>150)throw new Error('Garmin user identity unavailable');
 return id;
}
async function officialSyncStatus(req,res){
 if(req.method!=='GET')return json(res,405,{success:false,message:'Metodo non consentito'});
 const user=await garminGoogleUser(req);if(!user)return json(res,401,{success:false,message:'Accedi con Google'});
 const oauth=await garminOAuthDoc(user.uid).get();
 const state=(await getFirestore().collection('runnerPulseGarminOfficialSync').doc(user.uid).get()).data()||{};
 return json(res,200,{success:true,connected:Boolean(oauth.data()?.encryptedToken),
  received:state.received||0,imported:state.imported||0,duplicates:state.duplicates||0,
  lastReceivedAt:state.lastReceivedAt||null,lastImportedAt:state.lastImportedAt||null,
  mode:'push',status:state.status||'awaiting_endpoint',
  message:'I dati sono importati solo dopo la verifica dell’identità Garmin. La Personal API resta indipendente.'});
}
// Explicit owner action establishes the Garmin userId <-> Firebase UID association.
async function officialVerifyIdentity(req,res){
 if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
 const user=await garminGoogleUser(req);if(!user)return json(res,401,{success:false,message:'Accedi con Google'});
 try{
  const id=await officialGarminIdentity(user.uid);
  if(!id)return json(res,409,{success:false,message:'Collega prima Garmin'});
  const db=getFirestore();
  const mapping=db.collection('runnerPulseGarminOfficialUsers').doc(createHash('sha256').update(id).digest('hex'));
  await db.runTransaction(async tx=>{
   const doc=await tx.get(mapping);
   if(doc.exists&&doc.data()?.uid!==user.uid)throw new Error('Garmin già associato a un altro account');
   tx.set(mapping,{uid:user.uid,garminUserId:id,verifiedAt:Date.now()},{merge:true});
  });
  await db.collection('runnerPulseGarminOfficialSync').doc(user.uid).set({status:'identity_verified',verifiedAt:Date.now()},{merge:true});
  return json(res,200,{success:true,message:'Identità Garmin verificata. In attesa di notifiche ufficiali.'});
 }catch(error){console.warn('Garmin official identity:',error.message);return json(res,502,{success:false,message:'Verifica identità Garmin non riuscita. Nessun dato è stato importato.'});}
}
// Notification ingestion is intentionally conservative: only Garmin's known
// Activity API push summaries with a previously verified Garmin userId are imported.
// Usa le registrazioni FCM esistenti del resoconto settimanale.
// Nessun dato sanitario nel payload; invio solo dopo salvataggio dell'analisi.
async function notifyActivityCoachReady(uid,id){
 const db=getFirestore();
 const root=db.collection('runnerPulsePush').doc(uid);
 const marker=root.collection('activityNotifications').doc(String(id));
 const shouldSend=await db.runTransaction(async tx=>{
  const prior=await tx.get(marker);
  if(prior.exists)return false;
  tx.create(marker,{status:'started',createdAt:new Date()});return true;
 });
 if(!shouldSend)return;
 try{
  const snap=await root.collection('devices').where('enabled','==',true).get();
  const tokens=snap.docs.map(d=>d.data().token).filter(Boolean);
  let delivered=0,failed=0;
  for(let i=0;i<tokens.length;i+=500){
   const batch=tokens.slice(i,i+500);
   const result=await getMessaging().sendEachForMulticast({
    tokens:batch,
    data:{title:'Runner Pulse · Coach AI',body:'🏃 Allenamento analizzato! Tocca per leggere il giudizio del Coach.',tag:'runnerpulse-activity-'+id,url:'/index.html?coachActivity='+encodeURIComponent(id)},
    webpush:{headers:{Urgency:'high',TTL:'86400'}}
   });
   delivered+=result.successCount;failed+=result.failureCount;
   for(let j=0;j<result.responses.length;j++)if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(result.responses[j].error?.code)){
    await root.collection('devices').doc(createHash('sha256').update(batch[j]).digest('hex')).delete();
   }
  }
  await marker.set({status:'finished',delivered,failed,completedAt:new Date()},{merge:true});
 }catch(error){
  await marker.delete().catch(()=>{});
  throw error;
 }
}
// Una sola analisi AI per volta: limita i picchi di memoria sul piano Render gratuito.
// Gli eventi Garmin vengono comunque salvati prima in Firestore.
const pendingCoachJobs=[];
const queuedCoachIds=new Set();
let coachWorkerRunning=false;
function scheduleActivityCoach(uid,id){
 const key=uid+':'+id;
 if(queuedCoachIds.has(key))return;
 if(pendingCoachJobs.length>=100){
  console.warn('Garmin Coach: coda piena; allenamento salvato, analisi recuperabile dalla scheda Coach AI');
  return;
 }
 queuedCoachIds.add(key);
 pendingCoachJobs.push({uid,id,key});
 if(!coachWorkerRunning)setImmediate(processCoachJobs);
}
async function processCoachJobs(){
 if(coachWorkerRunning)return;
 coachWorkerRunning=true;
 try{
  while(pendingCoachJobs.length){
   const job=pendingCoachJobs.shift();
   try{
    await activityCoachReport(job.uid,job.id);
    await notifyActivityCoachReady(job.uid,job.id);
    await getFirestore().collection('runnerPulseCoachRetries').doc(job.uid).collection('activities').doc(job.id).delete().catch(()=>{});
    console.info('Garmin Coach: analisi completata e invio notifica elaborato');
   }catch(error){
    console.warn('Garmin Coach: analisi/notifica non riuscita:',error.name||'Error',error.status||'');
    // Conserva il lavoro fallito in Firestore, anche se Render viene riavviato.
    try{
     const ref=getFirestore().collection('runnerPulseCoachRetries').doc(job.uid).collection('activities').doc(job.id);
     const previous=(await ref.get()).data()||{};
     const attempts=Math.min(20,(Number(previous.attempts)||0)+1);
     await ref.set({attempts,nextAttemptAt:Date.now()+Math.min(60*60*1000,5*60*1000*2**Math.min(attempts-1,4)),updatedAt:Date.now(),lastErrorStatus:error.status||null},{merge:true});
    }catch(saveError){console.warn('Garmin Coach: salvataggio tentativo non riuscito:',saveError.message);}
   }
   finally{queuedCoachIds.delete(job.key);}
  }
 }finally{coachWorkerRunning=false;}
}

async function importOfficialActivities(payload){
 // Garmin invia le notifiche come array activities; non attribuire mai dati senza userId verificato.
 const entries=Array.isArray(payload?.activities)?payload.activities:[];
 const db=getFirestore();let imported=0,duplicates=0,unmatched=0,invalid=0;
 for(const a of entries.slice(0,100)){
  if(!a||typeof a!=='object'||Array.isArray(a)){invalid++;continue;}
  const id=String(a.activityId??'');const userId=a.userId;
  if(!/^\d{1,20}$/.test(id)||typeof userId!=='string'||!userId||userId.length>150){invalid++;continue;}
  const mapping=await db.collection('runnerPulseGarminOfficialUsers').doc(createHash('sha256').update(userId).digest('hex')).get();
  if(!mapping.exists||mapping.data()?.garminUserId!==userId){unmatched++;continue;}
  const uid=mapping.data().uid;
  const oauth=await garminOAuthDoc(uid).get();if(!oauth.data()?.encryptedToken){unmatched++;continue;}
  const now=Date.now(),root=db.collection('runnerPulseGarmin').doc(uid),ref=root.collection('activities').doc(id);
  const created=await db.runTransaction(async tx=>{
   const removed=await tx.get(root.collection('deletedActivities').doc(id));if(removed.exists)return false;
   const existing=await tx.get(ref);if(existing.exists)return false;
   tx.create(ref,{summary:a,garminId:id,seenAt:now,source:'garmin-official-activity-api'});return true;
  });
  await db.collection('runnerPulseGarminOfficialSync').doc(uid).set({
   received:(await import('firebase-admin/firestore')).FieldValue.increment(1),
   imported:(await import('firebase-admin/firestore')).FieldValue.increment(created?1:0),
   duplicates:(await import('firebase-admin/firestore')).FieldValue.increment(created?0:1),
   lastReceivedAt:now,...(created?{lastImportedAt:now}:{}),status:'receiving'
  },{merge:true});
  if(created){imported++;scheduleActivityCoach(uid,id);}else duplicates++;
 }
 return {imported,duplicates,unmatched,invalid,received:entries.length};
}

// Garmin Connect push: dettagli e dati Health. Conserva solo eventi associati a utenti OAuth verificati.
// Activity Files: conserva il riferimento al file, NON lo interpreta come FIT scaricato.
const GARMIN_EXTRA_SECTIONS={activityDetails:'activity-details',activityFiles:'activity-files',dailies:'dailies',sleeps:'sleeps'};
async function importGarminExtraSections(payload){
 const db=getFirestore();const counts={stored:0,unmatched:0,invalid:0,bySection:{}};
 for(const [section,kind] of Object.entries(GARMIN_EXTRA_SECTIONS)){
  const entries=Array.isArray(payload?.[section])?payload[section]:[];
  counts.bySection[section]=entries.length;
  for(const entry of entries.slice(0,100)){
   if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.userId!=='string'||!entry.userId||entry.userId.length>150){counts.invalid++;continue;}
   const mapping=await db.collection('runnerPulseGarminOfficialUsers').doc(createHash('sha256').update(entry.userId).digest('hex')).get();
   if(!mapping.exists||mapping.data()?.garminUserId!==entry.userId){counts.unmatched++;continue;}
   const uid=mapping.data().uid;
   if(!(await garminOAuthDoc(uid).get()).data()?.encryptedToken){counts.unmatched++;continue;}
   const activityId=String(entry.activityId??'');
   const isActivity=section==='activityDetails'||section==='activityFiles';
   if(isActivity&&!/^\d{1,20}$/.test(activityId)){counts.invalid++;continue;}
   const serialized=JSON.stringify(entry);
   // Firestore ha un limite di 1 MiB per documento; non troncare mai i dati FIT o le serie.
   if(Buffer.byteLength(serialized,'utf8')>750000){counts.invalid++;continue;}
   const now=Date.now();
   if(isActivity){
    const ref=db.collection('runnerPulseGarmin').doc(uid).collection('activities').doc(activityId);
    if((await db.collection('runnerPulseGarmin').doc(uid).collection('deletedActivities').doc(activityId).get()).exists)continue;
    // Non creare falsi riepiloghi e non sovrascrivere il documento esistente.
    if(!(await ref.get()).exists){counts.unmatched++;continue;}
    const key=section==='activityDetails'?'officialActivityDetails':'officialActivityFileNotification';
    await ref.set({[key]:entry,[key+'ReceivedAt']:now},{merge:true});
   }else{
    const start=String(entry.calendarDate??entry.startTimeInSeconds??entry.startTimeGMT??entry.startTimeLocal??'');
    const id=createHash('sha256').update(section+'|'+entry.userId+'|'+start+'|'+serialized).digest('hex');
    await db.collection('runnerPulseGarminHealth').doc(uid).collection(kind).doc(id).set({data:entry,receivedAt:now,source:'garmin-official-push'},{merge:true});
   }
   counts.stored++;
  }
 }
 return counts;
}

// Ritenta le analisi fallite dopo errori temporanei (es. Gemini HTTP 503).
// Il recupero legge solo lavori realmente registrati: non crea allenamenti né giudizi fittizi.
let coachRetryScanning=false;
async function retryPendingCoachJobs(){
 if(coachRetryScanning)return;
 coachRetryScanning=true;
 try{
  const db=getFirestore();
  const now=Date.now();
  const users=await db.collection('runnerPulseCoachRetries').listDocuments();
  for(const user of users.slice(0,20)){
   const pending=await user.collection('activities').where('nextAttemptAt','<=',now).limit(30).get();
   for(const doc of pending.docs){
   const uid=user.id,id=doc.id;
   if((Number(doc.data().attempts)||0)>=12)continue;
   // Sposta il prossimo tentativo prima di accodare, per evitare duplicati tra scansioni.
   await doc.ref.set({nextAttemptAt:now+5*60*1000},{merge:true});
   scheduleActivityCoach(uid,id);
   }
  }
 }catch(error){console.warn('Garmin Coach: ricerca tentativi:',error.message);}
 finally{coachRetryScanning=false;}
}
setInterval(()=>{void retryPendingCoachJobs();},5*60*1000).unref?.();
setTimeout(()=>{void retryPendingCoachJobs();},30*1000).unref?.();
// Recupero non distruttivo degli eventi Garmin gia ricevuti: l'importazione e idempotente.
// Il recupero non chiama Garmin, non crea dati fittizi e non cancella lo storico.
let webhookRecoveryRunning=false;
async function recoverGarminWebhookInbox(){
 if(webhookRecoveryRunning)return;
 webhookRecoveryRunning=true;
 try{
  const db=getFirestore();
  const inbox=db.collection('runnerPulseGarminWebhookInbox');
  let inspected=0,recovered=0,unmatched=0,failed=0;
  for(const status of ['pending_verification','import_failed','partial_unmatched']){
   const snap=await inbox.where('status','==',status).limit(20).get();
   for(const doc of snap.docs){
    inspected++;
    const event=doc.data();
    if(!event?.payload||typeof event.payload!=='object')continue;
    try{
     const result=await importOfficialActivities(event.payload);
     const extra=await importGarminExtraSections(event.payload);
     recovered+=result.imported+extra.stored;unmatched+=result.unmatched+extra.unmatched;
     await doc.ref.update({status:result.unmatched||result.invalid?'partial_unmatched':'processed',...result,processedAt:Date.now()});
    }catch(error){failed++;console.warn('Garmin recupero inbox:',error.name||'Error');}
   }
  }
  console.info('Garmin recupero webhook:',JSON.stringify({inspected,recovered,unmatched,failed}));
 }catch(error){console.warn('Garmin recupero webhook non disponibile:',error.name||'Error');}
 finally{webhookRecoveryRunning=false;}
}
async function garminWebhookDiagnostics(req,res){
 if(req.method!=='GET')return json(res,405,{success:false,message:'Metodo non consentito'});
 const user=await garminGoogleUser(req);if(!user)return json(res,401,{success:false,message:'Accedi con Google'});
 try{
  const db=getFirestore();
  const state=(await db.collection('runnerPulseGarminOfficialSync').doc(user.uid).get()).data()||{};
  // Stato aggregato: non esponiamo payload, token, ID Garmin o dati di altri utenti.
  const latest=await db.collection('runnerPulseGarminWebhookInbox').orderBy('receivedAt','desc').limit(1).get();
  const last=latest.empty?null:latest.docs[0].data();
  return json(res,200,{success:true,connected:Boolean((await garminOAuthDoc(user.uid).get()).data()?.encryptedToken),
   imported:state.imported||0,duplicates:state.duplicates||0,lastImportedAt:state.lastImportedAt||null,
   lastWebhookAt:last?.receivedAt||null,lastWebhookStatus:last?.status||'none',
   lastWebhookCounts:last?{received:last.received??null,imported:last.imported??null,unmatched:last.unmatched??null,invalid:last.invalid??null}:null,
   note:'La diagnostica webhook e globale al servizio e non mostra dati personali.'});
 }catch(error){console.warn('Garmin diagnostica:',error.name||'Error');return json(res,503,{success:false,message:'Diagnostica temporaneamente non disponibile'});}
}
// Garmin Activity API webhook intake (push). Isolato dalla Personal API.
// IMPORTANTE: ricevere un evento non significa che sia gia stato verificato,
// associato a un utente o importato nello storico. Non mostrare dati non verificati.
const GARMIN_WEBHOOK_SECRET=(process.env.GARMIN_WEBHOOK_SECRET||'').trim();
const GARMIN_WEBHOOK_PATH='/api/garmin/webhook/'+GARMIN_WEBHOOK_SECRET;
function secureEqual(a,b){
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
async function receiveGarminWebhook(req,res,pathname){
 if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
 if(!GARMIN_WEBHOOK_SECRET||GARMIN_WEBHOOK_SECRET.length<32||!secureEqual(pathname,GARMIN_WEBHOOK_PATH)){
  console.warn('Garmin webhook: percorso non riconosciuto (nessun token registrato)');
  return json(res,404,{success:false,message:'Not found'});
 }
 const mime=(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
 if(mime!=='application/json')return json(res,415,{success:false,message:'JSON richiesto'});
 let payload;
 try{payload=await readJsonBody(req,256*1024);}
 catch(e){return json(res,e.status||400,{success:false,message:e.message});}
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return json(res,400,{success:false,message:'Formato non valido'});
 // Diagnostica: solo nomi delle sezioni e conteggi, mai identificativi o dati sanitari.
 console.info('Garmin webhook ricevuto:',JSON.stringify({sections:Object.keys(payload).slice(0,12),activities:Array.isArray(payload.activities)?payload.activities.length:null}));
 let inbox;
 try{
  inbox=getFirestore().collection('runnerPulseGarminWebhookInbox').doc(randomBytes(16).toString('hex'));
  await inbox.create({receivedAt:Date.now(),source:'garmin-activity-api',status:'pending_verification',payload});
 }catch(e){console.error('Garmin webhook salvataggio:',e.name||'Error');return json(res,503,{success:false,message:'Salvataggio temporaneamente non disponibile'});}
 try{
  const result=await importOfficialActivities(payload);
  const extra=await importGarminExtraSections(payload);
  await inbox.update({status:result.unmatched||result.invalid||extra.unmatched||extra.invalid?'partial_unmatched':'processed',...result,extra,processedAt:Date.now()});
  console.info('Garmin webhook elaborato:',JSON.stringify(result));
  // Non dichiarare l'importazione riuscita se nessuna attività è stata riconosciuta.
  return json(res,202,{success:true,received:true,...result});
 }catch(e){
  console.error('Garmin webhook importazione:',e.name||'Error');
  await inbox.update({status:'import_failed',errorAt:Date.now()}).catch(()=>{});
  // Garmin può ritentare su 503; l'archivio inbox conserva la richiesta per diagnosi.
  return json(res,503,{success:false,message:'Importazione temporaneamente non disponibile'});
 }
}

// Garmin Connect Personal API: riepiloghi salute, solo per il proprietario.
// I parametri sono quelli documentati nello Swagger Personal API.
async function getGarminDailySummaries(startDate,endDate){
  const token=await getGarminToken();
  const params=new URLSearchParams({startDate,endDate});
  const result=await garminJson('/usersummary-service/v2/dailysummaries?'+params,token);
  // Diagnostica senza valori sanitari, token, ID o date nei log.
  const responseType=Array.isArray(result)?'array':result===null?'null':typeof result;
  const topLevelKeys=result&&typeof result==='object'&&!Array.isArray(result)?Object.keys(result).slice(0,30):[];
  const summaries=Array.isArray(result?.data)?result.data:null;
  const first=summaries?.find(item=>item&&typeof item==='object'&&!Array.isArray(item));
  const diagnostic={responseType,topLevelKeys,summaryCount:summaries?.length??null,firstSummaryKeys:first?Object.keys(first).slice(0,80):[]};
  // Registra esclusivamente presenza e tipologia dei valori: mai misure, date o identificativi.
  const sections=['heartRate','calories','intensityMinutes','stress','bodyBattery','sleep','steps','hydration','respiration','pulseOx'];
  function inspectSection(value){
    if(value===null||value===undefined)return {present:false,kind:'missing',numericFields:0};
    if(typeof value==='number')return {present:true,kind:'number',numericFields:Number.isFinite(value)?1:0};
    if(typeof value!=='object')return {present:true,kind:typeof value,numericFields:0};
    const seen=new WeakSet();let numericFields=0;
    function visit(item,depth){
      if(depth>3||numericFields>100)return;
      if(typeof item==='number'&&Number.isFinite(item)){numericFields++;return;}
      if(!item||typeof item!=='object'||seen.has(item))return;
      seen.add(item);
      for(const child of Object.values(item).slice(0,100))visit(child,depth+1);
    }
    visit(value,0);
    return {present:true,kind:Array.isArray(value)?'array':'object',numericFields};
  }
  const valueDiagnostic={summaryCount:summaries?.length??null,bySummary:(summaries||[]).slice(0,7).map(item=>{
    const output={};
    for(const name of sections)output[name]=inspectSection(item&&typeof item==='object'?item[name]:undefined);
    return output;
  })};
  // Nomi dei campi soltanto, per identificare lo schema effettivo senza dati sanitari.
  const firstSummary=summaries?.find(x=>x&&typeof x==='object');
  if(firstSummary){
    const fieldNames={};
    for(const section of ['heartRate','calories','intensityMinutes','stress','bodyBattery','movement','steps','sleep']){
      const item=firstSummary[section];
      fieldNames[section]=item&&typeof item==='object'&&!Array.isArray(item)?Object.keys(item).slice(0,35):[];
    }
    console.info('Runner Pulse Garmin salute — nomi campi:',JSON.stringify(fieldNames));
  }
  console.info('Runner Pulse Garmin salute — diagnostica presenza valori:',JSON.stringify(valueDiagnostic));
  console.info('Runner Pulse Garmin salute — diagnostica struttura:',JSON.stringify(diagnostic));
  if(!summaries)throw new Error('Formato riepiloghi giornalieri Garmin inatteso (vedi diagnostica struttura nei log Render)');
  return {summaries,diagnostic};
}

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
    if(uncompressed>4*1024*1024||compressed>4*1024*1024)throw new Error('FIT supera il limite di 20 MB');
    if(local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50)throw new Error('Voce ZIP non valida');
    const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
    if(start+compressed>bytes.length)throw new Error('ZIP incompleto');
    const raw=bytes.subarray(start,start+compressed);
    const fit=method===0?raw:method===8?inflateRawSync(raw,{maxOutputLength:4*1024*1024}):null;
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
    if(declared>4*1024*1024)return {status:'too_large'};
    const reader=response.body?.getReader();if(!reader)return {status:'empty_body'};
    const chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4*1024*1024){await reader.cancel();return {status:'too_large'};}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
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
        const ref=activities.doc(id);const removed=await root.collection('deletedActivities').doc(id).get();if(removed.exists)continue;batch.set(ref,{summary:a,garminId:id,seenAt:now},{merge:true});valid++;
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


// Verifica riservata al proprietario: cerca SOLO campi VO2 espliciti nei dati
// Garmin gia' archiviati; testa l'accessibilita' di un FIT senza attribuirgli
// valori non decodificati. Non espone documenti o dati grezzi.
function findExplicitGarminVo2(obj){
  const seen=new WeakSet();
  function visit(x,depth){
    if(!x||typeof x!=='object'||depth>7||seen.has(x))return null;
    seen.add(x);
    for(const [key,value] of Object.entries(x)){
      if(/^(vo2max|vo2maxvalue|runningvo2max|vo2maxrunning|vo2maxrunningvalue)$/i.test(key.replace(/[_\s-]/g,''))){
        const n=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
        if(Number.isFinite(n)&&n>=20&&n<=90)return n;
      }
    }
    for(const value of Object.values(x))if(value&&typeof value==='object'){
      const found=visit(value,depth+1);if(found!==null)return found;
    }
    return null;
  }
  return visit(obj,0);
}
async function garminVo2Check(req,res){
  if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
  if(!await ownerAuthorized(req))return json(res,403,{success:false,message:'Solo proprietario'});
  try{
    const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');
    const user=await getAuth().verifyIdToken(match[1],true);
    const col=getFirestore().collection('runnerPulseGarmin').doc(user.uid).collection('activities');
    const docs=await col.limit(250).get();
    let checked=0,found=null,fitId=null;
    for(const doc of docs.docs){
      const data=doc.data();checked++;
      const value=findExplicitGarminVo2(data.summary)||findExplicitGarminVo2(data.detail);
      if(value!==null){found={value,source:'Garmin: dati attività archiviati'};break;}
      if(!fitId&&/^\d{1,20}$/.test(doc.id))fitId=doc.id;
    }
    let fitStatus='not_checked';
    if(found===null&&fitId&&GARMIN_API_KEY){
      const token=await getGarminToken();
      const diagnostic=await diagnoseFit(fitId,token);
      fitStatus=diagnostic.status;
    }
    return json(res,200,{success:true,found,checked,fitStatus,
      message:found?'Valore Garmin esplicito trovato nei dati archiviati.':'Nessun VO₂ max esplicito trovato nei dati archiviati. La verifica FIT riguarda soltanto l’accessibilità del file: non ne decodifica ancora il VO₂ max.'});
  }catch(error){console.warn('Verifica VO2 Garmin:',error.message);return json(res,502,{success:false,message:'Verifica Garmin non riuscita: '+error.message});}
}


// Notifiche settimanali: token FCM privati, cron protetto, nessun dato sanitario nel payload.
async function weeklyPushRoute(req,res,pathname){
 if(pathname==='/api/push/subscribe'){
  if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
  const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');
  if(!match)return json(res,401,{success:false,message:'Accesso richiesto'});
  let user;try{user=await getAuth().verifyIdToken(match[1],true);}catch{return json(res,401,{success:false,message:'Sessione non valida'});}
  if(!verifiedGoogleIdentity(user)||user.email?.toLowerCase()!==OWNER_EMAIL)return json(res,403,{success:false,message:'Solo proprietario'});
  try{
   const body=await readJsonBody(req,4096);
   if(typeof body.token!=='string'||body.token.length<50||body.token.length>3000)return json(res,400,{success:false,message:'Token push non valido'});
   const crypto=await import('node:crypto');const id=crypto.createHash('sha256').update(body.token).digest('hex');
   await getFirestore().collection('runnerPulsePush').doc(user.uid).collection('devices').doc(id).set({token:body.token,updatedAt:new Date(),enabled:true},{merge:true});
   return json(res,200,{success:true});
  }catch(error){console.error('Push subscribe:',error.message);return json(res,500,{success:false,message:'Registrazione notifica non riuscita'});}
 }
 if(pathname==='/api/push/unsubscribe' || pathname==='/api/push/status'){
  if(pathname==='/api/push/unsubscribe' && req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
  if(pathname==='/api/push/status' && req.method!=='GET')return json(res,405,{success:false,message:'Metodo non consentito'});
  const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');
  if(!match)return json(res,401,{success:false,message:'Accesso richiesto'});
  let user;try{user=await getAuth().verifyIdToken(match[1],true);}catch{return json(res,401,{success:false,message:'Sessione non valida'});}
  if(!verifiedGoogleIdentity(user)||user.email?.toLowerCase()!==OWNER_EMAIL)return json(res,403,{success:false,message:'Solo proprietario'});
  try{
   const crypto=await import('node:crypto');
   const token=pathname==='/api/push/status' ? new URL(req.url,'http://localhost').searchParams.get('token') : (await readJsonBody(req,4096)).token;
   if(typeof token!=='string'||token.length<50||token.length>3000)return json(res,400,{success:false,message:'Token non valido'});
   const id=crypto.createHash('sha256').update(token).digest('hex');
   const ref=getFirestore().collection('runnerPulsePush').doc(user.uid).collection('devices').doc(id);
   if(pathname==='/api/push/status'){
    const doc=await ref.get();return json(res,200,{success:true,enabled:doc.exists && doc.data()?.enabled===true});
   }
   await ref.delete();return json(res,200,{success:true,enabled:false});
  }catch(error){console.error('Push settings:',error.message);return json(res,500,{success:false,message:'Impossibile aggiornare le notifiche'});}
 }
 if(pathname==='/api/push/test'){
  if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
  if(!await ownerAuthorized(req))return json(res,403,{success:false,message:'Accesso riservato al proprietario'});
  try{
   const owner=await getAuth().getUserByEmail(OWNER_EMAIL);
   const db=getFirestore();const root=db.collection('runnerPulsePush').doc(owner.uid);
   const snap=await root.collection('devices').where('enabled','==',true).get();
   const tokens=[...new Set(snap.docs.map(d=>d.data().token).filter(Boolean))];
   if(!tokens.length)return json(res,409,{success:false,message:'Nessun telefono registrato. Premi prima Attiva notifiche Coach.'});
   const throttle=root.collection('settings').doc('testThrottle');
   const allowed=await db.runTransaction(async tx=>{
    const doc=await tx.get(throttle);
    const last=doc.data()?.at?.toMillis?.()||0;
    if(Date.now()-last<60000)return false;
    tx.set(throttle,{at:new Date()});return true;
   });
   if(!allowed)return json(res,429,{success:false,message:'Attendi un minuto prima di ripetere il test.'});
   let delivered=0,failed=0;
   for(let i=0;i<tokens.length;i+=500){
    const batch=tokens.slice(i,i+500);
    const result=await getMessaging().sendEachForMulticast({
     tokens:batch,
     data:{title:'Runner Pulse · Coach AI',body:'🤖 Notifica di prova! Le notifiche del tuo allenatore sono collegate.',tag:'runnerpulse-push-test',url:'/index.html?weeklyCoach=1'},
     webpush:{headers:{Urgency:'high',TTL:'3600'}}
    });
    delivered+=result.successCount;failed+=result.failureCount;
    for(let j=0;j<result.responses.length;j++)if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(result.responses[j].error?.code)){
     const crypto=await import('node:crypto');const id=crypto.createHash('sha256').update(batch[j]).digest('hex');await root.collection('devices').doc(id).delete();
    }
   }
   return json(res,200,{success:delivered>0,delivered,failed,message:delivered>0?'Firebase ha accettato '+delivered+' invio/i. Controlla le notifiche Android.':'Firebase non ha accettato la notifica. Riattiva le notifiche Coach.'});
  }catch(error){console.error('Push test:',error.code||error.message);return json(res,500,{success:false,message:'Test non riuscito. Controlla i log di Render.'});}
 }
 if(pathname==='/api/push/weekly'){
  if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
  const secret=process.env.RUNNER_PULSE_CRON_SECRET;
  if(!secret||req.headers['x-cron-secret']!==secret)return json(res,403,{success:false,message:'Non autorizzato'});
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const get=k=>parts.find(p=>p.type===k)?.value;
  const testMode=req.headers['x-runner-pulse-test']==='weekly-report-test';
  if(!testMode&&(get('weekday')!=='Sun'||get('hour')!=='20'))return json(res,409,{success:false,message:'Invio consentito soltanto domenica alle 20:00 ora italiana'});
  try{
   const owner=await getAuth().getUserByEmail(OWNER_EMAIL);
   const db=getFirestore();const week=`${get('year')}-${get('month')}-${get('day')}`;
   const run=db.collection('runnerPulsePush').doc(owner.uid).collection('weeklyRuns').doc(testMode?`test-${week}`:week);
   const shouldSend=await db.runTransaction(async tx=>{const d=await tx.get(run);if(d.exists)return false;tx.create(run,{createdAt:new Date(),status:'started',testMode});return true;});
   if(!shouldSend)return json(res,200,{success:true,alreadySent:true});
   // Prima si genera e salva il resoconto; soltanto dopo si notifica il telefono.
   const report=await generateWeeklyCoachReport(owner.uid,week);
   await run.set({status:'report_ready',reportId:report.messageId,activitiesCount:report.activitiesCount},{merge:true});
   const snap=await db.collection('runnerPulsePush').doc(owner.uid).collection('devices').where('enabled','==',true).get();
   const tokens=snap.docs.map(d=>d.data().token).filter(Boolean);
   let delivered=0,failed=0;
   for(let i=0;i<tokens.length;i+=500){
    const batch=tokens.slice(i,i+500);
    const result=await getMessaging().sendEachForMulticast({tokens:batch,data:{title:'Runner Pulse · Coach AI',body:testMode?'🤖 TEST: il resoconto della settimana è pronto nella chat Coach.':'🤖 Il tuo resoconto settimanale è pronto! Tocca per leggerlo nella chat Coach.',tag:'runnerpulse-weekly',url:'/index.html?weeklyCoach=1'},webpush:{headers:{Urgency:'high',TTL:'86400'}}});
    delivered+=result.successCount;failed+=result.failureCount;
    for(let j=0;j<result.responses.length;j++)if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(result.responses[j].error?.code)){
      const crypto=await import('node:crypto');const id=crypto.createHash('sha256').update(batch[j]).digest('hex');await db.collection('runnerPulsePush').doc(owner.uid).collection('devices').doc(id).delete();
    }
   }
   await run.set({status:'finished',delivered,failed,completedAt:new Date()},{merge:true});
   return json(res,200,{success:true,delivered,failed});
  }catch(error){console.error('Weekly push:',error.message);try{const owner=await getAuth().getUserByEmail(OWNER_EMAIL);const db=getFirestore();const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const date=k=>parts.find(p=>p.type===k)?.value;await db.collection('runnerPulsePush').doc(owner.uid).collection('weeklyRuns').doc(`${req.headers['x-runner-pulse-test']==='weekly-report-test'?'test-':''}${date('year')}-${date('month')}-${date('day')}`).delete();}catch(e){console.error('Weekly retry cleanup:',e.message);}return json(res,500,{success:false,message:'Generazione o invio del report non riusciti'});}
 }
}

http.createServer(async(req,res)=>{
  if(req.url?.startsWith('/api/garmin/webhook/')){let webhookPath;try{webhookPath=new URL(req.url,'http://localhost').pathname;}catch{return json(res,400,{message:'URL non valido'});}await receiveGarminWebhook(req,res,webhookPath);return;}
  if(req.url?.startsWith('/api/push/')){let pushPath;try{pushPath=new URL(req.url,'http://localhost').pathname;}catch{return json(res,400,{message:'URL non valido'});}await weeklyPushRoute(req,res,pushPath);return;}
  let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{json(res,400,{message:'URL non valido'});return;}
  if(pathname==='/api/garmin/webhook-diagnostics'){await garminWebhookDiagnostics(req,res);return;}
  if(pathname==='/api/garmin/official-sync-status'){await officialSyncStatus(req,res);return;}
  if(pathname==='/api/garmin/official-verify'){await officialVerifyIdentity(req,res);return;}
  if(['/api/garmin/account-status','/api/garmin/connect','/api/garmin/callback','/api/garmin/disconnect'].includes(pathname)){await garminOAuthRoutes(req,res,pathname);return;}
  if(pathname==='/api/garmin/vo2-check'){await garminVo2Check(req,res);return;}
  // Rilettura dello storico già sincronizzato: non richiede nuove chiamate a Garmin.
  // Accesso limitato al proprietario e paginazione per evitare risposte troppo grandi.
  if(pathname==='/api/garmin/health-daily'){
    if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
    if(!await ownerAuthorized(req))return json(res,403,{success:false,message:'Dati Garmin riservati al proprietario'});
    if(!GARMIN_API_KEY)return json(res,503,{success:false,message:'Chiave Garmin non configurata'});
    try{
      const body=await readJsonBody(req);
      const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
      const {startDate,endDate}=body||{};
      if(!validDate(startDate)||!validDate(endDate)||startDate>endDate||(Date.parse(endDate)-Date.parse(startDate))>7*86400000)return json(res,400,{success:false,message:'Intervallo date non valido (massimo 7 giorni)'});
      const {summaries,diagnostic}=await getGarminDailySummaries(startDate,endDate);
      return json(res,200,{success:true,data:summaries,diagnostic});
    }catch(error){console.warn('Riepiloghi Garmin:',error.message);return json(res,502,{success:false,message:'Riepiloghi Garmin non disponibili: '+error.message});}
  }
  // Controllo incrementale esplicito: importa soltanto nuove attività.
  // Non cancella lo storico e non riscarica i dettagli delle attività esistenti.
  if(pathname==='/api/garmin/check-new'){
    if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
    if(!await ownerAuthorized(req))return json(res,403,{success:false,message:'Garmin riservato al proprietario'});
    if(!GARMIN_API_KEY)return json(res,503,{success:false,message:'Chiave Garmin non configurata'});
    try{
      const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');
      const user=await getAuth().verifyIdToken(match[1],true);
      const collection=getFirestore().collection('runnerPulseGarmin').doc(user.uid).collection('activities');
      const token=await getGarminToken();
      let added=0,checked=0,more=true;
      // Massimo 5 pagine per richiesta: il pulsante verifica le 100 attività più recenti.
      for(let start=0;start<100&&more;start+=20){
        const params=new URLSearchParams({start:String(start),limit:'20'});
        const list=await garminJson('/activitylist-service/activities/search/activities?'+params,token);
        if(!Array.isArray(list))throw new Error('Formato elenco Garmin inatteso');
        more=list.length===20;
        const entries=list.map(a=>({a,id:String(a?.activityId??a?.id??'')})).filter(x=>/^\d{1,20}$/.test(x.id));
        if(entries.length){
          const refs=entries.map(x=>collection.doc(x.id));
          const snapshots=await getFirestore().getAll(...refs);
          const batch=getFirestore().batch();let batchCount=0;
          for(let i=0;i<entries.length;i++){
            if(!snapshots[i].exists){batch.set(refs[i],{summary:entries[i].a,garminId:entries[i].id,seenAt:Date.now()});added++;batchCount++;}
          }
          if(batchCount)await batch.commit();
          checked+=entries.length;
          // Se l'intera pagina è già presente, le pagine successive sono presumibilmente storiche.
          if(batchCount===0)break;
        }
      }
      return json(res,200,{success:true,added,checked});
    }catch(error){console.warn('Controllo incrementale Garmin:',error.message);return json(res,502,{success:false,message:'Controllo nuove attività non riuscito: '+error.message});}
  }
  if(pathname==='/api/garmin/import-file'){
    if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
    if(!await ownerAuthorized(req))return json(res,403,{success:false,message:'Accesso riservato al proprietario'});
    try{
      const filename=decodeURIComponent(String(req.headers['x-rp-filename']||''));
      if(!/\.(fit|zip)$/i.test(filename))return json(res,400,{success:false,message:'Carica un file FIT o ZIP'});
      const max=85*1024*1024;let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('File troppo grande (limite 85 MB). Dividi lo ZIP in archivi più piccoli.'),{status:413});chunks.push(chunk);}
      const parsed=parseGarminArchive(Buffer.concat(chunks),filename);
      const user=await garminGoogleUser(req),db=getFirestore(),root=db.collection('runnerPulseGarmin').doc(user.uid);
      let imported=0,duplicates=0,failed=0;const errors=[];
      for(const {name,activity,error} of parsed){
        if(error){failed++;if(errors.length<8)errors.push(name+': '+error);continue;}
        try{
          const {id,summary,detail}=activity;
          const ref=root.collection('activities').doc(id);
          if((await root.collection('deletedActivities').doc(id).get()).exists){duplicates++;continue;}
          if((await ref.get()).exists){duplicates++;continue;}
          // Evita duplicati con lo storico importato da Garmin via webhook.
          const near=await root.collection('activities').where('summary.startTimeInSeconds','==',summary.startTimeInSeconds).limit(15).get();
          const same=near.docs.some(d=>{const old=d.data()?.summary||{};return Math.abs(Number(old.distanceInMeters)-Number(summary.distanceInMeters))<2&&Math.abs(Number(old.durationInSeconds)-Number(summary.durationInSeconds))<3;});
          if(same){duplicates++;continue;}
          const batch=db.batch();
          batch.set(ref,{summary,garminId:id,source:'manual-fit',seenAt:Date.now(),officialActivityDetails:{activityId:id,laps:detail.laps},fitSampleChunks:Math.ceil(detail.samples.length/300)});
          for(let j=0;j<detail.samples.length;j+=300)batch.set(ref.collection('fitSamples').doc(String(j/300).padStart(5,'0')),{samples:detail.samples.slice(j,j+300)});
          // Firestore batch limit: 500 writes. Avoid partial imports.
          if(detail.samples.length>120000)throw Error('Attività troppo grande per importazione singola');
          if(Math.ceil(detail.samples.length/300)>450)throw Error('Troppi campioni FIT');
          await batch.commit();imported++;
        }catch(err){failed++;if(errors.length<8)errors.push(name+': '+err.message);}
      }
      return json(res,200,{success:true,imported,duplicates,failed,total:parsed.length,errors});
    }catch(error){console.error('Importazione FIT:',error.message);return json(res,error.status||400,{success:false,message:error.message});}
  }
  if(pathname==='/api/garmin/delete-activity'){
    if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
    if(!await ownerAuthorized(req))return json(res,403,{success:false,message:'Accesso non autorizzato'});
    try{
      const body=await readJsonBody(req);
      const id=String(body?.activityId??'');
      if(!/^\d{1,20}$/.test(id))return json(res,400,{success:false,message:'ID attività non valido'});
      const user=await garminGoogleUser(req);
      if(!user)return json(res,401,{success:false,message:'Accedi con Google'});
      const db=getFirestore(),root=db.collection('runnerPulseGarmin').doc(user.uid);
      const ref=root.collection('activities').doc(id),tombstone=root.collection('deletedActivities').doc(id);
      await db.runTransaction(async tx=>{
        const existing=await tx.get(ref);
        if(!existing.exists)throw Object.assign(new Error('Attività non trovata in Firebase'),{status:404});
        tx.set(tombstone,{deletedAt:Date.now(),deletedBy:user.uid});
        tx.delete(ref);
      });
      await db.recursiveDelete(ref);
      return json(res,200,{success:true,deleted:true});
    }catch(error){console.error('Eliminazione attività Garmin:',error.message);return json(res,error.status===404?404:500,{success:false,message:error.status===404?error.message:'Eliminazione da Firebase non riuscita'});}
  }
  // Dettagli gia presenti nello storico Firestore: sola lettura, nessuna chiamata Garmin.
  if(pathname==='/api/activities/stored-detail'){
    if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
    if(!await authorized(req))return json(res,401,{success:false,message:'Accesso richiesto'});
    try{
      const body=await readJsonBody(req);
      const id=String(body?.activityId||'');
      if(!/^\d{1,20}$/.test(id))return json(res,400,{success:false,message:'Identificativo non valido'});
      const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');
      const user=await getAuth().verifyIdToken(match[1],true);
      const snap=await getFirestore().collection('runnerPulseGarmin').doc(user.uid).collection('activities').doc(id).get();
      if(!snap.exists)return json(res,404,{success:false,message:'Attivita non presente nello storico'});
      const record=snap.data()||{},summary=record.summary||{};
      // splitSummaries sono riepiloghi di segmenti, NON giri: non usarli come Lap.
      const official=record.officialActivityDetails||null;
      const officialDetail=Array.isArray(official)?official.find(x=>String(x?.activityId)===id):official;
      const candidates=[officialDetail?.laps,record.laps,record.lapDTOs,record.lapSummaries,summary.laps,summary.lapDTOs,summary.lapSummaries];
      const expected=Number(summary.lapCount ?? record.lapCount);
      const validLap=x=>x && typeof x==='object' && Number(x.distance ?? x.distanceMeters)>0 && Number(x.duration ?? x.elapsedDuration ?? x.movingDuration)>0;
      let laps=candidates.find(v=>Array.isArray(v)&&v.length&&v.every(validLap)&&(!Number.isInteger(expected)||expected<=0||v.length===expected))||[];
      // Nessuna approssimazione: se sono dichiarati 18 giri, non mostrare 3 riepiloghi.

      let fitDetail=null;
      if(record.fitSampleChunks){
        const parts=await snap.ref.collection('fitSamples').orderBy('__name__').get();
        fitDetail={activityId:id,laps:officialDetail?.laps||[],samples:parts.docs.flatMap(d=>d.data()?.samples||[])};
      }
      const detail=fitDetail||(officialDetail && Array.isArray(officialDetail.samples) && officialDetail.samples.length ? officialDetail : null)||record.detail||record.activityDetail||null;
      return json(res,200,{success:true,detail, splits:{laps},hasLaps:laps.length>0,hasDetail:Boolean(detail)});
    }catch(error){console.error('Lettura dettagli Firestore:',error.message);return json(res,500,{success:false,message:'Lettura dettagli salvati non riuscita'});}
  }
  if(pathname==='/api/garmin/archive'){
    if(req.method!=='POST')return json(res,405,{success:false,message:'Metodo non consentito'});
    if(!await ownerAuthorized(req))return json(res,403,{success:false,message:'Garmin disponibile soltanto per il proprietario.'});
    try{
      const body=await readJsonBody(req);
      const after=body?.after==null?'':String(body.after);
      if(after&&!/^\d{1,20}$/.test(after))return json(res,400,{success:false,message:'Cursore non valido'});
      const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');
      const user=await getAuth().verifyIdToken(match[1],true);
      const collection=getFirestore().collection('runnerPulseGarmin').doc(user.uid).collection('activities');
      let query=collection.orderBy('__name__').limit(100);
      if(after)query=query.startAfter(collection.doc(after));
      const snapshot=await query.get();
      const activities=snapshot.docs.map(doc=>{const data=doc.data()||{};const summary=data.summary;if(!summary||typeof summary!=='object')return null;return {...summary,activityId:summary.activityId??summary.summaryId??data.garminId??doc.id};}).filter(Boolean);
      const next=snapshot.size===100?snapshot.docs[snapshot.docs.length-1].id:null;
      return json(res,200,{success:true,activities,next});
    }catch(error){console.error('Archivio Garmin:',error.message);return json(res,502,{success:false,message:'Impossibile leggere lo storico Garmin'});}
  }
  if(['/api/garmin/sync-status','/api/garmin/sync-step'].includes(pathname)){await syncRequest(req,res,pathname);return;}
  if(pathname==='/api/coach/activity'){await handleActivityCoach(req,res,authorized,readJsonBody,json);return;}
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
  // Consenti i loghi e le altre immagini presenti in public/, senza esporre file arbitrari.
  const imageName = /^\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:png|jpg|jpeg|webp|svg|gif|ico)$/i.test(pathname) ? pathname.slice(1) : null;
  const name=files[pathname] || imageName;if(!name){res.writeHead(404);res.end('Not found');return;}
  try{const data=await readFile(path.join(base,'public',name));res.writeHead(200,{'Content-Type':types[path.extname(name)],'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);}
  catch(error){console.error('Errore file statico:',pathname,error.code);res.writeHead(error.code==='ENOENT'?404:500);res.end(error.code==='ENOENT'?'Not found':'Server error');}
}).listen(port,'0.0.0.0',()=>console.log('Runner Pulse Web on '+port));

// All’avvio tenta di recuperare notifiche gia consegnate ma non importate.
setTimeout(()=>{void recoverGarminWebhookInbox();},15000).unref();
