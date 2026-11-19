// Normalizzazione condivisa di attività realmente salvate, indipendente dal dispositivo.
// Non interpreta campi assenti come zero e non deduce FC, distanza o calorie.
const first = (data, fields) => {
  for (const field of fields) {
    const value = data?.[field];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
};
const finite = value => value === null || value === undefined || value === ''
  ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
function dateOf(raw) {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
  const timestamp=finite(raw);
  if(timestamp===null || timestamp<=0) return null;
  const date = new Date(timestamp < 1e11 ? timestamp * 1000 : timestamp);
  return Number.isFinite(date.valueOf()) ? date.toISOString().slice(0,10) : null;
}
export const isHonorPackage = value => /(^|\.)honor(\.|$)|(^|\.)hihonor(\.|$)/i.test(String(value||''));
export const isCoachActivityId = id => /^(?:\d{1,20}|hc-[a-f0-9]{64})$/.test(String(id));
export const healthCoachId = id => 'hc-'+String(id);
export function summarizeStoredActivity(record, origin='garmin') {
  const health = origin === 'health-connect';
  const data = health ? (record || {}) : (record?.summary || {});
  const date = dateOf(first(data,health
    ? ['startTimeInSeconds','startTime','start']
    : ['startTimeLocal','startTimeGMT','startTime','startTimeInSeconds','beginTimestamp','date']));
  const seconds=finite(first(data,['durationInSeconds','duration','elapsedDuration','movingDuration']));
  const distance=finite(first(data,['distanceInMeters','distance','distanceMeters']));
  const kind=first(data,health?['title','activityName']:['activityType','activityTypeName','activityName','name']);
  const type = typeof kind === 'object'
    ? first(kind,['typeKey','typeName','name']) : kind;
  const source = health
    ? (isHonorPackage(record?.sourcePackage) ? 'HONOR Health' : 'Health Connect')
    : (/^manual-(fit|tcx)$/.test(record?.source||'') ? 'FIT/TCX importato' : 'Garmin Connect');
  const positive = value => value !== null && Number.isFinite(value) && value >= 0 ? value : null;
  const heart=finite(first(data,['averageHR','averageHeartRateInBeatsPerMinute','averageHeartRate','avgHeartRate']));
  const maxHeart=finite(first(data,['maxHR','maxHeartRateInBeatsPerMinute','maxHeartRate']));
  const ascent=finite(first(data,['elevationGain','totalElevationGain','totalAscentInMeters']));
  return {
    date, tipo: String(type||'Allenamento').slice(0,120), fonte:source,
    km: positive(distance)===null ? null : Math.round(distance/10)/100,
    minuti: positive(seconds)===null ? null : Math.round(seconds/6)/10,
    fcMedia:heart!==null&&heart>=25&&heart<=250?heart:null,
    fcMassima:maxHeart!==null&&maxHeart>=25&&maxHeart<=250?maxHeart:null,
    dislivello:positive(ascent),
  };
}
