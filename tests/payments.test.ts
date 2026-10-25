import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {depositAmount} from '../lib/deposit';
const dir=await mkdtemp(path.join(tmpdir(),'citas-payments-'));process.env.LOCAL_DB_PATH=dir;
const {query,db}=await import('../lib/db');
const {reserve,available}=await import('../lib/booking');
const p=await import('../lib/payments');
after(async()=>{await (db() as any).close();await rm(dir,{recursive:true,force:true});});
test('fixed and percentage deposits validate limits and round cents',()=>{assert.equal(depositAmount(10001,'percent',25),2501);assert.equal(depositAmount(10000,'fixed',3000),3000);assert.equal(depositAmount(10000,'none',0),0);assert.throws(()=>depositAmount(100,'percent',101));assert.throws(()=>depositAmount(100,'fixed',101));});
test('manual deposits hold slots, require private receipts and explicit approval; expiration releases slots',async()=>{
 await p.savePaymentSettings({enabled:true,manual_enabled:true,online_enabled:false,instructions:'Cuenta de prueba',hold_hours:24});
 const date=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
 await query('UPDATE settings SET schedule=$1 WHERE id=1',[{dates:{[date]:[{start:'09:00',end:'18:00'}]}}]);
 const [s]=await query("INSERT INTO services(name,price,duration,buffer,deposit_mode,deposit_value) VALUES('Prueba pago',100000,30,0,'percent',30) RETURNING id");
 const start=(await available(s.id,date))[0],input={serviceId:s.id,date,start,customer:'Prueba',phone:'+573000000000',whatsappConsent:true};
 await assert.rejects(reserve({...input,expectedDeposit:1}),/cambió/);
 const id=await reserve(input);let [b]=await query('SELECT * FROM bookings WHERE id=$1',[id]);assert.equal(b.status,'pending_payment');assert.equal(b.deposit_amount,30000);assert.ok(!(await available(s.id,date)).includes(start));
 assert.equal((await query("SELECT * FROM notification_jobs WHERE booking_id=$1 AND channel='waha_customer'",[id])).length,0);
 await assert.rejects(p.paymentStatus(id,'bad'),/válido/);
 const image=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 await assert.rejects(p.submitReceipt(id,p.paymentToken(id),Buffer.from('not an image file'),'x'),/imagen/);
 await p.submitReceipt(id,p.paymentToken(id),image,'REF');
 assert.equal((await p.paymentStatus(id,p.paymentToken(id))).status,'pending_payment');
 await p.reviewPayment(id,true,'Ingreso verificado');assert.equal((await p.paymentStatus(id,p.paymentToken(id))).status,'confirmed');
 await assert.rejects(p.reviewPayment(id,true,''),/pendientes/);
 const next=(await available(s.id,date))[0],expired=await reserve({...input,start:next});
 await query("UPDATE bookings SET payment_due_at=now()-interval '1 minute' WHERE id=$1",[expired]);
 assert.ok((await available(s.id,date)).includes(next));assert.equal((await p.paymentStatus(expired,p.paymentToken(expired))).payment_status,'expired');
 const rejected=await reserve({...input,start:next});await p.submitReceipt(rejected,p.paymentToken(rejected),image,'');await p.reviewPayment(rejected,false,'No ingresó');assert.ok((await available(s.id,date)).includes(next));
});
test('signed online events verify canonical amount, idempotency, and do not resurrect expired reservations',async()=>{
 const secret='prod_events_test';await p.savePaymentSettings({enabled:true,manual_enabled:true,online_enabled:true,instructions:'Prueba',hold_hours:24,public_key:'pub_prod_test',integrity:'prod_integrity_test',events:secret});
 const c=await p.paymentSettings(true);assert.equal(c.secrets,undefined);assert.equal(c.hasSecrets,true);
 const [s]=await query("SELECT * FROM services WHERE name='Prueba pago'");const date=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
 async function pending(){const id=await reserve({serviceId:s.id,date,start:(await available(s.id,date))[0],customer:'Online',phone:'+573000000001'});const {url}=await p.checkout(id,p.paymentToken(id));return {id,reference:new URL(url).searchParams.get('reference')!};}
 function event(reference:string,id:string){const tx={id,status:'APPROVED',amount_in_cents:30000,currency:'COP',reference};const timestamp=123456,properties=['transaction.id','transaction.status','transaction.amount_in_cents'];return {event:'transaction.updated',environment:'prod',timestamp,data:{transaction:tx},signature:{properties,checksum:createHash('sha256').update(id+'APPROVED'+'30000'+timestamp+secret).digest('hex')}};}
 const a=await pending(),e=event(a.reference,'txn-1');assert.equal(p.validWompiEvent(e,secret),true);
 await assert.rejects(p.handleWompi({...e,environment:'test'},async()=>e.data.transaction),/Firma/);
 await assert.rejects(p.handleWompi(e,async()=>({...e.data.transaction,currency:'USD'})),/coinciden/);
 await p.handleWompi(e,async()=>e.data.transaction);await p.handleWompi(e,async()=>e.data.transaction);
 assert.equal((await p.paymentStatus(a.id,p.paymentToken(a.id))).status,'confirmed');assert.equal((await query("SELECT * FROM payment_audit WHERE booking_id=$1 AND action='wompi_approved'",[a.id])).length,1);
 const late=await pending(),ev=event(late.reference,'txn-late');await query("UPDATE bookings SET payment_due_at=now()-interval '1 minute' WHERE id=$1",[late.id]);await p.expirePayments();
 await p.handleWompi(ev,async()=>ev.data.transaction);const b=await p.paymentStatus(late.id,p.paymentToken(late.id));assert.equal(b.status,'cancelled');assert.equal(b.payment_status,'review_required');
});
