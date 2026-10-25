import { NextRequest,NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { isAdmin,localMode,equal,token } from '@/lib/auth';
import { available,reserve } from '@/lib/booking';
import { validDate } from '@/lib/time';
import { validateRanges } from '@/lib/schedule';
import { changeAvailability } from '@/lib/availability-change';
import {openPeriod} from '@/lib/open-period';
import { randomUUID } from 'node:crypto';
import {normalizedPhone} from '@/lib/whatsapp';
export const dynamic='force-dynamic';
const attempts=new Map<string,{count:number;until:number}>();
function limit(key:string,max:number){const now=Date.now();for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);const v=attempts.get(key)||{count:0,until:now+60000};v.count++;attempts.set(key,v);return v.count<=max;}
const clean=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):'';
function int(v:unknown,min:number,max:number){return Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;}
export async function GET(req:NextRequest){
  try {
    const mode=req.nextUrl.searchParams.get('mode');
    if(mode==='slots'){const date=req.nextUrl.searchParams.get('date')||'';return NextResponse.json({slots:await available(Number(req.nextUrl.searchParams.get('service')),date)});}
    if(mode==='calendar'){
      if(!await isAdmin())return NextResponse.json({error:'Inicia sesión.'},{status:401});
      const month=req.nextUrl.searchParams.get('month')||'';
      if(!/^\d{4}-\d{2}$/.test(month)||!validDate(month+'-01'))return NextResponse.json({error:'Mes inválido'},{status:400});
      const rows=await query("SELECT kind,start_at,end_at FROM bookings WHERE status<>'cancelled' AND start_at < (($1::date + interval '1 month')::timestamp AT TIME ZONE 'America/Bogota') AND end_at > ($1::date::timestamp AT TIME ZONE 'America/Bogota')",[month+'-01']);
      const days:Record<string,{appointments:number;blocks:number}>={};
      for(let i=1;i<=31;i++){const date=month+'-'+String(i).padStart(2,'0');if(!validDate(date))break;const start=Date.parse(date+'T00:00:00-05:00'),end=start+86400000;const matching=rows.filter(b=>Date.parse(b.start_at)<end&&Date.parse(b.end_at)>start);days[date]={appointments:matching.filter(b=>b.kind==='appointment').length,blocks:matching.filter(b=>b.kind==='block').length};}
      return NextResponse.json({days});
    }
    if(mode==='admin'){
      if(!await isAdmin())return NextResponse.json({error:'Inicia sesión.'},{status:401});
      const [settings]=await query('SELECT * FROM settings WHERE id=1');
      const services=await query('SELECT * FROM services ORDER BY id');
      const date=req.nextUrl.searchParams.get('date')||new Date().toISOString().slice(0,10);
      if(!validDate(date))return NextResponse.json({error:'Fecha inválida'},{status:400});
      const bookings=await query("SELECT * FROM bookings WHERE start_at < (($1::date + 1)::timestamp AT TIME ZONE 'America/Bogota') AND end_at > ($1::date::timestamp AT TIME ZONE 'America/Bogota') ORDER BY start_at",[date]);
      const blocks=await query("SELECT * FROM bookings WHERE kind='block' AND status='confirmed' AND end_at>now() ORDER BY start_at");
      return NextResponse.json({settings,services,bookings,blocks,local:localMode()});
    }
    const [settings]=await query('SELECT name,description,address,phone,open_time,close_time,weekdays FROM settings WHERE id=1');
    const [wa]=await query('SELECT enabled FROM whatsapp_config WHERE id=1');
    return NextResponse.json({settings,whatsappEnabled:wa.enabled,services:await query('SELECT * FROM services WHERE active=true ORDER BY id')});
  }catch(e){console.error('Data query failed',e instanceof Error?e.message:'error');return NextResponse.json({error:'No pudimos cargar los datos. Intenta nuevamente.'},{status:500});}
}
export async function POST(req:NextRequest){
  const origin=req.headers.get('origin');
  let sameOrigin=false;
  try { sameOrigin=!!origin && new URL(origin).host===req.headers.get('host') && ['http:','https:'].includes(new URL(origin).protocol); } catch {}
  if(!sameOrigin)return NextResponse.json({error:'Origen no permitido.'},{status:403});
  if(Number(req.headers.get('content-length')||0)>16000)return NextResponse.json({error:'Solicitud demasiado grande.'},{status:413});
  try {
    const b=await req.json(); const action=b.action;
    if(action==='login'){
      if(!limit('login',20))return NextResponse.json({error:'Espera un minuto antes de intentar de nuevo.'},{status:429});
      if(!process.env.ADMIN_PASSWORD || !equal(String(b.password||''),process.env.ADMIN_PASSWORD))return NextResponse.json({error:'Contraseña incorrecta.'},{status:401});
      const res=NextResponse.json({ok:true});res.cookies.set('citas_session',token(),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:43200});return res;
    }
    if(action==='logout'){const res=NextResponse.json({ok:true});res.cookies.delete('citas_session');return res;}
    if(action==='reserve'){
      if(!limit('reservations',30))return NextResponse.json({error:'Demasiadas solicitudes. Intenta en un minuto.'},{status:429});
      const customer=clean(b.customer,100),phone=clean(b.phone,25);
      if(b.website || customer.length<2 || !/^\+?[\d ()-]{7,25}$/.test(phone)||!int(b.serviceId,1,2147483647)||!validDate(b.date)||typeof b.start!=='string')throw new Error('Revisa el nombre, teléfono y horario.');
      const consent=b.whatsappConsent==='on';const recipient=consent?normalizedPhone(phone):phone;if(consent&&!recipient)throw new Error('Escribe el teléfono con prefijo de país, por ejemplo +57 3001234567.');
      const id=await reserve({serviceId:b.serviceId,date:b.date,start:b.start,customer,phone:consent?'+'+recipient:phone,whatsappConsent:consent});const jobs=await query("SELECT id FROM notification_jobs WHERE booking_id=$1 AND channel='waha_customer'",[id]);return NextResponse.json({ok:true,id,whatsappQueued:jobs.length>0});
    }
    if(!await isAdmin())return NextResponse.json({error:'Inicia sesión.'},{status:401});
    if(action==='preview_period'||action==='open_period')return NextResponse.json(await openPeriod(b,action==='preview_period'));
    if(action==='preview_change'||action==='availability_change')return NextResponse.json(await changeAvailability(b,action==='preview_change'));
    if(action==='service'){
      const name=clean(b.name,100),description=clean(b.description,500);
      if(!name||!int(b.price,0,1000000000)||!int(b.duration,5,480)||!int(b.buffer,0,120)||typeof b.active!=='boolean')throw new Error('Revisa los datos del servicio.');
      if(b.id){if(!int(b.id,1,2147483647))throw new Error('Servicio inválido.');await query('UPDATE services SET name=$1,description=$2,price=$3,duration=$4,buffer=$5,active=$6 WHERE id=$7',[name,description,b.price,b.duration,b.buffer,b.active,b.id]);}
      else await query('INSERT INTO services(name,description,price,duration,buffer,active) VALUES($1,$2,$3,$4,$5,$6)',[name,description,b.price,b.duration,b.buffer,b.active]);
     } else if(action==='weekly_schedule'){
      throw new Error('Abre fechas indicando un inicio y un fin. Ya no hay horarios semanales indefinidos.');
    } else if(action==='date_schedule'){
      if(!validDate(b.date))throw new Error('Elige una fecha válida.');
      const ranges=b.reset===true?[]:validateRanges(b.ranges);
      await query("UPDATE settings SET schedule=jsonb_build_object('weekly','[[],[],[],[],[],[],[]]'::jsonb,'dates',COALESCE(schedule->'dates','{}'::jsonb)||jsonb_build_object($1::text,$2::jsonb)) WHERE id=1",[b.date,JSON.stringify(ranges)]);
    } else if(action==='settings'){

      const name=clean(b.name,100),description=clean(b.description,1000),address=clean(b.address,300),phone=clean(b.phone,25);
      if(!name||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.open_time)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.close_time)||b.open_time>=b.close_time||!Array.isArray(b.weekdays)||!b.weekdays.every((x:unknown)=>int(x,0,6)))throw new Error('Revisa el horario y los días de atención.');
      await query('UPDATE settings SET name=$1,description=$2,address=$3,phone=$4,open_time=$5,close_time=$6,weekdays=$7 WHERE id=1',[name,description,address,phone,b.open_time,b.close_time,[...new Set(b.weekdays)]]);
    } else if(action==='status'){
      if(!['cancelled','completed'].includes(b.status))throw new Error('Estado inválido.');
      await query("UPDATE bookings SET status=$1 WHERE id=$2 AND status='confirmed'",[b.status,b.id]);
    } else if(action==='block'){
      if(!b.start||!b.end||!Number.isFinite(Date.parse(b.start))||!Number.isFinite(Date.parse(b.end))||Date.parse(b.end)<=Date.parse(b.start))throw new Error('Revisa el inicio y fin del bloqueo.');
      await query("INSERT INTO bookings(id,service_name,price,customer,phone,start_at,end_at,kind) VALUES($1,$2,0,'','',$3,$4,'block')",[randomUUID(),clean(b.reason,100)||'Tiempo personal',b.start,b.end]);
    } else throw new Error('Acción no reconocida.');
    return NextResponse.json({ok:true});
  }catch(e:any){const message=e.code==='23P01'?'El horario se cruza con una reserva o bloqueo.':e.code?'No pudimos guardar los cambios.':e.message||'Solicitud inválida.';return NextResponse.json({error:message},{status:400});}
}
