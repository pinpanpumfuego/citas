import {validDate} from './time';
import {Range,validateRanges} from './schedule';
import {query} from './db';
export function openingPlan(input:any){
 if(!validDate(input.from)||!validDate(input.until)||input.until<input.from||Date.parse(input.until)-Date.parse(input.from)>365*86400000)throw new Error('Elige un período de hasta un año, con la fecha final igual o posterior a la inicial.');
 const weekly=input.weekly===undefined?null:(Array.isArray(input.weekly)&&input.weekly.length===7?input.weekly.map(validateRanges):null);
 if(input.weekly!==undefined&&!weekly)throw new Error('Configura los siete días de la semana.');
 if(!weekly&&(!Array.isArray(input.days)||!input.days.length||!input.days.every((d:unknown)=>Number.isInteger(d)&&Number(d)>=0&&Number(d)<=6)))throw new Error('Selecciona al menos un día de la semana.');
 const ranges=weekly?[]:validateRanges(input.ranges);if(!weekly&&!ranges.length)throw new Error('Añade al menos una franja para abrir fechas.');
 const dates:string[]=[],patch:Record<string,Range[]>={};for(let t=Date.parse(input.from+'T12:00:00Z');t<=Date.parse(input.until+'T12:00:00Z');t+=86400000){const day=new Date(t).getUTCDay(),date=new Date(t).toISOString().slice(0,10);if(weekly||input.days.includes(day)){dates.push(date);patch[date]=weekly?weekly[day]:ranges;}}
 if(!dates.length)throw new Error('Los días seleccionados no aparecen en este período.');
 return {dates,ranges,patch};
}
export async function openPeriod(input:any,preview=false){
 const {dates,ranges,patch}=openingPlan(input),replace=input.replace===true;
 const [s]=await query('SELECT schedule FROM settings WHERE id=1');const existing=s.schedule?.dates||{};
 const skipped=dates.filter(d=>Object.hasOwn(existing,d)&&!replace),opening=dates.filter(d=>!skipped.includes(d));
 if(preview){const [r]=await query("SELECT count(*)::integer AS n FROM bookings WHERE kind='appointment' AND status='confirmed' AND (start_at AT TIME ZONE 'America/Bogota')::date::text=ANY($1::text[])",[opening]);return {dates:opening,skipped,ranges,reservations:r.n};}
 // Merge with the current database value so edits to other dates aren't overwritten.

 await query(`UPDATE settings SET schedule=jsonb_build_object('weekly','[[],[],[],[],[],[],[]]'::jsonb,'dates',COALESCE(schedule->'dates','{}'::jsonb)||COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each($1::jsonb) WHERE $2::boolean OR NOT COALESCE(settings.schedule->'dates','{}'::jsonb)?key),'{}'::jsonb)) WHERE id=1`,[JSON.stringify(patch),replace]);
 return {ok:true};
}
