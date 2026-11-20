import test from 'node:test';
import assert from 'node:assert/strict';
import {tryDirectPlanMove} from '../coach-plan-move.js';
import {isSessionBusy,sessionWindow} from '../public/calendar-slot-planner.js';
const plan=[
 {date:'2026-11-24',time:'18:30',title:'Corsa facile',details:'Facile',minutes:45},
 {date:'2026-11-26',time:'18:30',title:'Ritmo controllato',details:'Progressivo',minutes:50},
 {date:'2026-11-29',time:'09:00',title:'Lungo facile',details:'Ritmo comodo',minutes:101},
 {date:'2026-12-01',time:'18:30',title:'Corsa facile',details:'Facile',minutes:45}
];
test('sposta una seduta in una data esplicita conservando gli altri contenuti',()=>{
 const p=tryDirectPlanMove('Sposta il lungo di domenica 29 novembre a sabato 28 novembre alle 10',plan,{today:'2026-11-20'});
 assert.equal(p.changedIndices[0],2);assert.equal(p.sessions[2].date,'2026-11-28');assert.equal(p.sessions[2].time,'10:00');
 assert.equal(p.sessions[2].minutes,101);assert.deepEqual(p.sessions[0],plan[0]);
});
test('sposta la corsa nominata per data al giovedì, conservando la durata',()=>{
 const p=tryDirectPlanMove('sposta la corsa del 24/11 a giovedì alle 19:30',plan,{today:'2026-11-20'});
 assert.equal(p.sessions[0].date,'2026-11-26');assert.equal(p.sessions[0].time,'19:30');assert.equal(p.sessions[0].minutes,45);
});
test('ora soltanto: mantiene il giorno selezionato',()=>{
 const p=tryDirectPlanMove('Sposta il lungo del 29 novembre alle 10',plan,{today:'2026-11-20'});
 assert.equal(p.sessions[2].date,'2026-11-29');assert.equal(p.sessions[2].time,'10:00');
});
test('più corse di martedì: chiede la data e non modifica nulla',()=>{
 const p=tryDirectPlanMove('sposta la corsa facile di martedì a giovedì',plan,{today:'2026-11-20'});
 assert.ok(p.clarification);assert.equal(p.sessions,undefined);
});
test('rifiuta una data passata',()=>{
 const p=tryDirectPlanMove('sposta il lungo del 29 novembre a 15 novembre',plan,{today:'2026-11-20'});
 assert.match(p.clarification,/passata/);
});
test('non sposta se il nuovo orario coincide con quello attuale',()=>{
 const p=tryDirectPlanMove('sposta il lungo del 29 novembre alle 9',plan,{today:'2026-11-20'});
 assert.ok(p.clarification);
});
test('non interpreta una richiesta generica al Coach come uno spostamento',()=>{
 assert.equal(tryDirectPlanMove('Come preparo la mezza maratona?',plan),null);
});
test('rileva il conflitto con un impegno Google Calendar',()=>{
 const s={...plan[0],date:'2026-11-26',time:'19:00'};
 const agenda=[{startLocal:'2026-11-26T19:00',endLocal:'2026-11-26T21:00',busy:true,runnerPulse:false}];
 assert.equal(isSessionBusy(s,agenda,15),true);
});
test('ignora eventi del Piano gestiti separatamente',()=>{
 const s={...plan[0],date:'2026-11-26',time:'19:00'};
 const agenda=[{startLocal:'2026-11-26T19:00',endLocal:'2026-11-26T21:00',busy:true,runnerPulse:true}];
 assert.equal(isSessionBusy(s,agenda,15),false);
});
test('confronta gli intervalli delle sedute senza usare orari UTC reali',()=>{
 const a=sessionWindow(plan[0]);assert.equal((a.end-a.start)/60000,45);
});
