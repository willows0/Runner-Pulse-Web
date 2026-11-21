// Modifica mirata del tipo e della descrizione di un evento Google Calendar.
// Il server decide se l'evento originale puo essere scritto: il browser non e attendibile.
export const editableCategories=['work','sport','race','school','health','expense','food','other'];
export function validateCalendarEdit(input){
 const bad=(message)=>Object.assign(Error(message),{status:400});
 if(!input||typeof input!=='object'||Array.isArray(input))throw bad('Dati dell’impegno non validi.');
 const {eventId,calendarId,category,description}=input;
 if(typeof eventId!=='string'||!eventId||eventId.length>1024||/[\x00-\x1f]/.test(eventId))throw bad('Impegno non valido. Aggiorna il calendario.');
 if(typeof calendarId!=='string'||!calendarId||calendarId.length>1024||/[\x00-\x1f]/.test(calendarId))throw bad('Calendario non valido. Aggiorna il calendario.');
 if(typeof category!=='string'||!editableCategories.includes(category))throw bad('Seleziona un tipo di impegno valido.');
 if(typeof description!=='string'||description.length>4000)throw bad('La descrizione deve contenere al massimo 4000 caratteri.');
 return {eventId,calendarId,category,description:description.trim()};
}
