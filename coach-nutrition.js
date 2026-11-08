// Runner Pulse — indicazioni nutrizionali generali, non prescrizioni cliniche.
const r=(n)=>Math.round(n*10)/10;
export function nutritionGuidance(profile={}, activities=[]){
 const weight=Number(profile.weight);
 const validWeight=profile.weight!==null&&profile.weight!==undefined&&profile.weight!==''&&Number.isFinite(weight)&&weight>=30&&weight<=250;
 const running=Array.isArray(activities)?activities.filter(a=>/run|corsa|trail/i.test(String(a.kind||''))):[];
 const recent=running.filter(a=>/^\d{4}-\d{2}-\d{2}$/.test(a.date||'')).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,14);
 const longest=recent.reduce((max,a)=>Math.max(max,Number(a.minutes)||0),0);
 return {
  scope:'Orientamento generale per runner adulti; personalizzare per età, condizioni mediche, tolleranza gastrointestinale e carico. Non è una dieta clinica.',
  weightKg:validWeight?weight:null,
  proteinDailyGrams:validWeight?{lower:r(weight*1.6),upper:r(weight*2.2),basis:'1,6–2,2 g/kg/die come intervallo orientativo, non obiettivo obbligatorio'}:null,
  proteinDistribution:'Distribuire le proteine nella giornata; 4–5 occasioni possono essere pratiche, ma 25–30 g non è una quantità universale: dipende dal peso e dal totale giornaliero.',
  carbohydratePeriodization:'Adeguare i carboidrati al lavoro previsto e al recupero: più disponibilità per lunghi e qualità, meno necessità nei giorni leggeri senza imporre restrizioni caloriche.',
  beforeTraining:'Prima di sedute impegnative scegliere alimenti abituali, ben tollerati, prevalentemente ricchi di carboidrati e relativamente poveri di fibre/grassi nelle ore vicine; latte e latticini solo se mal tollerati.',
  duringTraining:'Per esercizio prolungato, valutare carboidrati e liquidi in base a durata, intensità e tolleranza; provare la strategia in allenamento, non il giorno della gara.',
  afterTraining:'Dopo allenamenti lunghi/intensi o con recupero breve, assumere carboidrati, proteine e liquidi; non esiste una finestra rigida universale di 60 minuti.',
  energyAvailability:'Evitare bassa disponibilità energetica cronica (RED-S). Non stimare la disponibilità energetica o diagnosticare RED-S da peso, sesso e corse Garmin; servono informazioni cliniche e sulla composizione corporea.',
  foodComposition:'Per kcal e macronutrienti di singoli alimenti usare tabelle CREA o banche dati verificate con porzione, stato crudo/cotto e marca. Non inventare valori né dichiarare consultazioni non avvenute.',
  recentRunCount:recent.length,
  longestRecentRunMinutes:longest>0?r(longest):null,
  caution:'In presenza di disturbi alimentari, perdita di peso non intenzionale, amenorrea, infortuni da stress o forte affaticamento, suggerire valutazione con medico/dietista sportivo.'
 };
}
