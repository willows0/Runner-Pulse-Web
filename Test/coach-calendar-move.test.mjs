import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCalendarMove,overlappingEvent} from '../coach-calendar-move.js';
const today='2026-11-20';
const event=(date,overrides={})=>({id:date,calendarId:'primary',title:'Lungo facile',startLocal:date+'T18:30',endLocal:date+'T20:15',calendarMoveWritable:true,eventType:'default',eventKind:'commitment',allDay:false,busy:true,...overrides});
const question='Mi sposti su calendar l allenamento lungo di venerdì a domenica';
test('sposta su Calendar senza richiedere un Piano salvato',()=>{
 const result=selectCalendarMove(question,[event('2026-11-27')],{today});
 assert.equal(result.newStart,'2026-11-29T18:30');
 assert.equal(result.newEnd,'2026-11-29T20:15');
 assert.equal(result.durationMinutes,105);
});
test('non inventa quale allenamento spostare se ne trova più di uno',()=>{
 const result=selectCalendarMove(question,[event('2026-11-27'),event('2026-12-04')],{today});
 assert.equal(result.needsClarification,true);
 assert.match(result.message,/più allenamenti/i);
});
test('accetta la data di partenza inviata successivamente nella chat',()=>{
 const result=selectCalendarMove(question+'\nDettaglio aggiunto: venerdì 27 novembre',[event('2026-11-27'),event('2026-12-04')],{today});
 assert.equal(result.newStart,'2026-11-29T18:30');
});
test('accetta una data di destinazione esplicita e una nuova ora',()=>{
 const result=selectCalendarMove('Sposta il lungo del 27 novembre al 29 novembre alle 10:00',[event('2026-11-27')],{today});
 assert.equal(result.newStart,'2026-11-29T10:00');
 assert.equal(result.newEnd,'2026-11-29T11:45');
});
test('non tratta le corse completate come impegni spostabili',()=>{
 const result=selectCalendarMove(question,[event('2026-11-27',{eventKind:'completed-workout'})],{today});
 assert.equal(result.needsClarification,true);
});
test('non sposta un evento senza permessi di modifica',()=>{
 const result=selectCalendarMove(question,[event('2026-11-27',{calendarMoveWritable:false})],{today});
 assert.equal(result.needsClarification,true);
});
test('non sposta eventi speciali o di tutta la giornata',()=>{
 const result=selectCalendarMove(question,[event('2026-11-27',{eventType:'birthday'}),event('2026-11-27',{allDay:true})],{today});
 assert.equal(result.needsClarification,true);
});
test('rileva impegni sovrapposti e ignora lo stesso evento',()=>{
 const target={id:'original',calendarId:'primary',newStart:'2026-11-29T18:30',newEnd:'2026-11-29T20:15'};
 assert.equal(overlappingEvent([event('2026-11-29',{id:'original'})],target),null);
 const collision=overlappingEvent([event('2026-11-29',{id:'different',title:'Visita'})],target);
 assert.equal(collision.title,'Visita');
});
test('non considera conflitti gli eventi marcati liberi',()=>{
 const target={id:'original',calendarId:'primary',newStart:'2026-11-29T18:30',newEnd:'2026-11-29T20:15'};
 assert.equal(overlappingEvent([event('2026-11-29',{id:'different',busy:false})],target),null);
});
test('rifiuta nuova data passata o uguale',()=>{
 assert.equal(selectCalendarMove('Sposta il lungo di venerdì al 19 novembre',[event('2026-11-27')],{today}).needsClarification,true);
 assert.equal(selectCalendarMove('Sposta il lungo di venerdì a venerdì',[event('2026-11-27')],{today}).needsClarification,true);
});
