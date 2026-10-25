import { scheduleFor } from './schedule';
import {depositAmount} from './deposit';
import {expirePayments} from './payments';
import { transaction,query,Query } from './db';
import { candidates, validDate } from './time';
import { randomUUID } from 'node:crypto';
export async function available(serviceId:number,date:string,q:Query=query) {
  await expirePayments(q);
  if(!validDate(date) || Date.parse(date)>Date.now()+91*86400000) return [];
  const [service]=await q('SELECT * FROM services WHERE id=$1 AND active=true',[serviceId]);
  if(!service) return [];
  const [s]=await q('SELECT * FROM settings WHERE id=1');
  const schedule=scheduleFor(s);
  const ranges=schedule.dates[date]??schedule.weekly[new Date(date+'T12:00:00Z').getUTCDay()];
  const duration=service.duration+service.buffer;
  const rows=await q("SELECT start_at,end_at FROM bookings WHERE status<>'cancelled' AND start_at < $1::date + interval '2 days' AND end_at > $1::date",[date]);
  return [...new Set(ranges.flatMap(r=>candidates(date,r.start,r.end,duration)))].sort().filter(t=>!rows.some(b=>Date.parse(t)<new Date(b.end_at).getTime() && Date.parse(t)+duration*60000>new Date(b.start_at).getTime()));
}
export async function reserve(input:{serviceId:number;date:string;start:string;customer:string;phone:string;whatsappConsent?:boolean;source?:string;expectedPrice?:number;expectedDeposit?:number},q:Query=query):Promise<string> {
  if(q===query)return transaction(tx=>reserve(input,tx));
  if(!(await available(input.serviceId,input.date,q)).includes(input.start))throw new Error('Ese horario ya no está disponible. Elige otro.');
  const [s]=await q('SELECT * FROM services WHERE id=$1 AND active=true FOR SHARE',[input.serviceId]);
  const [payments]=await q('SELECT * FROM payment_config WHERE id=1 FOR SHARE');
  const deposit=payments.enabled?depositAmount(s.price,s.deposit_mode,s.deposit_value):0;
  if((input.expectedPrice!==undefined&&input.expectedPrice!==s.price)||(input.expectedDeposit!==undefined&&input.expectedDeposit!==deposit))throw new Error('El precio o anticipo cambió. Vuelve a elegir el servicio.');
  if(deposit>0&&!payments.manual_enabled&&!payments.online_enabled)throw new Error('El negocio debe configurar una forma de pago.');
  const due=deposit?new Date(Math.min(Date.now()+payments.hold_hours*3600000,Date.parse(input.start))).toISOString():null;
  const id=randomUUID();
  try {await q('INSERT INTO bookings(id,service_id,service_name,price,customer,phone,start_at,end_at,whatsapp_consent,source,deposit_amount,payment_status,status,payment_due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id,s.id,s.name,s.price,input.customer,input.phone,input.start,new Date(Date.parse(input.start)+(s.duration+s.buffer)*60000).toISOString(),input.whatsappConsent===true,input.source||'web',deposit,deposit?'pending':'not_required',deposit?'pending_payment':'confirmed',due]);}
  catch(e:any){if(e.code==='23P01')throw new Error('Ese horario acaba de reservarse. Elige otro.');throw e;}
  return id;
}
