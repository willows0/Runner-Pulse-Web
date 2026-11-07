# Runner Pulse Web

Versione iniziale per Render (Node.js senza dipendenze esterne).

## Render
- Language: Node
- Branch: main
- Root directory: vuota
- Build command: `npm install`
- Start command: `npm start`
- Plan: Free

## Sicurezza Garmin
Non inserire la chiave API nel repository o nel browser. La variabile server `GARMIN_API_KEY` è rilevata soltanto per indicare lo stato di configurazione: **non è ancora implementata alcuna chiamata all'API Garmin**. Verificare prima gli endpoint, la procedura di autenticazione e i permessi della Personal API.

## Funzioni
- Dashboard e storico allenamenti inseriti manualmente (localStorage)
- Programma indicativo 3 giorni/settimana
- Esportazione JSON
- Calendario ICS da importare manualmente
- Allenatore: riepilogo statistico, **non** chat AI

I dati manuali non sono sincronizzati tra browser o dispositivi.
