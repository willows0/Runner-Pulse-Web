// Importazione locale di file FIT Garmin, senza servizi esterni o dati sintetici.
import {inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const FIT_EPOCH=631065600;
const num=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
function unzip(buffer){
 if(buffer.length<22)throw Error('ZIP non valido');
 let e=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){if(buffer.readUInt32LE(i)===0x06054b50){e=i;break;}}
 if(e<0)throw Error('Directory ZIP mancante');
 const count=buffer.readUInt16LE(e+10),start=buffer.readUInt32LE(e+16);
 if(count>15000)throw Error('Archivio con troppi file');
 let p=start,total=0;const out=[];
 for(let i=0;i<count;i++){
  if(p+46>buffer.length||buffer.readUInt32LE(p)!==0x02014b50)throw Error('Indice ZIP non valido');
  const flags=buffer.readUInt16LE(p+8),method=buffer.readUInt16LE(p+10),compressed=buffer.readUInt32LE(p+20),uncompressed=buffer.readUInt32LE(p+24),nl=buffer.readUInt16LE(p+28),ex=buffer.readUInt16LE(p+30),comment=buffer.readUInt16LE(p+32),offset=buffer.readUInt32LE(p+42);
  const name=buffer.subarray(p+46,p+46+nl).toString('utf8');p+=46+nl+ex+comment;
  if(!/\.(fit|zip)$/i.test(name)||name.endsWith('/'))continue;
  if(flags&1)throw Error('ZIP cifrato non supportato');
  if(uncompressed>32*1024*1024||compressed>48*1024*1024||total+uncompressed>512*1024*1024)throw Error('Archivio FIT troppo grande');
  if(offset+30>buffer.length||buffer.readUInt32LE(offset)!==0x04034b50)throw Error('File ZIP danneggiato');
  const dataStart=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28);
  if(dataStart+compressed>buffer.length)throw Error('Contenuto ZIP incompleto');
  const raw=buffer.subarray(dataStart,dataStart+compressed);
  const data=method===0?raw:method===8?inflateRawSync(raw,{maxOutputLength:32*1024*1024}):null;
  if(!data||data.length!==uncompressed)throw Error('Compressione ZIP non supportata o file danneggiato');
  total+=uncompressed;out.push({name,data});
 }
 return out;
}
function parseFit(buffer){
 if(buffer.length<14||buffer.subarray(8,12).toString()!=='.FIT')throw Error('File FIT non valido');
 const header=buffer[0],length=buffer.readUInt32LE(4),end=header+length;
 if(header<12||end>buffer.length||length>32*1024*1024)throw Error('Dimensione FIT non valida');
 let p=header;const definitions=new Map(),records=[],laps=[];let session=null,fileId=null;
 const read=(size,type,le)=>{
  const base=type&31;const dv=new DataView(buffer.buffer,buffer.byteOffset+p,size);
  let v=null;
  if(base===0||base===2||base===10||base===13)v=size===1?dv.getUint8(0):null;
  else if(base===1)v=size===1?dv.getInt8(0):null;
  else if(base===3)v=size===2?dv.getInt16(0,le):null;
  else if(base===4||base===11)v=size===2?dv.getUint16(0,le):null;
  else if(base===5)v=size===4?dv.getInt32(0,le):null;
  else if(base===6||base===12)v=size===4?dv.getUint32(0,le):null;
  else if(base===8)v=size===4?dv.getFloat32(0,le):null;
  else if(base===9)v=size===8?dv.getFloat64(0,le):null;
  else if(base===14&&size===8){const n=dv.getBigUint64(0,le);v=n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;}
  else if(base===7)v=buffer.subarray(p,p+size).toString('utf8').replace(/\0.*$/s,'');
  const invalid={0:255,1:127,2:255,3:32767,4:65535,5:2147483647,6:4294967295,10:0,11:0,12:0,13:255};
  if(v===invalid[base]||typeof v==='number'&&!Number.isFinite(v))v=null;
  p+=size;return v;
 };
 while(p<end){
  const h=buffer[p++],local=h&15;
  if(!(h&128)&&(h&64)){
   if(p+5>end)throw Error('Definizione FIT incompleta');
   p++;const le=buffer[p++]===0;const global=le?buffer.readUInt16LE(p):buffer.readUInt16BE(p);p+=2;
   const count=buffer[p++],fields=[];if(count>100)throw Error('FIT non valido');
   for(let j=0;j<count;j++){if(p+3>end)throw Error('Campi FIT incompleti');fields.push([buffer[p++],buffer[p++],buffer[p++]]);}
   let dev=[];if(h&32){if(p>=end)throw Error('FIT non valido');const n=buffer[p++];for(let j=0;j<n;j++){if(p+3>end)throw Error('FIT non valido');dev.push(buffer[p+1]);p+=3;}}
   definitions.set(local,{le,global,fields,dev});continue;
  }
  const def=definitions.get(h&128?(h>>5)&3:h&15);if(!def)throw Error('Messaggio FIT senza definizione');
  const obj={};for(const [id,size,type] of def.fields){if(p+size>end)throw Error('Dati FIT incompleti');obj[id]=read(size,type,def.le);}
  for(const size of def.dev){if(p+size>end)throw Error('Dati FIT incompleti');p+=size;}
  if(def.global===0)fileId=obj;
  if(def.global===18)session=obj;
  if(def.global===19)laps.push(obj);
  if(def.global===20&&records.length<50000)records.push(obj);
 }
 if(!session&&!records.length)throw Error('FIT senza dati di allenamento');
 const timestamp=num(session?.[2])??num(records[0]?.[253]);
 const start=num(session?.[2])??num(laps[0]?.[2])??num(records[0]?.[253]);
 if(start==null)throw Error('FIT senza data di inizio');
 const time=start+FIT_EPOCH;
 const duration=num(session?.[8])!=null?session[8]/1000:null;
 const distance=num(session?.[9])!=null?session[9]/100:null;
 const activityId='9'+createHash('sha256').update(buffer).digest('hex').slice(0,14).replace(/[a-f]/g,c=>String(parseInt(c,16)%10));
 const samples=records.map(r=>({startTimeInSeconds:num(r[253])==null?null:r[253]+FIT_EPOCH,heartRate:num(r[3]),heartrate:num(r[3]),speedMetersPerSecond:num(r[6])==null?null:r[6]/1000,speed:num(r[6])==null?null:r[6]/1000,stepsPerMinute:num(r[4]),cadence:num(r[4]),altitude:num(r[2])==null?null:r[2]/5-500,totalDistanceInMeters:num(r[5])==null?null:r[5]/100,latitude:num(r[0])==null?null:r[0]*180/2147483648,longitude:num(r[1])==null?null:r[1]*180/2147483648})).filter(x=>x.startTimeInSeconds!=null);
 const lapData=laps.map(l=>({startTimeInSeconds:num(l[2])==null?null:l[2]+FIT_EPOCH,duration:num(l[8])==null?null:l[8]/1000,distance:num(l[9])==null?null:l[9]/100,averageHeartRateInBeatsPerMinute:num(l[15]),maxHeartRateInBeatsPerMinute:num(l[16])}));
 const summary={activityId,startTimeInSeconds:time,durationInSeconds:duration,distanceInMeters:distance,averageHeartRateInBeatsPerMinute:num(session?.[16]),maxHeartRateInBeatsPerMinute:num(session?.[17]),activityName:'Attività Garmin (FIT)',activityType:'Allenamento',lapCount:lapData.length};
 if(!Number.isFinite(summary.durationInSeconds)||summary.durationInSeconds<=0)throw Error('FIT senza durata valida');
 return {id:activityId,summary,detail:{activityId,samples,laps:lapData},fileId:fileId?.[3]??null};
}
export function parseGarminArchive(buffer,filename){
 const files=/\.fit$/i.test(filename)?[{name:filename,data:buffer}]:/\.zip$/i.test(filename)?unzip(buffer):null;
 if(!files)throw Error('Seleziona un file .FIT o .ZIP');
 const expanded=[];for(const f of files){if(/\.zip$/i.test(f.name)){try{for(const child of unzip(f.data))expanded.push({name:f.name+'/'+child.name,data:child.data});}catch(error){expanded.push({name:f.name,error:error.message});}}else expanded.push(f);}
 return expanded.map(f=>{if(f.error)return {name:f.name,error:f.error};try{return {name:f.name,activity:parseFit(f.data)}}catch(error){return {name:f.name,error:error.message}}});
}
