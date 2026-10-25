import {validDate} from './time';
import {validateRanges} from './schedule';
import {query} from './db';
export function openingPlan(input:any){
 if(!validDate(input.from)||!validDate(input.until)||input.until<input.from||Date.parse(input.until)-Date.parse(input.from)>365*86400000)throw new Error('Elige un período de hasta un año, con la fecha final igual o posterior a la inicial.');
 if(!Array.isArray(input.days)||!input.days.length||!input.days.every((d:unknown)=>Number.isInteger(d)&&Number(d)>=0&&Number(d)<=6))throw new Error('Selecciona al menos un día de la semana.');
 const ranges=validateRanges(input.ranges);if(!ranges.length)throw new Error('Añade al menos una franja para abrir fechas.');
 const dates:string[]=[];for(let t=Date.parse(input.from+'T12:00:00Z');t<=Date.parse(input.until+'T12:00:00Z');t+=86400000){if(input.days.includes(new Date(t).getUTCDay()))dates.push(new Date(t).toISOString().slice(0,10));}
 if(!dates.length)throw new Error('Los días seleccionados no aparecen en este período.');
 return {dates,ranges};
}
export async function openPeriod(input:any,preview=false){
 const {dates,ranges}=openingPlan(input),replace=input.replace===true;
 const [s]=await query('SELECT schedule FROM settings WHERE id=1');const existing=s.schedule?.dates||{};
 const skipped=dates.filter(d=>Object.hasOwn(existing,d)&&!replace),opening=dates.filter(d=>!skipped.includes(d));
 if(preview){const [r]=await query("SELECT count(*)::integer AS n FROM bookings WHERE kind='appointment' AND status='confirmed' AND (start_at AT TIME ZONE 'America/Bogota')::date::text=ANY($1::text[])",[opening]);return {dates:opening,skipped,ranges,reservations:r.n};}
 // Merge with the current database value so edits to other dates aren't overwritten.
 const patch=Object.fromEntries(dates.map(d=>[d,ranges]));
 await query(`UPDATE settings SET schedule=jsonb_build_object('weekly','[[],[],[],[],[],[],[]]'::jsonb,'dates',COALESCE(schedule->'dates','{}'::jsonb)||COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each($1::jsonb) WHERE $2::boolean OR NOT COALESCE(settings.schedule->'dates','{}'::jsonb)?key),'{}'::jsonb)) WHERE id=1`,[JSON.stringify(patch),replace]);
 return {ok:true};
}
