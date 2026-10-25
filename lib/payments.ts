import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {query,transaction,Query} from './db';
import {seal,unseal} from './payment-secrets';
const site='https://www.laprincesadelascejas.com';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function paymentToken(id:string){const secret=process.env.SESSION_SECRET||(process.env.NODE_ENV!=='production'?'development-payments':null);if(!secret)throw new Error('Falta la clave del servidor.');return createHmac('sha256',secret).update('payment:'+id).digest('hex');}
export function paymentLink(id:string){return `${site}/pago/${id}#${paymentToken(id)}`;}
function authorized(id:unknown,token:unknown):asserts id is string{if(!uuid(id)||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(Buffer.from(token),Buffer.from(paymentToken(id))))throw new Error('El enlace de pago no es válido.');}
export async function expirePayments(q:Query=query){await q("UPDATE bookings SET status='cancelled',payment_status='expired' WHERE status='pending_payment' AND payment_status='pending' AND payment_due_at<=now()");}
export async function paymentSettings(admin=false){const [c]=await query('SELECT * FROM payment_config WHERE id=1');return admin?{...c,secrets:undefined,hasSecrets:!!c.secrets}:{enabled:c.enabled,manual_enabled:c.manual_enabled,online_enabled:c.online_enabled,instructions:c.instructions,hold_hours:c.hold_hours};}
export async function savePaymentSettings(b:any){
 if(typeof b.enabled!=='boolean'||typeof b.manual_enabled!=='boolean'||typeof b.online_enabled!=='boolean'||!Number.isInteger(b.hold_hours)||b.hold_hours<1||b.hold_hours>72)throw new Error('Revisa la configuración de anticipos.');
 const instructions=String(b.instructions||'').trim(),publicKey=String(b.public_key||'').trim();
 if(instructions.length>2000||publicKey.length>200)throw new Error('Los datos son demasiado largos.');
 const [old]=await query('SELECT * FROM payment_config WHERE id=1'),secrets=unseal(old.secrets);
 for(const k of ['integrity','events'])if(b[k]){if(typeof b[k]!=='string'||b[k].length>300)throw new Error('Revisa las claves de Wompi.');secrets[k]=b[k].trim();}
 if(b.enabled&&(!b.manual_enabled&&!b.online_enabled))throw new Error('Activa al menos una forma de pago.');
 if(b.manual_enabled&&!instructions)throw new Error('Escribe dónde debe transferir el cliente y a nombre de quién.');
 if(b.online_enabled){const env=publicKey.startsWith('pub_prod_')?'prod':publicKey.startsWith('pub_test_')?'test':'';if(!env||!secrets.integrity?.startsWith(env+'_integrity_')||!secrets.events?.startsWith(env+'_events_'))throw new Error('Completa las tres claves de Wompi del mismo ambiente.');if(b.enabled&&env!=='prod')throw new Error('Para activar cobros a clientes utiliza las claves de producción.');}
 await query('UPDATE payment_config SET enabled=$1,manual_enabled=$2,instructions=$3,online_enabled=$4,public_key=$5,secrets=$6,hold_hours=$7 WHERE id=1',[b.enabled,b.manual_enabled,instructions,b.online_enabled,publicKey,seal(secrets),b.hold_hours]);
 return {ok:true};
}
export async function paymentStatus(id:unknown,token:unknown){authorized(id,token);await expirePayments();const [b]=await query('SELECT id,service_name,price,start_at,status,deposit_amount,payment_status,payment_due_at,payment_method FROM bookings WHERE id=$1',[id]);if(!b)throw new Error('No encontramos esta reserva.');const [s]=await query('SELECT time_format,phone FROM settings WHERE id=1');return {...b,...s,config:await paymentSettings()};}
export function receiptMime(bytes:Buffer){if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';throw new Error('Adjunta una imagen JPG, PNG o WebP del comprobante.');}
export async function submitReceipt(id:unknown,token:unknown,bytes:Buffer,reference:string){
 authorized(id,token);if(bytes.length<12||bytes.length>5*1024*1024||reference.length>100)throw new Error('El comprobante debe pesar menos de 5 MB.');const mime=receiptMime(bytes);
 return transaction(async q=>{await expirePayments(q);const [c]=await q('SELECT * FROM payment_config WHERE id=1');if(!c.manual_enabled)throw new Error('El pago por transferencia no está disponible.');const [b]=await q('SELECT * FROM bookings WHERE id=$1 FOR UPDATE',[id]);if(!b||b.status!=='pending_payment'||!['pending','submitted'].includes(b.payment_status))throw new Error('Esta reserva ya no espera un comprobante.');
 await q('INSERT INTO payment_receipts(booking_id,content,mime,reference) VALUES($1,$2,$3,$4) ON CONFLICT(booking_id) DO UPDATE SET content=excluded.content,mime=excluded.mime,reference=excluded.reference,created_at=now()',[id,bytes,mime,reference]);
 await q("UPDATE bookings SET payment_status='submitted',payment_method='manual' WHERE id=$1",[id]);await q("INSERT INTO payment_audit(booking_id,action) VALUES($1,'receipt_submitted')",[id]);return {ok:true};});
}
export async function reviewPayment(id:unknown,approve:boolean,note:string){
 if(!uuid(id)||typeof approve!=='boolean'||note.length>500)throw new Error('Revisa los datos del anticipo.');
 return transaction(async q=>{const [b]=await q('SELECT * FROM bookings WHERE id=$1 FOR UPDATE',[id]);if(!b||b.status!=='pending_payment'||b.payment_status!=='submitted')throw new Error('Solo se pueden revisar comprobantes pendientes.');
 if(approve){if(new Date(b.start_at).getTime()<=Date.now())throw new Error('La fecha ya pasó. Contacta al cliente antes de gestionar el pago.');await q("UPDATE bookings SET payment_status='paid',paid_at=now(),status='confirmed' WHERE id=$1",[id]);}
 else await q("UPDATE bookings SET payment_status='rejected',status='cancelled' WHERE id=$1",[id]);
 await q('INSERT INTO payment_audit(booking_id,action,note) VALUES($1,$2,$3)',[id,approve?'manual_approved':'manual_rejected',note]);return {ok:true};});
}
export async function checkout(id:unknown,token:unknown){authorized(id,token);return transaction(async q=>{
 await expirePayments(q);const [b]=await q('SELECT * FROM bookings WHERE id=$1 FOR UPDATE',[id]),[c]=await q('SELECT * FROM payment_config WHERE id=1');
 if(!b||b.status!=='pending_payment'||b.payment_status!=='pending'||!c.online_enabled||!c.public_key.startsWith('pub_prod_'))throw new Error('El pago en línea no está disponible para esta reserva.');
 const secret=unseal(c.secrets);if(!secret.integrity)throw new Error('Falta configurar Wompi.');const reference=randomUUID(),expires=new Date(b.payment_due_at).toISOString();
 await q('INSERT INTO payment_attempts(reference,booking_id,amount,environment,public_key) VALUES($1,$2,$3,$4,$5)',[reference,id,b.deposit_amount,'prod',c.public_key]);
 const params=new URLSearchParams({'public-key':c.public_key,currency:'COP','amount-in-cents':String(b.deposit_amount),reference,'expiration-time':expires,'signature:integrity':hash(reference+b.deposit_amount+'COP'+expires+secret.integrity),'redirect-url':site+'/pago/'+id+'#'+token});
 return {url:'https://checkout.wompi.co/p/?'+params};});}
export function validWompiEvent(event:any,secret:string){
 const props=event?.signature?.properties,checksum=event?.signature?.checksum;if(event?.event!=='transaction.updated'||!Number.isSafeInteger(event.timestamp)||!Array.isArray(props)||props.length<1||props.length>20||typeof checksum!=='string'||!/^[a-f0-9]{64}$/i.test(checksum)||!secret)return false;
 const values=[];for(const property of props){if(typeof property!=='string'||!/^transaction\.[a-z_]+$/.test(property))return false;const val=event.data?.transaction?.[property.slice(12)];if(!['string','number'].includes(typeof val))return false;values.push(String(val));}
 return timingSafeEqual(Buffer.from(hash(values.join('')+event.timestamp+secret),'hex'),Buffer.from(checksum,'hex'));
}
export async function handleWompi(event:any,lookup?: (id:string,key:string)=>Promise<any>){
 const [config]=await query('SELECT * FROM payment_config WHERE id=1');if(event?.environment!=='prod'||!validWompiEvent(event,unseal(config.secrets).events))throw new Error('Firma de pago inválida.');
 const id=event.data.transaction.id;if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new Error('Transacción inválida.');
 // Read the canonical transaction: reference/currency are not always covered by the event signature.
 const fetchTransaction=lookup||(async(id:string,key:string)=>{const r=await fetch('https://production.wompi.co/v1/transactions/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('No pudimos verificar el pago.');return (await r.json()).data;});
 const canonical=await fetchTransaction(id,config.public_key);if(canonical?.id!==id||canonical.status!==event.data.transaction.status||canonical.amount_in_cents!==event.data.transaction.amount_in_cents||canonical.currency!=='COP'||!uuid(canonical.reference))throw new Error('Los datos del pago no coinciden.');
 return transaction(async q=>{const [attempt]=await q('SELECT * FROM payment_attempts WHERE reference=$1 FOR UPDATE',[canonical.reference]);if(!attempt)return {ok:true,ignored:true};if(attempt.amount!==canonical.amount_in_cents||attempt.environment!=='prod'||attempt.public_key!==config.public_key)throw new Error('Importe o comercio no coincide.');if(attempt.status==='APPROVED')return {ok:true};
 const [b]=await q('SELECT * FROM bookings WHERE id=$1 FOR UPDATE',[attempt.booking_id]);
 await q('UPDATE payment_attempts SET transaction_id=$1,status=$2 WHERE reference=$3',[id,canonical.status,attempt.reference]);
 if(canonical.status==='APPROVED'){
 const inTime=new Date(b.payment_due_at).getTime()>Date.now()&&new Date(b.start_at).getTime()>Date.now();
 if(b.status==='pending_payment'&&b.payment_status==='pending'&&inTime)await q("UPDATE bookings SET status='confirmed',payment_status='paid',payment_method='wompi',paid_at=now() WHERE id=$1",[b.id]);
 else await q("UPDATE bookings SET payment_status='review_required',status=CASE WHEN status='pending_payment' AND payment_status='pending' AND payment_due_at<=now() THEN 'cancelled' ELSE status END WHERE id=$1",[b.id]);
 await q("INSERT INTO payment_audit(booking_id,action,note) VALUES($1,'wompi_approved',$2)",[b.id,id]);
 }return {ok:true};});
}
