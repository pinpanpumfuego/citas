import {query,transaction,Query} from './db';
import {available,reserve} from './booking';
import {today,displayTime,money,localParts} from './time';
const dateLabel=(d:string)=>new Intl.DateTimeFormat('es-CO',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Bogota'}).format(new Date(d+'T12:00:00Z'));
const numbered=(items:string[])=>items.map((x,i)=>`${i+1}. ${x}`).join('\n');
const help='\nResponde con el número de la opción. Escribe MENÚ para empezar de nuevo o ASESOR para atención personal.';
const choice=(body:string,items:any[])=>/^\d{1,3}$/.test(body)?items[Number(body)-1]:undefined;
export async function confirmation(q:Query,id:string){const [b]=await q('SELECT * FROM bookings WHERE id=$1',[id]);const [s]=await q('SELECT name,address,time_format FROM settings WHERE id=1');return `Hola, ${b.customer}. Tu cita en ${s.name} está confirmada.\n${b.service_name}\n${dateLabel(localParts(b.start_at).date)} · ${displayTime(b.start_at,s.time_format)} (Medellín)\n${s.address}\nReferencia: ${id}\nPara solicitar un cambio, responde ASESOR.`;}
export async function botStep(q:Query,state:any,body:string,phone:string):Promise<{state:any;text?:string;bookingId?:string}>{
 const [preferences]=await q('SELECT time_format FROM settings WHERE id=1');
 const showTime=(value:string|Date)=>displayTime(value,preferences?.time_format||'24h');
 const word=body.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 if(word==='asesor')return {state:{step:'paused'},text:'El asistente automático queda pausado. Escribe aquí tu consulta para que el negocio pueda atenderte. Para volver a reservar escribe RESERVAR.'};
 if(word==='salir'||word==='cancelar')return {state:{},text:'Proceso de reserva cerrado. Esto no cancela una cita ya confirmada. Para cambiar una cita escribe ASESOR.'};
 const restart=['reservar','reserva','menu','cita'].includes(word);
 if(!state.step&&!restart)return {state};
 if(state.step==='paused'&&!restart)return {state};
 async function services(){const list=await q('SELECT id,name,price FROM services WHERE active=true ORDER BY id');return {state:{step:'service',services:list},text:list.length?'Soy el asistente de reservas. Elige un servicio:\n'+numbered(list.map(s=>s.name+' · '+money(s.price)))+help:'No hay servicios disponibles en este momento. Escribe ASESOR para consultar.'};}
 async function dates(service:any,offset=0){
 const [settings]=await q('SELECT schedule FROM settings WHERE id=1');const candidates=Object.keys(settings.schedule?.dates||{}).filter(d=>d>=today()&&Date.parse(d)<=Date.now()+90*86400000).sort();const dates:string[]=[];
 for(const d of candidates)if((await available(service.id,d,q)).length)dates.push(d);
 const page=dates.slice(offset,offset+7);if(!page.length)return {state:{step:'service',services:await q('SELECT id,name,price FROM services WHERE active=true ORDER BY id')},text:'No quedan días disponibles para este servicio. Escribe MENÚ para elegir otro servicio o ASESOR para consultar.'};
 return {state:{step:'date',service,dates:page,offset},text:service.name+'\nElige el día:\n'+numbered(page.map(dateLabel))+(dates.length>offset+7?'\nEscribe MÁS para ver otros días.':'')+help};
 }
 async function times(service:any,date:string){const slots=await available(service.id,date,q);if(!slots.length)return dates(service);return {state:{step:'slot',service,date,slots},text:dateLabel(date)+'\nElige la hora (Medellín):\n'+numbered(slots.map(showTime))+help};}
 if(restart)return services();
 if(state.step==='service'){const s=choice(body,state.services);return s?dates(s):{state,text:'Elige un servicio:\n'+numbered(state.services.map((s:any)=>s.name))+help};}
 if(state.step==='date'){if(word==='mas')return dates(state.service,(state.offset||0)+7);const d=choice(body,state.dates);return d?times(state.service,d):{state,text:'Elige un día:\n'+numbered(state.dates.map(dateLabel))+help};}
 if(state.step==='slot'){const start=choice(body,state.slots);if(!start)return {state,text:'Elige una hora:\n'+numbered(state.slots.map(showTime))+help};if(!(await available(state.service.id,state.date,q)).includes(start))return times(state.service,state.date);return {state:{...state,step:'name',start},text:'¿Cuál es tu nombre completo? Escribe al menos nombre y apellido.'};}
 if(state.step==='name'){
 if(body.length<3||body.length>100||!/[a-záéíóúñ]/i.test(body))return {state,text:'Escribe tu nombre completo (máximo 100 caracteres).'};
 if(!phone)return {state:{step:'paused'},text:'No hemos podido identificar tu teléfono. Puedes reservar en https://www.laprincesadelascejas.com o escribir aquí para atención personal.'};
 return {state:{...state,step:'confirm',name:body},text:`Revisa tu cita:\n${state.service.name} · ${money(state.service.price)}\n${dateLabel(state.date)} · ${showTime(state.start)} (Medellín)\nNombre: ${body}\n\nEscribe CONFIRMAR para guardar la cita y recibir la confirmación por WhatsApp. Usaremos tu nombre y teléfono para gestionar esta reserva. SALIR abandona este proceso.`};}
 if(state.step==='confirm'){
 if(word!=='confirmar')return {state,text:'Escribe CONFIRMAR para guardar tu cita, MENÚ para cambiarla o SALIR para abandonar.'};
 const [current]=await q('SELECT * FROM services WHERE id=$1 AND active=true',[state.service.id]);
 if(!current||current.price!==state.service.price||current.name!==state.service.name)return services();
 if(!(await available(current.id,state.date,q)).includes(state.start))return times(current,state.date);
 const [count]=await q("SELECT count(*)::int AS n FROM bookings WHERE phone=$1 AND status='confirmed' AND start_at>now()",['+'+phone]);if(count.n>=3)return {state:{step:'paused'},text:'Ya tienes varias citas pendientes. Escribe aquí para que el negocio te ayude con otra reserva.'};
 await q('SAVEPOINT bot_booking');let id:string;
 try{id=await reserve({serviceId:current.id,date:state.date,start:state.start,customer:state.name,phone:'+'+phone,whatsappConsent:true,source:'whatsapp'},q);await q('RELEASE SAVEPOINT bot_booking');}
 catch(e:any){await q('ROLLBACK TO SAVEPOINT bot_booking');if(/horario/.test(e.message))return times(current,state.date);throw e;}
 return {state:{step:'done'},text:await confirmation(q,id),bookingId:id};
 }
 return {state,text:'Para una nueva reserva escribe RESERVAR. Para cambiar una cita o hablar con el negocio escribe ASESOR.'};
}
export async function processInbox(){let count=0;for(let i=0;i<10;i++){
 const worked=await transaction(async q=>{
 const [config]=await q('SELECT * FROM whatsapp_config WHERE id=1 FOR UPDATE');if(!config.enabled)return false;
 const [m]=await q('SELECT * FROM whatsapp_inbox WHERE processed=false ORDER BY created_at,id LIMIT 1 FOR UPDATE');if(!m)return false;
 if(Date.now()-new Date(m.created_at).getTime()>15*60000){await q('UPDATE whatsapp_inbox SET processed=true WHERE id=$1',[m.id]);return true;}
 const [chat]=await q('SELECT * FROM whatsapp_chats WHERE chat=$1',[m.chat]);const state=chat&&Date.now()-new Date(chat.updated_at).getTime()<30*60000?chat.state:{};
 const result=await botStep(q,state,m.body,m.phone);
 await q('INSERT INTO whatsapp_chats(chat,state) VALUES($1,$2) ON CONFLICT(chat) DO UPDATE SET state=excluded.state,updated_at=now()',[m.chat,result.state]);
 if(result.text)await q("INSERT INTO notification_jobs(channel,target,payload,booking_id) VALUES('waha_reply',$1,$2,$3)",[m.chat,{text:result.text},result.bookingId||null]);
 await q('UPDATE whatsapp_inbox SET processed=true,body=\'\' WHERE id=$1',[m.id]);return true;
 });if(!worked)break;count++;
 }
 await query("DELETE FROM whatsapp_inbox WHERE processed=true AND created_at<now()-interval '7 days'");await query("DELETE FROM whatsapp_chats WHERE updated_at<now()-interval '2 days'");return count;
}
