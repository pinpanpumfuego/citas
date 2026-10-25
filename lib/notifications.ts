import {displayTime} from './time';
import {sendWhatsApp} from './whatsapp';
import {confirmation} from './whatsapp-bot';
import { createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import {query} from './db';

function key(){const secret=process.env.SESSION_SECRET||(process.env.NODE_ENV!=='production'?'local-notifications':null);if(!secret)throw new Error('Falta la clave del servidor');return createHash('sha256').update('notifications:'+secret).digest();}
export function encrypt(value:unknown){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);return Buffer.concat([iv,c.update(JSON.stringify(value)),c.final(),c.getAuthTag()]).toString('base64');}
export function decrypt(value:string):any{if(!value)return {};const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString());}
export function workerToken(){return createHmac('sha256',key()).update('notification-worker').digest('hex');}
export async function configuration(){const [r]=await query('SELECT * FROM notification_config WHERE id=1');return {...r,private:decrypt(r.secrets)};}
export async function publicConfiguration(){const r=await configuration();if(!r.vapid){const keys=encrypt(webpush.generateVAPIDKeys());await query("UPDATE notification_config SET vapid=$1 WHERE id=1 AND vapid=''",[keys]);r.vapid=(await query('SELECT vapid FROM notification_config WHERE id=1'))[0].vapid;}return {config:r.config,hasPassword:!!r.private.smtpPassword,hasToken:!!r.private.whatsappToken,publicKey:decrypt(r.vapid).publicKey,devices:await query('SELECT id,created_at FROM push_devices'),jobs:await query('SELECT id,channel,status,error,created_at FROM notification_jobs ORDER BY id DESC LIMIT 15')};}
const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function saveConfiguration(input:any){const r=await configuration(),c={...r.config},secrets={...r.private};
 if(input.channel==='email'){
  for(const k of ['emailTo','smtpUser']){c[k]=String(input[k]||'').trim();if(c[k].length>254||(c[k]&&!email.test(c[k])))throw new Error('Revisa las direcciones de correo.');}
  c.smtpProvider=input.smtpProvider==='gmail'?'gmail':'hostinger';
  if(input.smtpPassword){if(typeof input.smtpPassword!=='string'||input.smtpPassword.length>1000)throw new Error('Contraseña no válida');secrets.smtpPassword=input.smtpPassword;}
  c.emailEnabled=input.enabled===true;if(c.emailEnabled&&(!c.emailTo||!c.smtpUser||!secrets.smtpPassword))throw new Error('Completa el correo de destino y la cuenta que enviará los avisos.');
 }else if(input.channel==='whatsapp'){
  c.whatsappTo=String(input.whatsappTo||'').trim();c.phoneNumberId=String(input.phoneNumberId||'').trim();c.template=String(input.template||'').trim();c.language=String(input.language||'es').trim();
  if(c.whatsappTo&&!/^\+[1-9]\d{7,14}$/.test(c.whatsappTo))throw new Error('Escribe WhatsApp con + y el prefijo del país.');
  if(c.phoneNumberId&&!/^\d{5,30}$/.test(c.phoneNumberId))throw new Error('Revisa el identificador del número emisor.');
  if(c.template&&!/^[a-z0-9_]{1,100}$/.test(c.template))throw new Error('Revisa el nombre de la plantilla.');
  if(!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(c.language))throw new Error('Revisa el idioma de la plantilla.');
  if(input.whatsappToken){if(typeof input.whatsappToken!=='string'||input.whatsappToken.length>4096)throw new Error('Token no válido');secrets.whatsappToken=input.whatsappToken;}
  c.whatsappEnabled=input.enabled===true;if(c.whatsappEnabled&&(!c.whatsappTo||!c.phoneNumberId||!c.template||!secrets.whatsappToken))throw new Error('Completa la conexión de WhatsApp antes de activarlo.');
 }else throw new Error('Canal no válido');
 await query('UPDATE notification_config SET config=$1,secrets=$2 WHERE id=1',[c,encrypt(secrets)]);
}
export function validSubscription(s:any){try{const u=new URL(s.endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(/^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/.test(u.hostname))&&/^[A-Za-z0-9_-]{80,100}={0,2}$/.test(s.keys?.p256dh)&&/^[A-Za-z0-9_-]{20,30}={0,2}$/.test(s.keys?.auth);}catch{return false;}}
export async function subscribe(s:any){if(!validSubscription(s))throw new Error('Este navegador no ofrece una suscripción válida.');await query('INSERT INTO push_devices(id,endpoint,subscription) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription',[randomUUID(),s.endpoint,s]);}
export async function enqueueTest(channel:string,endpoint?:string){const r=await configuration();let target='';if(channel==='push'){const [device]=await query('SELECT id FROM push_devices WHERE endpoint=$1',[endpoint||'']);if(!device)throw new Error('Activa primero este teléfono.');target=device.id;}else if(channel==='email'&&r.config.emailEnabled)target=r.config.emailTo;else if(channel==='whatsapp'&&r.config.whatsappEnabled)target=r.config.whatsappTo;else throw new Error('Guarda y activa este canal antes de probarlo.');
 const [count]=await query("SELECT count(*)::integer AS n FROM notification_jobs WHERE booking_id IS NULL AND created_at>now()-interval '1 minute'");if(count.n>=3)throw new Error('Espera un minuto antes de enviar otra prueba.');await query('INSERT INTO notification_jobs(channel,target) VALUES($1,$2)',[channel,target]);}
class PermanentError extends Error{}
async function deliver(job:any){const r=await configuration(),c=r.config;let text='Prueba de avisos. Tu conexión funciona.',service='Prueba de avisos',date='Ahora';
 if(job.booking_id){const [b]=await query('SELECT * FROM bookings WHERE id=$1',[job.booking_id]);if(!b||b.status==='cancelled')return 'skipped';service=b.service_name;const [preferences]=await query('SELECT time_format FROM settings WHERE id=1');date=new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeZone:'America/Bogota'}).format(new Date(b.start_at))+' '+displayTime(b.start_at,preferences.time_format);text=`Nueva cita: ${service}. ${date} (hora de Medellín). Consulta los detalles en tu agenda.`;}
 if(job.channel==='waha_customer'||job.channel==='waha_reply'){
 if(job.channel==='waha_reply'&&!job.booking_id&&Date.now()-new Date(job.created_at).getTime()>15*60000)return 'skipped';
 return sendWhatsApp(job.target,job.channel==='waha_customer'?await confirmation(query,job.booking_id):job.payload.text);
 }
 const url='https://www.laprincesadelascejas.com/admin';
 if(job.channel==='email'){
  if(!c.emailEnabled||c.emailTo!==job.target)return 'skipped';
  const smtp=nodemailer.createTransport({host:c.smtpProvider==='gmail'?'smtp.gmail.com':'smtp.hostinger.com',port:465,secure:true,auth:{user:c.smtpUser,pass:r.private.smtpPassword},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
  try{const result=await smtp.sendMail({from:c.smtpUser,to:job.target,subject:job.booking_id?'Nueva cita · La Princesa de las Cejas':'Prueba de avisos',text:text+'\n\n'+url});if(!result.accepted?.length)throw new Error('Correo rechazado');}finally{smtp.close();}
 }else if(job.channel==='whatsapp'){
  if(!c.whatsappEnabled||c.whatsappTo!==job.target)return 'skipped';
  const response=await fetch(`https://graph.facebook.com/v23.0/${c.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${r.private.whatsappToken}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:job.target.replace('+',''),type:'template',template:{name:c.template,language:{code:c.language},components:[{type:'body',parameters:[service,date,url].map(text=>({type:'text',text}))}]}}),signal:AbortSignal.timeout(20000)});
  if(!response.ok){if(response.status>=400&&response.status<500&&response.status!==429)throw new PermanentError('WhatsApp: revisa el token, número y plantilla aprobada.');throw new Error('WhatsApp temporalmente no disponible');}
 }else if(job.channel==='push'){
  const [device]=await query('SELECT * FROM push_devices WHERE id::text=$1',[job.target]);if(!device)return 'skipped';
  const keys=decrypt(r.vapid);try{await webpush.sendNotification(device.subscription,JSON.stringify({title:job.booking_id?'Nueva cita':'Prueba de avisos',body:text,id:String(job.id)}),{vapidDetails:{subject:url,...keys},TTL:3600,timeout:20000});}catch(e:any){if(e.statusCode===410||e.statusCode===404){await query('DELETE FROM push_devices WHERE id=$1',[device.id]);return 'skipped';}throw e;}
 }else throw new PermanentError('Canal no válido');return 'sent';
}
export async function processJobs(sender:((job:any)=>Promise<string>)=deliver){
 const jobs=await query("UPDATE notification_jobs SET status='processing',attempts=attempts+1,next_at=now()+interval '5 minutes' WHERE id IN (SELECT j.id FROM notification_jobs j WHERE (status='pending' OR status='processing') AND next_at<=now() AND NOT EXISTS (SELECT 1 FROM notification_jobs earlier WHERE j.channel LIKE 'waha_%' AND earlier.channel LIKE 'waha_%' AND earlier.target=j.target AND earlier.id<j.id AND earlier.status IN ('pending','processing')) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 3) RETURNING *");
 for(const job of jobs){try{await query('UPDATE notification_jobs SET status=$1,error=NULL WHERE id=$2',[await sender(job),job.id]);}catch(e){const failed=e instanceof PermanentError||job.attempts>=5;await query("UPDATE notification_jobs SET status=$1,error=$2,next_at=now()+$3::integer*interval '1 second' WHERE id=$4",[failed?'failed':'pending',e instanceof PermanentError?e.message:'No se pudo enviar. Revisa la conexión y las credenciales del canal.',Math.min(3600,30*2**job.attempts),job.id]);}}
 return jobs.length;
}
