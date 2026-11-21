import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateCalendarEdit,editableCategories} from '../calendar-edit-validation.js';

const valid={eventId:'evt_123',calendarId:'primary',category:'race',description:'10 km facili, ultimi 2 km progressivi.'};
test('le otto categorie sono modificabili',()=>{
 assert.deepEqual(editableCategories,['work','sport','race','school','health','expense','food','other']);
 for(const category of editableCategories) assert.equal(validateCalendarEdit({...valid,category}).category,category);
});
test('descrizione vuota ammessa, spazi rimossi',()=>{
 assert.equal(validateCalendarEdit({...valid,description:'  '}).description,'');
 assert.equal(validateCalendarEdit({...valid,description:'  Lungo 10 km  '}).description,'Lungo 10 km');
});
test('rifiuta categoria, ID o descrizioni non validi',()=>{
 for(const x of [{...valid,category:'nonsense'},{...valid,eventId:'bad\n id'},{...valid,calendarId:''},{...valid,description:'x'.repeat(4001)}])
  assert.throws(()=>validateCalendarEdit(x),{status:400});
});

const source=fs.readFileSync(new URL('../google-calendar-integration.js',import.meta.url),'utf8');
const begin=source.indexOf('async function updateCalendarDetails(');
const end=source.indexOf('// Elimina soltanto la singola occorrenza',begin);
assert.ok(begin>0&&end>begin);
const impl=source.slice(begin,end);
function fixture(overrides={}){
 const requests=[];
 const original={summary:'Lungo 10 km',description:'Prima',etag:'tag-1',eventType:'default',status:'confirmed',extendedProperties:{private:{runnerPulse:'manual-commitment',ownerHash:'abc',category:'sport'}},...overrides};
 const context={validateCalendarEdit,accessToken:async()=> 'test-token',calendarSources:async()=>({calendars:[{id:'primary',writable:true}]}),URL,AbortSignal,encodeURIComponent,Error,
 fetch:async(url,opt)=>{requests.push({url,opt});
  if(!opt?.method) return {ok:true,status:200,json:async()=>original};
  return {ok:true,status:200,json:async()=>({...original})};},apiError:status=>Object.assign(Error('HTTP '+status),{status})};
 vm.createContext(context);vm.runInContext(impl,context);
 return {requests,call:(payload=valid)=>context.updateCalendarDetails('user1',payload),context};
}
test('PATCH aggiorna solo categoria e descrizione e preserva gli altri attributi',async()=>{
 const f=fixture();const result=await f.call();assert.equal(result.updated,true);
 assert.equal(f.requests.length,2);const patch=JSON.parse(f.requests[1].opt.body);
 assert.deepEqual(Object.keys(patch).sort(),['description','extendedProperties']);
 assert.equal(patch.description,valid.description);
 assert.equal(patch.extendedProperties.private.category,'race');
 assert.equal(patch.extendedProperties.private.rpCategoryEdited,'1');
 assert.equal(patch.extendedProperties.private.runnerPulse,'manual-commitment');
 assert.equal(f.requests[1].opt.headers['If-Match'],'tag-1');
 assert.equal(f.requests[1].opt.method,'PATCH');
});
test('blocca compleanni ed eventi speciali senza inviare PATCH',async()=>{
 const f=fixture({eventType:'birthday'});
 await assert.rejects(f.call(),{status:409});assert.equal(f.requests.length,1);
});
test('blocca eventi del Piano senza inviare PATCH',async()=>{
 const f=fixture({extendedProperties:{private:{runnerPulse:'training-plan'}}});
 await assert.rejects(f.call(),{status:409});assert.equal(f.requests.length,1);
});
test('blocca eventi privati senza inviare PATCH',async()=>{
 const f=fixture({visibility:'private'});
 await assert.rejects(f.call(),{status:409});assert.equal(f.requests.length,1);
});
test('blocca calendario non scrivibile senza leggere evento',async()=>{
 const f=fixture();f.context.calendarSources=async()=>({calendars:[{id:'primary',writable:false}]});
 await assert.rejects(f.call(),{status:403});assert.equal(f.requests.length,0);
});
test('blocca aggiornamento concorrente se Google risponde 412',async()=>{
 const f=fixture();const old=f.context.fetch;
 f.context.fetch=async(url,opt)=>opt?.method==='PATCH'?{ok:false,status:412}:old(url,opt);
 await assert.rejects(f.call(),{status:409});
});
