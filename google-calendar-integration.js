// Runner Pulse · Google Calendar OAuth 2 + sync del piano approvato.
// Le credenziali e i token non vengono MAI esposti al browser.
import {randomBytes, createHash, createCipheriv, createDecipheriv} from 'node:crypto';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {normalizePlan,planRef,revisionOf} from './training-plan.js';

const CLIENT_ID=process.env.GOOGLE_CALENDAR_CLIENT_ID||'';
const CLIENT_SECRET=process.env.GOOGLE_CALENDAR_CLIENT_SECRET||'';
const REDIRECT_URI=process.env.GOOGLE_CALENDAR_REDIRECT_URI||'';
const KEY_SECRET=process.env.GOOGLE_CALENDAR_TOKEN_KEY||'';
const configured=Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI.startsWith('https://') && REDIRECT_URI.endsWith('/api/calendar/callback') && KEY_SECRET.length>=32);
const encryptionKey=configured?createHash('sha256').update('runner-pulse-google-calendar-v1\0'+KEY_SECRET).digest():null;
const SCOPE='https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const TZ='Europe/Rome';
const STATES=()=>getFirestore().collection('runnerPulseCalendarAuthStates');
const userDoc=uid=>getFirestore().collection('runnerPulseGoogleCalendar').doc(uid);
const sha=value=>createHash('sha256').update(String(value)).digest('hex');
function encrypt(value){
 const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',encryptionKey,iv);
 const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
 return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
function decrypt(blob){
 const decipher=createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(blob.iv,'base64'));
 decipher.setAuthTag(Buffer.from(blob.tag,'base64'));
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(blob.data,'base64')),decipher.final()]).toString('utf8'));
}
function reply(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));}
function redirect(res,target){res.writeHead(303,{Location:target,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();}
async function authUser(req){
 const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');if(!match)return null;
 try{const u=await getAuth().verifyIdToken(match[1],true);
  const valid=u.email_verified===true||(u.firebase?.sign_in_provider==='google.com'&&u.firebase?.identities?.['google.com']?.length>0);
  return valid?u:null;
 }catch{return null;}
}
async function bodyJson(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4000)throw Object.assign(Error('Richiesta troppo lunga'),{status:413});chunks.push(chunk);}return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};}
async function exchangeToken(fields){
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields),signal:AbortSignal.timeout(15000)});
 if(!response.ok){
  const body=await response.json().catch(()=>({}));
  const oauthCode=['invalid_client','invalid_grant'].includes(body?.error)?body.error:'exchange_failed';
  // Non registrare mai client_secret, authorization code o risposta integrale.
  console.warn('Google OAuth token exchange rejected:',response.status,oauthCode);
  throw Object.assign(Error('Google OAuth ha rifiutato l’autorizzazione'),{status:502,oauthCode});
 }
 return response.json();
}
async function accessToken(uid){
 const ref=userDoc(uid),snap=await ref.get(),data=snap.data()||{};
 if(!data.token)throw Object.assign(Error('Collega prima Google Calendar'),{status:409});
 const tokens=decrypt(data.token);
 if(tokens.access_token&&tokens.expiresAt>Date.now()+90_000)return tokens.access_token;
 if(!tokens.refresh_token)throw Object.assign(Error('Autorizzazione scaduta: collega nuovamente Google Calendar'),{status:401});
 const newer=await exchangeToken({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'refresh_token',refresh_token:tokens.refresh_token});
 if(!newer.access_token)throw Object.assign(Error('Ricollega Google Calendar'),{status:401});
 const updated={...tokens,...newer,refresh_token:tokens.refresh_token,expiresAt:Date.now()+((Number(newer.expires_in)||3600)*1000)};
 await ref.set({token:encrypt(updated),tokenUpdatedAt:Date.now()},{merge:true});return updated.access_token;
}
function apiError(status){
 const message=status===401?'Autorizzazione Google Calendar scaduta: ricollegalo':status===403?'Permessi Google Calendar insufficienti':status===429?'Limite temporaneo Google Calendar: riprova':`Google Calendar ha risposto con HTTP ${status}`;
 return Object.assign(Error(message),{status:status===401?401:502,googleStatus:status});
}
async function googleEvent(access,method,eventId=null,payload=null){
 const path='https://www.googleapis.com/calendar/v3/calendars/primary/events'+(eventId?'/'+encodeURIComponent(eventId):'');
 const response=await fetch(path,{method,headers:{Authorization:'Bearer '+access,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)return {ok:false,status:response.status};
 return {ok:true,data:response.status===204?null:await response.json()};
}
// Lettura in tempo reale degli impegni, per l'utente Google autenticato.
// Il vecchio permesso calendar.events consente gli eventi principali ma non
// l'elenco dei calendari: finché l'utente non ri-autorizza, segnaliamo il limite.
const ROME_PARTS=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function romeWall(value){
 const d=new Date(value);if(!Number.isFinite(d.getTime()))throw Error('Data calendario non valida');
 const parts=Object.fromEntries(ROME_PARTS.formatToParts(d).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function romeToday(){return romeWall(new Date()).slice(0,10);}
function utcRange(start,days){
 const first=new Date(start+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isFinite(first.getTime())||first.toISOString().slice(0,10)!==start)throw Object.assign(Error('Data non valida'),{status:400});
 if(!Number.isInteger(days)||days<1||days>56)throw Object.assign(Error('Intervallo massimo di 56 giorni'),{status:400});
 const from=new Date(first.getTime()-2*86400000),to=new Date(first.getTime()+(days+2)*86400000);
 const endDate=new Date(first.getTime()+days*86400000).toISOString().slice(0,10);
 return {from:from.toISOString(),to:to.toISOString(),fromDate:start,endDate};
}
async function googleList(access,url){
 const response=await fetch(url,{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(17000)});
 if(!response.ok){
  if(response.status===403 && url.includes('/users/me/calendarList'))return {needsScope:true};
  throw apiError(response.status);
 }
 return response.json();
}
async function calendarSources(access){
 const url='https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250';
 const list=await googleList(access,url);
 if(list.needsScope)return {calendars:[{id:'primary',name:'Principale'}],limitedToPrimary:true};
 if(list.nextPageToken)throw Object.assign(Error('Troppi calendari per una lettura completa.'),{status:409});
 const calendars=(list.items||[]).filter(c=>c.selected!==false&&c.hidden!==true).map(c=>({id:c.id,name:String(c.summaryOverride||c.summary||'Calendario').slice(0,90)}));
 if(!calendars.length)calendars.push({id:'primary',name:'Principale'});
 if(calendars.length>15)throw Object.assign(Error('Troppi calendari selezionati. Riduci i calendari visualizzati in Google Calendar.'),{status:409});
 return {calendars,limitedToPrimary:false};
}
async function calendarEvents(access,calendar,range){
 let cursor=null,pages=0;const events=[];
 do{
  const url=new URL('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendar.id)+'/events');
  for(const [key,value] of Object.entries({timeMin:range.from,timeMax:range.to,singleEvents:'true',orderBy:'startTime',maxResults:'250',showDeleted:'false'}))url.searchParams.set(key,value);
  if(cursor)url.searchParams.set('pageToken',cursor);
  const response=await googleList(access,url.toString());
  if(response.needsScope)throw apiError(403);
  for(const item of response.items||[]){
   if(item.status==='cancelled'||item.attendees?.find(a=>a.self)?.responseStatus==='declined')continue;
   const allDay=Boolean(item.start?.date);
   const startLocal=allDay?String(item.start.date)+'T00:00':romeWall(item.start?.dateTime);
   const endLocal=allDay?String(item.end?.date)+'T00:00':romeWall(item.end?.dateTime);
   if(endLocal<=range.fromDate+'T00:00'||startLocal>=range.endDate+'T00:00')continue;
   const busy=item.transparency!=='transparent';
   const runnerPulse=item.extendedProperties?.private?.runnerPulse==='training-plan';
   events.push({
    id:String(item.id||'').slice(0,180),
    title:String(item.visibility==='private'?'Impegno privato':(item.summary||'Impegno')).slice(0,150),
    startLocal,endLocal,allDay,busy,runnerPulse,
    calendar:calendar.name
   });
   if(events.length>1000)throw Object.assign(Error('Troppi eventi: restringi il periodo del calendario.'),{status:409});
  }
  cursor=response.nextPageToken||null;pages++;
  if(pages>8)throw Object.assign(Error('Calendario troppo grande per la verifica degli impegni.'),{status:409});
 }while(cursor);
 return events;
}
async function readAgenda(uid,{start=romeToday(),days=42,access=null}={}){
 const range=utcRange(start,days),token=access||await accessToken(uid);
 const {calendars,limitedToPrimary}=await calendarSources(token);
 const groups=await Promise.all(calendars.map(c=>calendarEvents(token,c,range)));
 return {events:groups.flat().sort((a,b)=>a.startLocal.localeCompare(b.startLocal)),
  calendars:calendars.map(c=>c.name),limitedToPrimary,from:range.fromDate,to:range.endDate};
}
function overlapsAgenda(rows,events){
 const blocking=events.filter(e=>e.busy&&!e.runnerPulse);
 for(const s of rows){
  const start=Date.parse(s.date+'T'+s.time+':00Z'),end=start+s.minutes*60000;
  for(const b of blocking){
   const begin=Date.parse(b.startLocal+':00Z'),finish=Date.parse(b.endLocal+':00Z');
   if(start<finish&&end>begin)return s;
  }
 }
 return null;
}
function eventId(uid,index,generation=0){return 'rp'+sha(uid+':'+generation+':'+index).slice(0,36);}
function eventBody(s,uid,index){
 // Google interpreta la data e l'orario locali con il fuso Europe/Rome,
 // inclusi i cambi dell'ora legale. Le ore non sono trattate come UTC.
 const start=new Date(s.date+'T'+s.time+':00Z');
 const end=new Date(start.getTime()+s.minutes*60000);
 const endTime=end.toISOString().slice(0,19);
 return {
  summary:'Runner Pulse · '+s.title,
  description:[s.details,`Durata: ${s.minutes} minuti`,'Piano approvato in Runner Pulse'].filter(Boolean).join('\n'),
  start:{dateTime:s.date+'T'+s.time+':00',timeZone:TZ},
  end:{dateTime:endTime,timeZone:TZ},
  extendedProperties:{private:{runnerPulse:'training-plan',ownerHash:sha(uid).slice(0,24),index:String(index)}},
  reminders:{useDefault:true}
 };
}
async function syncPlan(uid){
 const ref=userDoc(uid);
 const lockTime=Date.now();
 const lock=await getFirestore().runTransaction(async tx=>{
  const snap=await tx.get(ref),data=snap.data()||{};
  if(!data.token)throw Object.assign(Error('Google Calendar non collegato'),{status:409});
  if(Number(data.syncLockUntil)>lockTime)throw Object.assign(Error('Sincronizzazione già in corso'),{status:409});
  tx.set(ref,{syncLockUntil:lockTime+180000},{merge:true});return data;
 });
 try{
  const plan=await planRef(getFirestore(),uid).get();
  const rows=plan.exists&&Array.isArray(plan.data()?.sessions)?normalizePlan(plan.data().sessions):[];
  if(rows.length>80)throw Object.assign(Error('Piano troppo lungo'),{status:400});
  const access=await accessToken(uid);
  if(rows.length){
   // Ogni sincronizzazione ricontrolla i veri appuntamenti, non solo la bozza
   // generata giorni prima. In caso di errore non si modifica alcun evento.
   const dates=rows.map(s=>s.date).sort();
   const span=Math.round((Date.parse(dates.at(-1)+'T00:00:00Z')-Date.parse(dates[0]+'T00:00:00Z'))/86400000)+2;
   if(span>56)throw Object.assign(Error('Il programma supera 56 giorni: sincronizzalo in un periodo più breve.'),{status:409});
   const agenda=await readAgenda(uid,{start:dates[0],days:span,access});
   const conflict=overlapsAgenda(rows,agenda.events);
   if(conflict)throw Object.assign(Error('Conflitto con un impegno Google Calendar il '+conflict.date+' alle '+conflict.time+'. Modifica il piano prima di sincronizzarlo.'),{status:409});
  }
  const previous=lock.syncedEvents&&typeof lock.syncedEvents==='object'?lock.syncedEvents:{};
  let created=0,updated=0,deleted=0;
  const current={...previous};
  // Salviamo ciascun evento dopo la conferma di Google; un'interruzione
  // non deve creare duplicati al tentativo successivo.
  for(let i=0;i<rows.length;i++){
   const index=String(i);let id=previous[index]?.id||eventId(uid,i,Number(lock.calendarGeneration)||0);
   const payload=eventBody(rows[i],uid,i),signature=JSON.stringify(payload);
   let operation='POST';
   if(previous[index]){
    // Mai modificare l'evento di un altro utente, anche in caso di
    // ricollegamento a un account Google Calendar diverso.
    const found=await googleEvent(access,'GET',id);
    if(found.ok){
     if(found.data?.extendedProperties?.private?.ownerHash!==sha(uid).slice(0,24))throw apiError(409);
     if(previous[index].signature===signature)continue;
     operation='PATCH';
    }else if(found.status!==404)throw apiError(found.status);
   }
   let result=await googleEvent(access,operation,operation==='PATCH'?id:null,operation==='POST'?{...payload,id}:payload);
   if(operation==='PATCH'&&result.status===404){operation='POST';result=await googleEvent(access,'POST',null,{...payload,id});}
   if(operation==='POST'&&result.status===409){
    // Evento deterministico creato ma non ancora registrato in Firestore.
    // Prima di modificarlo verifichiamo che appartenga a questo utente.
    const existing=await googleEvent(access,'GET',id);
    if(!existing.ok&&existing.status===404){
     // Google può conservare una tombstone dell'ID di un evento eliminato.
     id='rp'+randomBytes(20).toString('hex');
     result=await googleEvent(access,'POST',null,{...payload,id});
    }else{
     if(!existing.ok||existing.data?.extendedProperties?.private?.ownerHash!==sha(uid).slice(0,24))throw apiError(409);
     operation='PATCH';result=await googleEvent(access,'PATCH',id,payload);
    }
   }
   if(!result.ok)throw apiError(result.status);
   current[index]={id,signature};
   await ref.update({syncedEvents:current});
   if(previous[index])updated++;else created++;
  }
  for(const [index,old] of Object.entries(previous)){
   if(Number(index)<rows.length)continue;
   const found=await googleEvent(access,'GET',old.id);
   if(found.ok){
    if(found.data?.extendedProperties?.private?.ownerHash!==sha(uid).slice(0,24))throw apiError(409);
    const result=await googleEvent(access,'DELETE',old.id);
    if(!result.ok&&result.status!==404)throw apiError(result.status);
   }else if(found.status!==404)throw apiError(found.status);
   delete current[index];await ref.update({syncedEvents:current});deleted++;
  }
  const revision=revisionOf(plan);
  await ref.update({syncedEvents:current,lastSyncedRevision:revision,lastSyncedAt:Date.now(),calendarGeneration:(rows.length===0 && Object.keys(previous).length>0)?((Number(lock.calendarGeneration)||0)+1):(Number(lock.calendarGeneration)||0)});
  return {created,updated,deleted,count:Object.keys(current).length,revision};
 }finally{
  await ref.set({syncLockUntil:0},{merge:true}).catch(()=>{});
 }
}
export async function handleGoogleCalendarRoute(req,res,pathname){
 try{
  if(pathname==='/api/calendar/callback'){
   if(req.method!=='GET')return reply(res,405,{success:false});
   const url=new URL(req.url,'https://runner-pulse-web.onrender.com');
   const state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'';
   let returnToApp=false;
   const back=(reason)=>redirect(res,(returnToApp?'/calendar-return.html?calendar=':'/?calendar=')+encodeURIComponent(reason));
   if(!/^[a-f0-9]{64}$/.test(state))return back('invalid_state');
   let uid=null;
   try{
    const ref=STATES().doc(sha(state));
    uid=await getFirestore().runTransaction(async tx=>{
     const snap=await tx.get(ref),data=snap.data();
     if(!data||data.expiresAt<Date.now())return null;
     tx.delete(ref);return {uid:data.uid,returnToApp:data.returnToApp===true};
    });
    if(uid){returnToApp=uid.returnToApp;uid=uid.uid;}
   }catch(error){console.warn('Calendar OAuth state:',error.message);return back('state_storage');}
   if(!uid)return back('expired_state');
   const fail=async(reason)=>{
    // Persistiamo solo un codice diagnostico, non code OAuth, token o credenziali.
    try{await userDoc(uid).set({lastOAuthError:reason,lastOAuthErrorAt:Date.now()},{merge:true});}
    catch(error){console.warn('Calendar OAuth diagnostic:',error.message);}
    return back(reason);
   };
   if(url.searchParams.has('error'))return fail('consent_denied');
   if(!code)return fail('missing_code');
   try{
    const tok=await exchangeToken({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,code,grant_type:'authorization_code',redirect_uri:REDIRECT_URI});
    if(!tok.access_token)return fail('token_missing');
    const doc=userDoc(uid),prior=(await doc.get()).data()||{};
    const old=prior.token?decrypt(prior.token):{};
    if(!tok.refresh_token&&!old.refresh_token)return fail('missing_refresh');
    const stored={...old,...tok,refresh_token:tok.refresh_token||old.refresh_token,expiresAt:Date.now()+((Number(tok.expires_in)||3600)*1000)};
    await doc.set({token:encrypt(stored),connectedAt:Date.now(),tokenUpdatedAt:Date.now(),lastOAuthError:null,lastOAuthErrorAt:null},{merge:true});
    return back('connected');
   }catch(error){
    // Token errato o client secret non corrispondente: si verifica solo al callback.
    console.warn('Calendar OAuth callback:',error.message);
    return fail(error.oauthCode==='invalid_client'?'invalid_client':error.oauthCode==='invalid_grant'?'invalid_grant':'callback_error');
   }
  }
  const user=await authUser(req);
  if(!user)return reply(res,401,{success:false,message:'Accedi con Google per collegare il calendario.'});
  if(pathname==='/api/calendar/status'){
   if(req.method!=='GET')return reply(res,405,{success:false});
   const data=configured?(await userDoc(user.uid).get()).data()||{}:{};
   return reply(res,200,{success:true,configured,connected:configured&&Boolean(data.token),oauthError:!data.token&&Number(data.lastOAuthErrorAt)>Date.now()-30*60*1000?data.lastOAuthError:null,lastSyncedRevision:data.lastSyncedRevision??null,lastSyncedAt:data.lastSyncedAt??null,count:Object.keys(data.syncedEvents||{}).length});
  }
  if(!configured)return reply(res,503,{success:false,message:'Google Calendar non ancora configurato su Render. Aggiungi le credenziali OAuth e abilita Calendar API.'});
  if(pathname==='/api/calendar/connect'){
   if(req.method!=='POST')return reply(res,405,{success:false});
   const request=await bodyJson(req);
   // Il ritorno in app si abilita soltanto per la richiesta autenticata avviata dall'APK.
   // La sola risposta del browser non contiene né token né segreti OAuth.
   const returnToApp=request.returnToApp===true && /RunnerPulseAndroidWebView\/1/.test(String(req.headers['user-agent']||''));
   const state=randomBytes(32).toString('hex');
   await STATES().doc(sha(state)).create({uid:user.uid,returnToApp,createdAt:Date.now(),expiresAt:Date.now()+10*60*1000});
   await userDoc(user.uid).set({lastOAuthError:null,lastOAuthErrorAt:null},{merge:true});
   const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
   for(const [k,v] of Object.entries({client_id:CLIENT_ID,redirect_uri:REDIRECT_URI,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',state}))url.searchParams.set(k,v);
   return reply(res,200,{success:true,authorizationUrl:url.toString()});
  }
  if(pathname==='/api/calendar/agenda'){
   if(req.method!=='GET')return reply(res,405,{success:false});
   const url=new URL(req.url,'https://runner-pulse-web.onrender.com');
   const start=url.searchParams.get('start')||romeToday();
   const days=Number(url.searchParams.get('days')||42);
   const data=await readAgenda(user.uid,{start,days});
   return reply(res,200,{success:true,...data});
  }
  if(pathname==='/api/calendar/disconnect'){
   if(req.method!=='POST')return reply(res,405,{success:false});
   await userDoc(user.uid).set({token:null,disconnectedAt:Date.now()},{merge:true});
   return reply(res,200,{success:true,message:'Calendar scollegato. Gli eventi già aggiunti restano sul calendario.'});
  }
  if(pathname==='/api/calendar/sync'){
   if(req.method!=='POST')return reply(res,405,{success:false});
   await bodyJson(req);
   const result=await syncPlan(user.uid);
   return reply(res,200,{success:true,...result});
  }
  return reply(res,404,{success:false});
 }catch(e){
  console.warn('Google Calendar:',e.message);
  return reply(res,e.status||500,{success:false,message:e.status===401||e.status===409||e.status===503||e.status===400||e.status===502?e.message:'Operazione Calendar non riuscita. Riprova.'});
 }
}
