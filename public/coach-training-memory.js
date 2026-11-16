// Memoria tecnica deterministica, privata per UID. Nessuna chiamata AI e nessun dato inventato.
const finite = v => v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const rounded = (v,n=1) => v === null ? null : Number(v.toFixed(n));
const lapSummary = lap => ({
  distanceMeters:finite(lap.distance??lap.distanceMeters),
  durationSeconds:finite(lap.duration??lap.elapsedDuration??lap.movingDuration),
  averageHeartRate:finite(lap.averageHeartRate??lap.avgHeartRate),
  averageSpeed:finite(lap.averageSpeed??lap.avgSpeed)
});
function summarizeSeries(samples,keys){
  const values=samples.map(s=>keys.map(k=>finite(s?.[k])).find(v=>v!==null)??null).filter(v=>v!==null);
  if(!values.length)return null;
  const segment=n=>{
    const slice=values.slice(Math.floor(n*values.length/3),Math.floor((n+1)*values.length/3));
    return slice.length?rounded(slice.reduce((a,b)=>a+b,0)/slice.length,2):null;
  };
  return {points:values.length,min:rounded(Math.min(...values),2),max:rounded(Math.max(...values),2),firstThird:segment(0),middleThird:segment(1),lastThird:segment(2)};
}
export async function getTrainingMemory(db,uid,items,max=16){
  const memory=db.collection('runnerPulseCoach').doc(uid).collection('trainingMemory');
  const results=[];
  for(const item of items.slice(0,max)){
    const data=item.data||{};
    const revision=Number(data.fitImportedAt||0);
    const sourceLaps=data.officialActivityDetails?.laps||[];
    const sourceCount=Number(data.fitSampleChunks||0);
    const existing=await memory.doc(item.ref.id).get();
    const cached=existing.data();
    if(cached&&cached.revision===revision&&cached.sourceCount===sourceCount&&cached.lapCount===sourceLaps.length){
      results.push({activityId:item.ref.id,...cached.analysis});continue;
    }
    const analysis={
      lapCount:sourceLaps.length,
      laps:sourceLaps.slice(0,80).map(lapSummary),
      graph:null,
      graphCoverage:'nessun campione disponibile'
    };
    if(sourceCount>0){
      try{
        // Legge tutti i blocchi FIT dell'attività, non soltanto i primi due.
        const chunks=await item.ref.collection('fitSamples').orderBy('__name__').limit(Math.min(sourceCount,150)).get();
        const samples=chunks.docs.flatMap(d=>Array.isArray(d.data()?.samples)?d.data().samples:[]);
        if(samples.length){
          analysis.graph={samplesInspected:samples.length,heartRate:summarizeSeries(samples,['heartRate','heart_rate','hr']),speed:summarizeSeries(samples,['speed','enhancedSpeed']),cadence:summarizeSeries(samples,['cadence','runningCadence'])};
          analysis.graphCoverage=chunks.size>=sourceCount?'campioni FIT disponibili letti integralmente':'campioni FIT letti parzialmente';
        }
      }catch(error){console.warn('Coach training memory: campioni non disponibili:',error.message);}
    }
    // Persistenza per allenamento; non scrivere dati grezzi, solo sintesi verificabili.
    await memory.doc(item.ref.id).set({revision,sourceCount,lapCount:sourceLaps.length,analysis,updatedAt:Date.now()});
    results.push({activityId:item.ref.id,...analysis});
  }
  return results;
}
