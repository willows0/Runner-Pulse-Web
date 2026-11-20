import test from 'node:test';
import assert from 'node:assert/strict';
import {durationFromText,computeEnd,safeProposal,validateCommitment} from '../calendar-commitment-validation.js';

const example={title:'Corsa facile',category:'sport',date:'2026-11-21',startTime:'18:30',allDay:false};

test('un allenamento di 60 minuti termina alle 19:30',()=>{
 const saved=validateCommitment({...example,durationMinutes:60},{today:'2026-11-20'});
 assert.equal(saved.endTime,'19:30');assert.equal(saved.endDate,'2026-11-21');
});
test('il modello puo dare una durata e non l’ora di fine',()=>{
 const proposal=safeProposal({...example,durationMinutes:45});
 assert.equal(proposal.endTime,'19:15');assert.equal(proposal.durationMinutes,45);
});
test('la durata fornita prevale su una fine AI incoerente',()=>{
 const saved=validateCommitment({...example,durationMinutes:90,endTime:'19:00'});
 assert.equal(saved.endTime,'20:00');
});
test('durata oltre mezzanotte sposta la data finale',()=>{
 const saved=validateCommitment({...example,startTime:'23:30',durationMinutes:90});
 assert.equal(saved.endTime,'01:00');assert.equal(saved.endDate,'2026-11-22');
});
test('testo dettato con ore e minuti espliciti',()=>{
 assert.equal(durationFromText('Salva allenamento domani alle 18, durata 60 minuti'),60);
 assert.equal(durationFromText("Corsa domani alle 18:00 per un’ora e mezza"),90);
 assert.equal(durationFromText('Allenamento alle 18, per 45 min'),45);
 assert.equal(durationFromText('Corsa per 1h30'),90);
 assert.equal(durationFromText('Salva allenamento alle 18'),null);
});
test('nessun orario finale inventato senza durata',()=>{
 assert.throws(()=>validateCommitment({...example}),/durata/i);
});
test('rimane possibile inserire ora di fine senza durata',()=>{
 assert.equal(validateCommitment({...example,endTime:'19:00'}).endTime,'19:00');
});
test('durate non valide vengono rifiutate',()=>{
 assert.throws(()=>validateCommitment({...example,durationMinutes:0}),/durata/i);
 assert.throws(()=>validateCommitment({...example,durationMinutes:900}),/durata/i);
});
