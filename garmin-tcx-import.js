import {createHash} from 'node:crypto';
import {XMLParser, XMLValidator} from 'fast-xml-parser';
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
const num=x=>x==null||x===''||!Number.isFinite(Number(x))?null:Number(x);
const epoch=x=>{const n=Date.parse(x);return Number.isFinite(n)?n/1000:null};
export function parseTcx(buffer){
 if(buffer.length>20*1024*1024)throw Error('TCX troppo grande (massimo 20 MB)');
 const xml=buffer.toString('utf8');
 if(XMLValidator.validate(xml)!==true)throw Error('XML TCX non valido');
 const root=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false}).parse(xml)?.TrainingCenterDatabase;
 const activities=arr(root?.Activities?.Activity);
 if(!activities.length)throw Error('TCX senza attività');
 return activities.map((a,i)=>{
  const laps=arr(a.Lap),points=laps.flatMap(l=>arr(l.Track).flatMap(t=>arr(t.Trackpoint)));
  const start=epoch(a.Id)||epoch(laps[0]?.['@_StartTime'])||epoch(points[0]?.Time);
  if(start==null)throw Error('TCX senza data');
  const duration=laps.reduce((s,l)=>s+(num(l.TotalTimeSeconds)||0),0);
  const distance=laps.reduce((s,l)=>s+(num(l.DistanceMeters)||0),0);
  if(duration<=0)throw Error('TCX senza durata valida');
  const samples=points.map(p=>{
   const t=epoch(p.Time);if(t==null)return null;
   const hr=num(p.HeartRateBpm?.Value),speed=num(p.Extensions?.TPX?.Speed),cad=num(p.Extensions?.TPX?.RunCadence);
   return {startTimeInSeconds:t,heartRate:hr,heartrate:hr,speedMetersPerSecond:speed,speed,totalDistanceInMeters:num(p.DistanceMeters),stepsPerMinute:cad, cadence:cad,altitude:num(p.AltitudeMeters),latitude:num(p.Position?.LatitudeDegrees),longitude:num(p.Position?.LongitudeDegrees)};
  }).filter(Boolean);
  const lapData=laps.map(l=>({startTimeInSeconds:epoch(l['@_StartTime']),duration:num(l.TotalTimeSeconds),distance:num(l.DistanceMeters),averageHeartRateInBeatsPerMinute:num(l.AverageHeartRateBpm?.Value),maxHeartRateInBeatsPerMinute:num(l.MaximumHeartRateBpm?.Value)}));
  const hrs=samples.map(p=>p.heartRate).filter(x=>x!=null&&x>0);
  const hash=createHash('sha256').update(String(start)+'|'+String(duration)+'|'+String(distance)+'|'+String(i)).digest('hex');
  const id='8'+BigInt('0x'+hash.slice(0,13)).toString().slice(0,14);
  const summary={activityId:id,startTimeInSeconds:start,durationInSeconds:duration,distanceInMeters:distance,averageHeartRateInBeatsPerMinute:hrs.length?Math.round(hrs.reduce((s,n)=>s+n,0)/hrs.length):null,maxHeartRateInBeatsPerMinute:hrs.length?hrs.reduce((m,n)=>Math.max(m,n),0):null,activityName:'Attività Garmin (TCX)',activityType:a['@_Sport']||'Allenamento',lapCount:lapData.length};
  return {id,summary,detail:{activityId:id,samples,laps:lapData}};
 });
}
