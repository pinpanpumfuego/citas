import {transaction} from './db';
import {validDate} from './time';
import {scheduleFor} from './schedule';
export async function editBooking(b:any){
 if(typeof b.id!=='string'||!/^[0-9a-f-]{36}$/i.test(b.id))throw new Error('Cita inválida.');
 const customer=typeof b.customer==='string'?b.customer.trim():'',phone=typeof b.phone==='string'?b.phone.trim():'';
 if(customer.length<2||customer.length>100||!/^\+?[\d ()-]{7,25}$/.test(phone))throw new Error('Revisa el nombre y teléfono del cliente.');
 if(!validDate(b.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)||!Number.isInteger(b.duration)||b.duration<5||b.duration>600||!Number.isInteger(b.price)||b.price<0||b.price>1000000000||!Number.isInteger(b.serviceId))throw new Error('Revisa fecha, hora, duración y precio.');
 return transaction(async q=>{
  const [old]=await q("SELECT * FROM bookings WHERE id=$1 AND kind='appointment' FOR UPDATE",[b.id]);
  if(!old||old.status!=='confirmed')throw new Error('Solo puedes modificar citas confirmadas.');
  const [service]=await q('SELECT * FROM services WHERE id=$1',[b.serviceId]);
  if(!service||(!service.active&&service.id!==old.service_id))throw new Error('El servicio no está disponible.');
  const start=Date.parse(b.date+'T'+b.time+':00-05:00'),end=start+b.duration*60000;
  const changedTime=start!==new Date(old.start_at).getTime()||end!==new Date(old.end_at).getTime();
  if(changedTime){
   if(start<=Date.now())throw new Error('Elige una fecha y hora futuras.');
   const [settings]=await q('SELECT * FROM settings WHERE id=1 FOR SHARE');const ranges=scheduleFor(settings).dates[b.date]||[];
   if(!ranges.some(r=>start>=Date.parse(b.date+'T'+r.start+':00-05:00')&&end<=Date.parse(b.date+'T'+r.end+':00-05:00')))throw new Error('La cita debe caber en el horario abierto de ese día. Abre las horas en Horarios o elige otra fecha.');
  }
  const conflicts=await q("SELECT id FROM bookings WHERE id<>$1 AND status<>'cancelled' AND start_at<$3 AND end_at>$2",[b.id,new Date(start).toISOString(),new Date(end).toISOString()]);
  if(conflicts.length)throw new Error('Ese horario se cruza con otra cita o bloqueo. Elige otro.');
  await q('UPDATE bookings SET customer=$1,phone=$2,service_id=$3,service_name=$4,price=$5,start_at=$6,end_at=$7,whatsapp_consent=CASE WHEN phone=$2 THEN whatsapp_consent ELSE false END WHERE id=$8',[customer,phone,service.id,service.id===old.service_id?old.service_name:service.name,b.price,new Date(start).toISOString(),new Date(end).toISOString(),b.id]);
  await q("UPDATE notification_jobs SET status='cancelled' WHERE booking_id=$1 AND channel='waha_customer' AND status='pending'",[b.id]);
  return {ok:true};
 });
}
