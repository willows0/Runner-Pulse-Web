import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 applyHttpSecurityHeaders,rateLimitAuthenticatedAction,isTrustedBrowserMutation
} from '../security-guards.js';

const fake=(origin,method='POST',host='runner-pulse-web.onrender.com')=>({method,headers:{origin,host}});
test('Protezione base: intestazioni HTTP senza rompere il login',()=>{
 const seen={};
 applyHttpSecurityHeaders({headers:{'x-forwarded-proto':'https'}},{setHeader:(k,v)=>{seen[k]=v;}});
 assert.equal(seen['X-Frame-Options'],'DENY');
 assert.equal(seen['X-Permitted-Cross-Domain-Policies'],'none');
 assert.equal(seen['X-Download-Options'],'noopen');
 assert.ok(seen['Content-Security-Policy'].includes("frame-ancestors 'none'"));
});
test('Blocca Origin estranei alle richieste che modificano dati',()=>{
 assert.equal(isTrustedBrowserMutation(fake('https://evil.example')),false);
 assert.equal(isTrustedBrowserMutation(fake('https://runner-pulse-web.onrender.com')),true);
 assert.equal(isTrustedBrowserMutation(fake('https://runner-pulse-web.onrender.com','DELETE')),true);
 assert.equal(isTrustedBrowserMutation(fake('https://evil.example','GET')),true);
 assert.equal(isTrustedBrowserMutation(fake(undefined)),true); // WebView native
 assert.equal(isTrustedBrowserMutation(fake('null')),true); // WebView Android
 assert.equal(isTrustedBrowserMutation(fake('http://localhost:3000','POST','localhost:3000')),true);
 assert.equal(isTrustedBrowserMutation(fake('http://runner-pulse-web.onrender.com')),false);
});
test('Quote AI: applicate per UID verificato, per azione e con scadenza',()=>{
 const now=1_900_000_000_000;
 for(let i=0;i<18;i++)assert.equal(rateLimitAuthenticatedAction('uid-foo','chat',now+i).allowed,true);
 const blocked=rateLimitAuthenticatedAction('uid-foo','chat',now+25);
 assert.equal(blocked.allowed,false);
 assert.ok(blocked.retryAfterSeconds>0);
 assert.equal(rateLimitAuthenticatedAction('uid-bar','chat',now+25).allowed,true);
 assert.equal(rateLimitAuthenticatedAction('uid-foo','plan-edit',now+25).allowed,true);
 assert.equal(rateLimitAuthenticatedAction('uid-foo','chat',now+65_000).allowed,true);
 assert.throws(()=>rateLimitAuthenticatedAction('', 'chat',now),/Firebase/);
});
test('Coach e analisi applicano le quote dopo la verifica del token',async()=>{
 const coach=await readFile(new URL('../coach-api.js',import.meta.url),'utf8');
 const activity=await readFile(new URL('../activity-coach.js',import.meta.url),'utf8');
 assert.ok(coach.indexOf('getAuth().verifyIdToken(token,true)') < coach.indexOf('rateLimitAuthenticatedAction(uid,action)'));
 assert.ok(activity.indexOf('getAuth().verifyIdToken(token,true)') < activity.indexOf("rateLimitAuthenticatedAction(user.uid,'coach-activity')"));
 assert.ok(coach.includes('Retry-After'));
});
test('Server cattura errori imprevisti e limita i tempi di connessione',async()=>{
 const server=await readFile(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/handleIncomingRequest\(req,res\)\)\.catch\(/);
 assert.match(server,/httpServer\.headersTimeout=15000/);
 assert.match(server,/httpServer\.requestTimeout=180000/);
 assert.match(server,/httpServer\.maxRequestsPerSocket=100/);
 assert.match(server,/isTrustedBrowserMutation\(req\)/);
});
test('Regole Firestore sono dichiaratamente una bozza: non deploy automatico',async()=>{
 const text=await readFile(new URL('../firestore.rules.REVIEW_ONLY',import.meta.url),'utf8');
 assert.match(text,/NON pubblicare/);
 assert.match(text,/allow read,write: if false/);
 assert.match(text,/request\.auth\.uid == uid/);
});
