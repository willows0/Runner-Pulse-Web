// Riepilogo reale degli allenamenti completati: nessun dato inventato.
// Questa parte non accede a Google e si può verificare con test unitari.
const num=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const first=(obj,keys)=>keys.map(k=>obj?.[k]).find(v=>v!==null&&v!==undefined&&v!=='');
const positive=v=>{const n=num(v);return n!==null&&n>=0?n:null;};
const humanDuration=seconds=>{const sec=Math.round(seconds);const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h?[h+'h',m+'min',s?s+'s':null].filter(Boolean).join(' '):m?[m+'min',s?s+'s':null].filter(Boolean).join(' '):s+'s';};
const humanPace=(meters,seconds)=>{if(!Number.isFinite(meters)||meters<=0||!Number.isFinite(seconds)||seconds<=0)return null;const pace=Math.round(seconds*1000/meters);if(pace<120||pace>5400)return null;return Math.floor(pace/60)+':'+String(pace%60).padStart(2,'0')+' min/km';};
export function completedWorkoutSummary(record,{health=false,activityId=''}={}){
 if(!record||typeof record!=='object'||record.duplicateOfGarminId||record.duplicateOfHealthId)return null;
 const base=health?record:(record.summary||record);
 const start=num(first(base,['startTimeInSeconds','startTime','beginTimestamp','start']));
 const startMs=start===null?NaN:(start<1e11?start*1000:start);
 const seconds=positive(first(base,['durationInSeconds','elapsedDuration','duration']));
 if(!Number.isFinite(startMs)||startMs<946684800000||!Number.isFinite(seconds)||seconds<30||seconds>24*3600)return null;
 const distance=positive(first(base,['distanceInMeters','distanceMeters','distance']));
 const averageHr=positive(first(base,['averageHeartRateInBeatsPerMinute','averageHR','averageHeartRate','avgHeartRate']));
 const maxHr=positive(first(base,['maxHeartRateInBeatsPerMinute','maxHR','maxHeartRate']));
 const originalType=first(base,['activityName','title','activityTypeName','name','activityType']);
 const type=String(typeof originalType==='object'?first(originalType,['typeName','name','typeKey'])||'Allenamento':originalType||'Allenamento').slice(0,100);
 const sources=health?(record.source==='honor'?'HONOR Health':'Health Connect'):/manual-(fit|tcx)/.test(record.source||'')?'FIT/TCX importato':'Garmin Connect';
 const detail=record.officialActivityDetails||record.detail||record.activityDetail||{};
 const candidates=[detail?.laps,detail?.lapDTOs,detail?.lapSummaries,record.laps,record.lapDTOs,record.lapSummaries,base.laps,base.lapDTOs,base.lapSummaries];
 const laps=(candidates.find(items=>Array.isArray(items)&&items.length)||[]).slice(0,100).flatMap((l,i)=>{
  if(!l||typeof l!=='object')return [];
  const sec=positive(first(l,['duration','elapsedDuration','movingDuration','durationInSeconds']));
  const meters=positive(first(l,['distance','distanceMeters','distanceInMeters']));
  if(sec===null&&meters===null)return [];
  const hr=positive(first(l,['averageHeartRateInBeatsPerMinute','averageHeartRate','averageHR']));
  const parts=[`Lap ${i+1}`];
  if(meters!==null)parts.push((meters/1000).toFixed(2)+' km');
  if(sec!==null)parts.push(humanDuration(sec));
  const pace=humanPace(meters,sec);if(pace)parts.push(pace);
  if(hr!==null&&hr>=25&&hr<=250)parts.push(Math.round(hr)+' bpm');
  return [parts.join(' · ')];
 });
 const lines=[`Fonte: ${sources}`,`Durata effettiva: ${humanDuration(seconds)}`];
 if(distance!==null)lines.push(`Distanza effettiva: ${(distance/1000).toFixed(2)} km`);
 const pace=humanPace(distance,seconds);if(pace)lines.push('Passo medio: '+pace);
 if(averageHr!==null&&averageHr>=25&&averageHr<=250)lines.push('FC media: '+Math.round(averageHr)+' bpm');
 if(maxHr!==null&&maxHr>=25&&maxHr<=250)lines.push('FC massima registrata: '+Math.round(maxHr)+' bpm');
 if(laps.length)lines.push(`Lap / ripetute registrati (${laps.length}):`,...laps);
 lines.push('Dati reali sincronizzati da Runner Pulse.');
 return {activityId:String(activityId),startMs,durationSeconds:seconds,title:type,source:sources,lapsCount:laps.length,description:lines.join('\n').slice(0,17000)};
}
