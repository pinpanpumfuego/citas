import { scheduleFor } from './schedule';
import { query } from './db';
import { candidates, validDate } from './time';
import { randomUUID } from 'node:crypto';
export async function available(serviceId:number,date:string) {
  if(!validDate(date) || Date.parse(date)>Date.now()+91*86400000) return [];
  const [service]=await query('SELECT * FROM services WHERE id=$1 AND active=true',[serviceId]);
  if(!service) return [];
  const [s]=await query('SELECT * FROM settings WHERE id=1');
  const schedule=scheduleFor(s);
  const ranges=schedule.dates[date]??schedule.weekly[new Date(date+'T12:00:00Z').getUTCDay()];
  const duration=service.duration+service.buffer;
  const rows=await query("SELECT start_at,end_at FROM bookings WHERE status<>'cancelled' AND start_at < $1::date + interval '2 days' AND end_at > $1::date",[date]);
  return [...new Set(ranges.flatMap(r=>candidates(date,r.start,r.end,duration)))].sort().filter(t=>!rows.some(b=>Date.parse(t)<new Date(b.end_at).getTime() && Date.parse(t)+duration*60000>new Date(b.start_at).getTime()));
}
export async function reserve(input:{serviceId:number;date:string;start:string;customer:string;phone:string}) {
  if(!(await available(input.serviceId,input.date)).includes(input.start))throw new Error('Ese horario ya no está disponible. Elige otro.');
  const [s]=await query('SELECT * FROM services WHERE id=$1 AND active=true',[input.serviceId]);
  const id=randomUUID();
  try {await query('INSERT INTO bookings(id,service_id,service_name,price,customer,phone,start_at,end_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,s.id,s.name,s.price,input.customer,input.phone,input.start,new Date(Date.parse(input.start)+(s.duration+s.buffer)*60000).toISOString()]);}
  catch(e:any){if(e.code==='23P01')throw new Error('Ese horario acaba de reservarse. Elige otro.');throw e;}
  return id;
}
