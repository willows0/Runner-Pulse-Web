import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/login.js',import.meta.url),'utf8');
test('FIT duplicato: non torna alla lista e mostra un messaggio visibile',()=>{
 assert.match(source,/if\(imported===0 && duplicates>0\)/);
 assert.match(source,/Allenamento già presente\. Nessun duplicato creato\./);
 assert.match(source,/status\.textContent=duplicates===1[\s\S]*?Nessun duplicato creato/);
 assert.match(source,/if\(imported===0 && duplicates>0\)\{[\s\S]*?return;/);
});
test('FIT nuovo: notifica nella lista prima di cambiare scheda',()=>{
 assert.match(source,/rp-import-list-feedback/);
 assert.match(source,/if\(imported>0\)\{/);
 assert.match(source,/await loadGarminArchive\(\)/);
});
test('Limite file client coerente con server di 40 MB',()=>{
 assert.match(source,/file\.size>40\*1024\*1024/);
});

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const styles=await readFile(new URL('../public/orange.css',import.meta.url),'utf8');
test('Selettore FIT usa un pulsante personalizzato e un nome file leggibile',()=>{
 assert.match(html,/id="rp-fit-choose"[^>]+type="button"/);
 assert.match(html,/id="rp-fit-file"[^>]+type="file"/);
 assert.match(html,/id="rp-fit-selected-name"[^>]*>Nessun file selezionato/);
 assert.match(styles,/#rp-import-panel \.rp-fit-file-input\{display:none!important;\}/);
 assert.match(styles,/#rp-import-panel \.rp-fit-choose/);
});
test('Clic su Seleziona file apre il selettore nativo e mostra nome in modo sicuro',()=>{
 assert.match(source,/getElementById\('rp-fit-choose'\)\?\.addEventListener\('click'/);
 assert.match(source,/rpFitFileInput\?\.click\(\)/);
 assert.match(source,/rpFitSelectedName\.textContent=file\?\.name\|\|'Nessun file selezionato'/);
 assert.match(source,/if\(rpFitSelectedName\)rpFitSelectedName\.textContent='Nessun file selezionato'/);
});
test('Versioni aggiornate impediscono di riutilizzare file vecchi nella cache',()=>{
 assert.match(html,/orange\.css\?v=fit-chooser-20261121-v1/);
 assert.match(html,/login\.js\?v=fit-chooser-feedback-20261121-v1/);
});
