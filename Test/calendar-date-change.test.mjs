import test from 'node:test';
import assert from 'node:assert/strict';
import {validCalendarDate,dayDelta,addCalendarDays,validateDateChange,shiftedCalendarEvent} from '../calendar-date-change.js';

const wall=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T');

test('la data esiste nel calendario, incluso anno bisestile',()=>{
 assert.equal(validCalendarDate('2028-02-29'),true);
 assert.equal(validCalendarDate('2027-02-29'),false);
 assert.equal(validCalendarDate('2026-13-01'),false);
 assert.equal(validCalendarDate('2026-11-22'),true);
});
test('solo nuova data e ID validi sono accettati',()=>{
 const a={eventId:'abc',calendarId:'primary',newDate:'2026-11-29',originalStart:'2026-11-22T07:30',originalEnd:'2026-11-22T08:20'};
 assert.deepEqual(validateDateChange(a),a);
 assert.throws(()=>validateDateChange({...a,eventId:'abc\n'}));
 assert.throws(()=>validateDateChange({...a,newDate:'2026-11-32'}));
 assert.throws(()=>validateDateChange({...a,originalStart:'ciao'}));
});
test('sposta allenamento mattutino conservando orario e durata',()=>{
 const e={start:{dateTime:'2026-11-22T07:30:00+01:00'},end:{dateTime:'2026-11-22T08:20:00+01:00'}};
 const shifted=shiftedCalendarEvent(e,'2026-11-29',wall);
 assert.equal(shifted.originalStart,'2026-11-22T07:30');
 assert.equal(shifted.originalEnd,'2026-11-22T08:20');
 assert.equal(shifted.newStart,'2026-11-29T07:30');
 assert.equal(shifted.newEnd,'2026-11-29T08:20');
 assert.equal(shifted.durationMinutes,50);
 assert.equal(shifted.patch.end.dateTime,'2026-11-29T08:20:00');
});
test('cambio mese e anno con evento che finisce dopo mezzanotte',()=>{
 const e={start:{dateTime:'2026-12-31T23:30:00+01:00'},end:{dateTime:'2027-01-01T01:15:00+01:00'}};
 const shifted=shiftedCalendarEvent(e,'2027-02-01',wall);
 assert.equal(shifted.newStart,'2027-02-01T23:30');
 assert.equal(shifted.newEnd,'2027-02-02T01:15');
 assert.equal(shifted.durationMinutes,105);
});
test('sposta un evento tutto il giorno senza perderne la durata',()=>{
 const event={start:{date:'2026-11-22'},end:{date:'2026-11-25'}};
 const shifted=shiftedCalendarEvent(event,'2026-12-30',wall);
 assert.equal(shifted.patch.start.date,'2026-12-30');
 assert.equal(shifted.patch.end.date,'2027-01-02');
 assert.equal(shifted.durationDays,3);
});
test('conserva le ore locali sul cambio ora solare/legale',()=>{
 const event={start:{dateTime:'2026-10-21T18:30:00+02:00'},end:{dateTime:'2026-10-21T19:30:00+02:00'}};
 const result=shiftedCalendarEvent(event,'2026-11-21',wall);
 assert.equal(result.patch.start.dateTime,'2026-11-21T18:30:00');
 assert.equal(result.patch.end.dateTime,'2026-11-21T19:30:00');
});
test('rifiuta eventi malformati',()=>{
 assert.throws(()=>shiftedCalendarEvent({start:{date:'2026-11-21'},end:{date:'2026-11-20'}},'2026-12-01',wall));
 assert.throws(()=>shiftedCalendarEvent({start:{dateTime:'non-data'},end:{dateTime:'non-data'}},'2026-12-01',wall));
});
test('differenze di giorni valide',()=>{
 assert.equal(dayDelta('2026-12-31','2027-01-01'),1);
 assert.equal(addCalendarDays('2026-12-31',2),'2027-01-02');
});
