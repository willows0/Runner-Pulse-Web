import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateCalendarFullEdit,buildCalendarFullEditPatch} from '../calendar-full-edit.js';
const orig={summary:'Turno Galassia - No Food',description:'Pomeriggio',status:'confirmed',eventType:'default',etag:'v7',
 start:{dateTime:'2026-11-21T13:00:00+01:00'},end:{dateTime:'2026-11-21T17:00:00+01:00'},extendedProperties:{private:{runnerPulse:'manual-commitment',ownerHash:'owner',category:'work'}}};
const input={eventId:'abc',calendarId:'primary',title:'Turno aggiornato',category:'work',description:'Turno pomeriggio',date:'2026-11-25',allDay:false,startTime:'14:00',endTime:'18:00',originalStart:'2026-11-21T13:00',originalEnd:'2026-11-21T17:00'};
const wall=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T');
test('modifica tutti i campi senza perdere marker',()=>{
 const out=buildCalendarFullEditPatch(orig,validateCalendarFullEdit(input),wall);
 assert.equal(out.patch.summary,'Turno aggiornato');assert.equal(out.patch.start.dateTime,'2026-11-25T14:00:00');assert.equal(out.patch.end.dateTime,'2026-11-25T18:00:00');
 assert.equal(out.patch.extendedProperties.private.runnerPulse,'manual-commitment');assert.equal(out.patch.extendedProperties.private.ownerHash,'owner');
});
test('modifica titolo e descrizione senza modificare data e orari',()=>{
 const out=buildCalendarFullEditPatch(orig,validateCalendarFullEdit({...input,date:'2026-11-21',startTime:'13:00',endTime:'17:00'}),wall);
 assert.equal(out.changeTime,false);assert.equal(out.patch.start,undefined);assert.equal(out.patch.end,undefined);
});
test('eventi tutta giornata conservano la durata e la data finale esclusiva',()=>{
 const all={...orig,start:{date:'2026-11-21'},end:{date:'2026-11-23'}};
 const out=buildCalendarFullEditPatch(all,validateCalendarFullEdit({...input,originalStart:'2026-11-21T00:00',originalEnd:'2026-11-23T00:00',allDay:true,date:'2026-12-02'}),wall);
 assert.deepEqual(out.patch.start,{date:'2026-12-02'});assert.deepEqual(out.patch.end,{date:'2026-12-04'});
});
test('una notte 23:30-01:00 può diventare una fascia 09:00-10:00 senza giorno extra',()=>{
 const late={...orig,start:{dateTime:'2026-11-21T23:30:00+01:00'},end:{dateTime:'2026-11-22T01:00:00+01:00'}};
 const out=buildCalendarFullEditPatch(late,validateCalendarFullEdit({...input,originalStart:'2026-11-21T23:30',originalEnd:'2026-11-22T01:00',startTime:'09:00',endTime:'10:00'}),wall);
 assert.equal(out.newEnd,'2026-11-25T10:00');
});
test('se ora finale precede la iniziale, termina il giorno successivo',()=>{
 const out=buildCalendarFullEditPatch(orig,validateCalendarFullEdit({...input,startTime:'23:30',endTime:'00:45'}),wall);
 assert.equal(out.newEnd,'2026-11-26T00:45');
});
test('blocca data non valida, titolo vuoto, orario malformato, snapshot obsoleto',()=>{
 for(const x of [{...input,date:'2026-02-30'},{...input,title:' '},{...input,startTime:'28:00'},{...input,category:'unsafe'}])assert.throws(()=>validateCalendarFullEdit(x),{status:400});
 assert.throws(()=>buildCalendarFullEditPatch(orig,validateCalendarFullEdit({...input,originalEnd:'2026-11-21T16:00'}),wall),{status:409});
});
test('endpoint modifica originale con PATCH protetta da etag, mai nuova creazione',async()=>{
 const src=fs.readFileSync(new URL('../google-calendar-integration.js',import.meta.url),'utf8');
 const from=src.indexOf('async function editFullCalendarCommitment('),to=src.indexOf('// Cambio della sola data',from);
 assert.ok(from>0&&to>from);
 const requests=[];
 const context={validateCalendarFullEdit,buildCalendarFullEditPatch,romeWall:wall,
  accessToken:async()=> 'bearer',calendarSources:async()=>({calendars:[{id:'primary',writable:true}]}),
  readAgenda:async()=>({events:[]}),overlappingEvent:()=>null,
  fetch:async(url,options)=>{requests.push({url,options});return options?.method==='PATCH'?{ok:true,status:200}:{ok:true,status:200,json:async()=>orig};},
  AbortSignal,URL,Error,encodeURIComponent,Date,Math,JSON,apiError:n=>Object.assign(Error('HTTP '+n),{status:n})};
 vm.createContext(context);vm.runInContext(src.slice(from,to),context);
 const result=await context.editFullCalendarCommitment('uid',input);
 assert.equal(result.updated,true);assert.equal(requests.length,2);assert.equal(requests[1].options.method,'PATCH');
 assert.equal(requests[1].options.headers['If-Match'],'v7');assert.equal(JSON.parse(requests[1].options.body).summary,'Turno aggiornato');
});
test('endpoint blocca modifica di eventi del Piano e privati',async()=>{
 const src=fs.readFileSync(new URL('../google-calendar-integration.js',import.meta.url),'utf8');
 const from=src.indexOf('async function editFullCalendarCommitment('),to=src.indexOf('// Cambio della sola data',from);
 for(const changed of [{visibility:'private'},{extendedProperties:{private:{runnerPulse:'training-plan'}}}]){
  let writes=0;
  const context={validateCalendarFullEdit,buildCalendarFullEditPatch,romeWall:wall,accessToken:async()=> 'bearer',calendarSources:async()=>({calendars:[{id:'primary',writable:true}]}),AbortSignal,encodeURIComponent,Error,
  fetch:async(url,opts)=>{if(opts?.method)writes++;return {ok:true,json:async()=>({...orig,...changed})};}};
  vm.createContext(context);vm.runInContext(src.slice(from,to),context);
  await assert.rejects(context.editFullCalendarCommitment('uid',input),{status:409});assert.equal(writes,0);
 }
});
