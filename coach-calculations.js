// Runner Pulse: calcoli deterministici, nessun dato simulato.
const round=(n,d=2)=>Number(n.toFixed(d));
const valid=n=>typeof n==='number'&&Number.isFinite(n);
export function riegel(distanceKm,timeSeconds,targetKm,exponent=1.06){
 if(![distanceKm,timeSeconds,targetKm,exponent].every(valid)||distanceKm<=0||timeSeconds<=0||targetKm<=0||exponent<1||exponent>1.2)return null;
 const seconds=timeSeconds*Math.pow(targetKm/distanceKm,exponent);
 return {sourceKm:distanceKm,targetKm,exponent,estimatedSeconds:round(seconds),estimatedPaceSecondsPerKm:round(seconds/targetKm),assumption:'Prestazione massimale rappresentativa; previsione non garantita'};
}
export function heartRateZones(profile={}){
 const rest=Number(profile.restHR),max=Number(profile.maxHR);
 if(!profile.restHR||!profile.maxHR||!valid(rest)||!valid(max)||rest<25||max>240||max-rest<40)return {available:false,reason:'Servono FC massima e a riposo misurate e plausibili; non stimate dal sesso'};
 const bands=[[.5,.6],[.6,.7],[.7,.8],[.8,.9],[.9,1]];
 return {available:true,method:'Karvonen (% riserva cardiaca), intervalli indicativi, non soglie cliniche',restHR:rest,maxHR:max,zones:bands.map(([lo,hi],i)=>({zone:i+1,fromBpm:Math.round(rest+(max-rest)*lo),toBpm:Math.round(rest+(max-rest)*hi)}))};
}
export function weeklyLoad(activities=[],today=new Date()){
 const end=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
 const buckets=Array.from({length:4},()=>({km:0,runs:0,minutes:0}));
 for(const a of activities){if(!/run|corsa|trail/i.test(String(a.kind||'')))continue;
  const d=/^\d{4}-\d{2}-\d{2}$/.test(a.date||'')?new Date(a.date+'T00:00:00Z'):null;
  if(!d||!Number.isFinite(d.getTime()))continue;
  const days=Math.floor((end-d)/86400000);if(days<0||days>=28)continue;
  const km=Number(a.km),minutes=Number(a.minutes);if(!valid(km)||km<=0||km>200)continue;
  const b=buckets[Math.floor(days/7)];b.km+=km;b.runs++;if(valid(minutes)&&minutes>0)b.minutes+=minutes;
 }
 const weeks=buckets.map((b,i)=>({period:i===0?'ultimi 7 giorni':`${i*7+1}-${(i+1)*7} giorni fa`,km:round(b.km),runs:b.runs,minutes:round(b.minutes)}));
 const older=weeks.slice(1).map(w=>w.km).filter(x=>x>0);
 return {weeks,comparison:older.length&&weeks[0].km>0?{currentKm:weeks[0].km,previousAverageKm:round(older.reduce((a,b)=>a+b,0)/older.length),note:'Confronto descrittivo, non indice validato di rischio infortuni'}:null};
}
export function intensityDistribution(activities=[]){
 const runs=activities.filter(a=>/run|corsa|trail/i.test(String(a.kind||''))&&Number(a.minutes)>0);
 return {available:false,runCount:runs.length,reason:'Non calcolabile in modo affidabile dai soli valori medi di FC: servono minuti per zona o dati campionati di intensità. Non assegnare 80/20 arbitrariamente.'};
}
export function vdotFromRace(distanceKm,timeMinutes){
 if(![distanceKm,timeMinutes].every(valid)||distanceKm<1.5||distanceKm>42.3||timeMinutes<=0)return null;
 const v=distanceKm*1000/timeMinutes;
 const oxygen=-4.60+0.182258*v+0.000104*v*v;
 const fraction=0.8+0.1894393*Math.exp(-0.012778*timeMinutes)+0.2989558*Math.exp(-0.1932605*timeMinutes);
 if(fraction<=0||oxygen<=0)return null;
 return {vdot:round(oxygen/fraction,1),distanceKm,timeMinutes,method:'Daniels/Gilbert, stima da prestazione massimale verificata',warning:'Non applicare a corsa facile o allenamento non massimale'};
}
export function intervalDistance({warmupKm=0,repetitions=0,workMeters=0,recoveries=0,recoveryMeters=null,cooldownKm=0}={}){
 const nums=[warmupKm,repetitions,workMeters,recoveries,cooldownKm];if(nums.some(n=>!valid(n)||n<0)||!Number.isInteger(repetitions)||!Number.isInteger(recoveries))return null;
 const known=warmupKm+repetitions*workMeters/1000+cooldownKm;
 if(recoveryMeters==null)return {knownKm:round(known),exact:recoveries===0,missing:'Distanza dei recuperi non specificata'};
 if(!valid(recoveryMeters)||recoveryMeters<0)return null;
 return {totalKm:round(known+recoveries*recoveryMeters/1000),exact:true};
}
export function pacingDebt({targetKm,targetSeconds,completedKm,elapsedSeconds}){
 if(![targetKm,targetSeconds,completedKm,elapsedSeconds].every(valid)||targetKm<=completedKm||completedKm<=0||targetSeconds<=elapsedSeconds||elapsedSeconds<=0)return null;
 const targetPace=targetSeconds/targetKm,actualPace=elapsedSeconds/completedKm;
 return {targetPaceSecKm:round(targetPace),earlyPaceSecKm:round(actualPace),timeGainedSeconds:round(completedKm*targetPace-elapsedSeconds),requiredRemainingPaceSecKm:round((targetSeconds-elapsedSeconds)/(targetKm-completedKm)),note:'Solo aritmetica del passo; non quantifica un debito fisiologico'};
}
export function coachMetrics(activities,profile,now=new Date()){
 return {heartRateZones:heartRateZones(profile),weeklyLoad:weeklyLoad(activities,now),intensityDistribution:intensityDistribution(activities),formulas:{riegel:'T2=T1*(D2/D1)^1.06; valido solo per prestazioni rappresentative',vdot:'Richiede gara o test massimale verificato; non stimato automaticamente da attività generiche',intervalDistance:'Somma riscaldamento, tratti veloci, recuperi e defaticamento; segnala distanze ignote',pacing:'Calcola passo necessario e tempo guadagnato, non debito fisiologico'}};
}
