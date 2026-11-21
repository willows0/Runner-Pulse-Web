// Protezioni server non intrusive: header HTTP e limite degli endpoint Calendar costosi.
// Il limite è per UID Firebase verificato ed è locale all'istanza Node.
const LIMITS=Object.freeze({
 '/api/calendar/connect':{max:8,windowMs:60_000},
 '/api/calendar/interpret':{max:12,windowMs:60_000},
 '/api/calendar/interpret-and-create':{max:10,windowMs:60_000},
 '/api/calendar/screenshot':{max:4,windowMs:60_000},
 '/api/calendar/move-preview':{max:12,windowMs:60_000},
 '/api/calendar/move-apply':{max:12,windowMs:60_000},
 '/api/calendar/delete-event':{max:15,windowMs:60_000},
 '/api/calendar/edit-full':{max:15,windowMs:60_000},
 '/api/calendar/change-date':{max:15,windowMs:60_000}
});
const counts=new Map();
const MAX_TRACKED=5000;

export function applyHttpSecurityHeaders(req,res){
 // Non restringere script o rete di Firebase/Garmin: la CSP protegge il framing
 // e i contenuti legacy per non interrompere il login o la WebView Android.
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Permitted-Cross-Domain-Policies','none');
 res.setHeader('X-Download-Options','noopen');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Permissions-Policy','geolocation=(), payment=()');
 res.setHeader('Cache-Control','no-store');
 if(String(req.headers?.['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase()==='https'){
  res.setHeader('Strict-Transport-Security','max-age=31536000');
 }
}

export function rateLimitCalendarUid(uid,pathname,now=Date.now()){
 const rule=LIMITS[pathname];
 // Questo controllo si esegue solo DOPO verifica token Firebase.
 if(!rule)return {allowed:true,retryAfterSeconds:0};
 if(typeof uid!=='string'||!uid)throw new TypeError('UID autenticato obbligatorio');
 const key=uid+'\0'+pathname;
 const existing=counts.get(key);
 const expired= !existing||now-existing.startedAt>=rule.windowMs||now<existing.startedAt;
 const entry=expired?{startedAt:now,count:0}:existing;
 if(expired){
  // Limita l'uso di memoria nel tempo senza memorizzare token o payload sensibili.
  if(counts.size>=MAX_TRACKED){
   for(const [id,record] of counts){if(now-record.startedAt>60_000)counts.delete(id);}
   if(counts.size>=MAX_TRACKED)counts.delete(counts.keys().next().value);
  }
  counts.set(key,entry);
 }
 if(entry.count>=rule.max){
  return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((rule.windowMs-(now-entry.startedAt))/1000))};
 }
 entry.count++;
 return {allowed:true,retryAfterSeconds:0};
}

// Esposto soltanto ai test, nessuna richiesta di rete o Firestore.
export const SECURITY_LIMITED_ENDPOINTS=Object.freeze(Object.keys(LIMITS));


// Quote per operazioni autenticate. La chiave è l'UID ottenuto dal token Firebase
// verificato, mai un ID o un'email passato liberamente dal browser.
// Limiti locali all'istanza Render: utili come prima difesa, non equivalgono
// a un firewall distribuito contro DDoS/bot su più istanze.
const ACTION_LIMITS=Object.freeze({
 'chat':{max:18,windowMs:60_000},
 'plan-edit':{max:10,windowMs:60_000},
 'clear':{max:3,windowMs:60_000},
 'history':{max:60,windowMs:60_000},
 'profile-get':{max:45,windowMs:60_000},
 'profile-save':{max:15,windowMs:60_000},
 'coach-activity':{max:24,windowMs:60_000}
});
const actionCounts=new Map();
export function rateLimitAuthenticatedAction(uid,action,now=Date.now()){
 if(typeof uid!=='string'||uid.length<1||uid.length>256)throw new TypeError('UID Firebase verificato obbligatorio');
 const rule=ACTION_LIMITS[action]||{max:18,windowMs:60_000};
 const key=uid+'\0'+action;
 const current=actionCounts.get(key);
 if(!current||now>=current.startedAt+rule.windowMs||now<current.startedAt){
  if(actionCounts.size>=MAX_TRACKED){
   for(const [k,v] of actionCounts){if(now-v.startedAt>60_000)actionCounts.delete(k);}
   if(actionCounts.size>=MAX_TRACKED)actionCounts.delete(actionCounts.keys().next().value);
  }
  actionCounts.set(key,{startedAt:now,count:1});
  return {allowed:true,retryAfterSeconds:0};
 }
 if(current.count>=rule.max)return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((rule.windowMs-(now-current.startedAt))/1000))};
 current.count++;
 return {allowed:true,retryAfterSeconds:0};
}

// Respinge origin esplicitamente estranei soltanto sulle API mutanti.
// Le chiamate Android native e i webhook non inviano Origin; i token Firebase
// e i segreti webhook restano sempre obbligatori nei rispettivi endpoint.
export function isTrustedBrowserMutation(req){
 if(!['POST','PUT','PATCH','DELETE'].includes(String(req.method||'').toUpperCase()))return true;
 const origin=String(req.headers?.origin||'');
 if(!origin||origin==='null')return true;
 try{
  const parsed=new URL(origin);
  if(parsed.origin!==origin||!['https:','http:'].includes(parsed.protocol))return false;
  const host=String(req.headers?.host||'');
  if(!host||host.includes('/')||host.includes('@'))return false;
  // TLS è terminato da Render. Il browser normalmente usa la stessa origine.
  const selfHost='https://'+host;
  const devHost='http://'+host;
  const override=String(process.env.RUNNER_PULSE_ALLOWED_ORIGIN||'').trim();
  return origin===selfHost||(origin===devHost && /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host))||(override.startsWith('https://')&&origin===override);
 }catch{return false;}
}
