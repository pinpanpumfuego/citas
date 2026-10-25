import {createHmac,timingSafeEqual} from 'node:crypto';
import {query} from './db';
export const BUSINESS_PHONE='573217168203';
export function normalizedPhone(value:string){const digits=value.replace(/[ ()+-]/g,'');return /^3\d{9}$/.test(digits)?'57'+digits:/^[1-9]\d{7,14}$/.test(digits)?digits:'';}
export function webhookToken(){if(!process.env.SESSION_SECRET)throw new Error('Falta la configuración del servidor.');return createHmac('sha256',process.env.SESSION_SECRET).update('waha-webhook').digest('hex');}
export function validWebhook(token:string){const expected=Buffer.from('Bearer '+webhookToken()),actual=Buffer.from(token);return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export async function waha(path:string,method='GET',body?:unknown){
 if(!process.env.WAHA_API_KEY)throw new Error('La conexión de WhatsApp todavía no está instalada.');
 const r=await fetch((process.env.WAHA_URL||'http://waha:3000')+path,{method,headers:{'X-Api-Key':process.env.WAHA_API_KEY,'Content-Type':'application/json',Accept:'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000),cache:'no-store'});
 if(!r.ok){const e:any=new Error('WhatsApp no está disponible. Revisa la conexión y vuelve a intentarlo.');e.status=r.status;throw e;}return r.status===204?{}:r.json();
}
export async function sessionInfo(){try{return await waha('/api/sessions/default');}catch(e:any){if(e.status===404)return {status:'NOT_CONNECTED'};throw e;}}
export function matchingAccount(session:any,phone=BUSINESS_PHONE){return session.status==='WORKING'&&session.me?.id?.split('@')[0]===phone;}
export async function connectionStatus(){const [c]=await query('SELECT * FROM whatsapp_config WHERE id=1');try{const s=await sessionInfo();return {...c,status:s.status,connectedPhone:s.me?.id?.split('@')[0]||null,matched:matchingAccount(s,c.phone)};}catch{return {...c,status:'UNAVAILABLE',matched:false};}}
export async function connect(){
 const s=await sessionInfo();const config={webhooks:[{url:'http://app:3000/api/whatsapp/webhook',events:['message'],customHeaders:[{name:'Authorization',value:'Bearer '+webhookToken()}],retries:{delaySeconds:3,attempts:5,policy:'constant'}}]};
 if(s.status==='NOT_CONNECTED')await waha('/api/sessions','POST',{name:'default',start:true,config});
 else {await waha('/api/sessions/default','PUT',{config});if(s.status==='STOPPED'||s.status==='FAILED')await waha('/api/sessions/default/start','POST');}
}
export async function setEnabled(enabled:boolean){
 if(enabled){const s=await sessionInfo();const [c]=await query('SELECT phone FROM whatsapp_config WHERE id=1');if(!matchingAccount(s,c.phone))throw new Error('Vincula primero el WhatsApp +'+c.phone+'.');}
 await query('UPDATE whatsapp_config SET enabled=$1,enabled_at=CASE WHEN $1 THEN now() ELSE enabled_at END WHERE id=1',[enabled]);
 if(!enabled){await query("UPDATE notification_jobs SET status='skipped' WHERE channel IN ('waha_reply','waha_customer') AND status='pending'");await query('UPDATE whatsapp_inbox SET processed=true WHERE processed=false');}
}
export async function sendWhatsApp(target:string,text:string){
 const [c]=await query('SELECT * FROM whatsapp_config WHERE id=1');if(!c.enabled)return 'skipped';
 const s=await sessionInfo();if(!matchingAccount(s,c.phone))throw new Error('WhatsApp desconectado o número incorrecto.');
 const chatId=/^\d{7,20}@(c\.us|lid)$/.test(target)?target:normalizedPhone(target)+'@c.us';
 if(!/^\d{7,20}@(c\.us|lid)$/.test(chatId))throw new Error('Número de WhatsApp no válido.');
 const sent=await waha('/api/sendText','POST',{session:'default',chatId,text,linkPreview:false});if(!sent.id)throw new Error('WhatsApp no confirmó el envío.');return 'sent';
}
export function inboundMessage(event:any){
 const p=event?.payload;
 if(event?.event!=='message'||event.session!=='default'||!p||p.fromMe!==false||typeof p.id!=='string'||p.id.length>250||!/^\d{7,20}@(c\.us|lid)$/.test(p.from)||typeof p.body!=='string'||!p.body.trim()||p.body.length>1000||p.hasMedia)return null;
 if(!Number.isFinite(p.timestamp)||Math.abs(Date.now()/1000-p.timestamp)>300)return null;
 return {id:p.id,chat:p.from,body:p.body.trim(),timestamp:p.timestamp};
}
export async function receive(event:any){
 const m=inboundMessage(event);if(!m)return;
 const [c]=await query('SELECT * FROM whatsapp_config WHERE id=1');if(!c.enabled||event.me?.id?.split('@')[0]!==c.phone||m.timestamp*1000<new Date(c.enabled_at).getTime())return;
 const command=m.body.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 const [chat]=await query("SELECT state FROM whatsapp_chats WHERE chat=$1 AND updated_at>now()-interval '30 minutes'",[m.chat]);
 if(!['reservar','reserva','menu','cita','asesor'].includes(command)&&!chat?.state?.step)return;
 const [rate]=await query("SELECT count(*)::int AS n FROM whatsapp_inbox WHERE chat=$1 AND created_at>now()-interval '1 minute'",[m.chat]);if(rate.n>=20)return;
 const [total]=await query("SELECT count(*)::int AS n FROM whatsapp_inbox WHERE processed=false");if(total.n>=500)throw new Error('Bandeja ocupada');
 let phone=m.chat.endsWith('@c.us')?m.chat.split('@')[0]:'';
 if(!phone){const found=await waha('/api/default/lids/'+encodeURIComponent(m.chat));if(found.pn?.endsWith('@c.us'))phone=normalizedPhone(found.pn.split('@')[0]);}
 await query('INSERT INTO whatsapp_inbox(id,chat,phone,body) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[m.id,m.chat,phone,m.body]);
}
