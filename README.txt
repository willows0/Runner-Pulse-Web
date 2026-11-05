Runner Pulse Web - schermata login Google

1. Caricare public/login.js e public/login.css nella cartella public del repository.
2. Nel file public/index.html, immediatamente prima di </body>, aggiungere:
<link rel="stylesheet" href="/login.css">
<script type="module" src="/login.js"></script>
3. Effettuare il deploy su Render.

ATTENZIONE: questo è un blocco dell'interfaccia, NON una protezione delle API.
Il server deve verificare i Firebase ID token (firma, issuer, audience, scadenza,
email verificata, e UID autorizzato) su ogni endpoint privato, prima di usare
Garmin o esporre dati. Non usare questo pacchetto come protezione completa.

Firebase: autorizzare runner-pulse-web.onrender.com in Authentication > Impostazioni > Domini autorizzati.
Per i popup, verificare le restrizioni del browser. Firebase authDomain predefinito
può avere limitazioni per il flusso redirect su alcuni browser.
