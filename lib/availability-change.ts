import {query} from './db';
import {validDate} from './time';
import {scheduleFor,validateRanges,Range} from './schedule';
import {randomUUID} from 'node:crypto';
export function changeBounds(b:any){
 if(!['hours','day','vacation','extra'].includes(b.mode)||!validDate(b.date))throw new Error('Elige una fecha válida.');
 const last=b.mode==='vacation'?b.until:b.date;
 if(!validDate(last)||last<b.date||Date.parse(last)-Date.parse(b.date)>366*86400000)throw new Error('Revisa las fechas (máximo un año).');
 const timed=b.mode==='hours'||b.mode==='extra';
 if(timed)validateRanges([{start:b.from,end:b.to}]);
 const start=b.date+'T'+(timed?b.from:'00:00')+':00-05:00';
 const next=new Date(Date.parse(last+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const end=timed?b.date+'T'+b.to+':00-05:00':next+'T00:00:00-05:00';
 return {start,end};
}
export function mergeRanges(ranges:Range[]){
 const result:Range[]=[];
 for(const r of [...ranges].sort((a,b)=>a.start.localeCompare(b.start))){const last=result.at(-1);if(last&&r.start<=last.end)last.end=last.end>r.end?last.end:r.end;else result.push({...r});}
 return result;
}
export async function changeAvailability(b:any,preview=false){
 const {start,end}=changeBounds(b);
 if(b.id&&!/^[0-9a-f-]{36}$/i.test(b.id))throw new Error('Bloqueo inválido.');
 if(b.id){const [old]=await query("SELECT id FROM bookings WHERE id=$1 AND kind='block' AND status='confirmed'",[b.id]);if(!old)throw new Error('Este bloqueo ya no está activo.');if(b.mode==='extra')throw new Error('Un bloqueo no puede convertirse en horas extra.');}
 const conflicts=b.mode==='extra'?[]:await query("SELECT id,customer,service_name,start_at,end_at,kind FROM bookings WHERE status<>'cancelled' AND start_at<$2 AND end_at>$1 AND ($3::uuid IS NULL OR id<>$3::uuid) ORDER BY start_at",[start,end,b.id||null]);
 if(preview)return {conflicts,start,end};
 if(conflicts.length)throw new Error('Hay citas o bloqueos en ese período. Revísalos antes de guardar; no se ha cambiado nada.');
 if(b.mode==='extra'){
  const [s]=await query('SELECT * FROM settings WHERE id=1');const schedule=scheduleFor(s);
  const existing=schedule.dates[b.date]??schedule.weekly[new Date(b.date+'T12:00:00Z').getUTCDay()];
  schedule.dates[b.date]=validateRanges(mergeRanges([...existing,{start:b.from,end:b.to}]));
  await query('UPDATE settings SET schedule=$1::jsonb WHERE id=1',[JSON.stringify(schedule)]);
 }else{
  const reason=typeof b.reason==='string'?b.reason.trim().slice(0,100):'';
  const title=reason||(b.mode==='vacation'?'Vacaciones':b.mode==='day'?'Día cerrado':'Tiempo personal');
  if(b.id){await query("UPDATE bookings SET start_at=$1,end_at=$2,service_name=$3 WHERE id=$4 AND kind='block' AND status='confirmed'",[start,end,title,b.id]);}
  else await query("INSERT INTO bookings(id,service_name,price,customer,phone,start_at,end_at,kind) VALUES($1,$2,0,'','',$3,$4,'block')",[randomUUID(),title,start,end]);
 }
 return {ok:true};
}
