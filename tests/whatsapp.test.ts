import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=await mkdtemp(path.join(tmpdir(),'citas-whatsapp-'));process.env.LOCAL_DB_PATH=dir;process.env.SESSION_SECRET='whatsapp-test-secret';
const {query,db,transaction}=await import('../lib/db');
const {botStep,processInbox}=await import('../lib/whatsapp-bot');
const {inboundMessage,normalizedPhone,validWebhook,webhookToken,receive,matchingAccount}=await import('../lib/whatsapp');
const {reserve,available}=await import('../lib/booking');
const {processJobs}=await import('../lib/notifications');
after(async()=>{await (db() as any).close();await rm(dir,{recursive:true,force:true});});
const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
let service:any;
test('webhook rejects outgoing, stale, group, nontext and untrusted traffic',()=>{
 const e={event:'message',session:'default',payload:{id:'abc',from:'573001234567@c.us',fromMe:false,body:'Reservar',timestamp:Math.floor(Date.now()/1000)}};
 assert.ok(inboundMessage(e));assert.equal(inboundMessage({...e,payload:{...e.payload,fromMe:true}}),null);assert.equal(inboundMessage({...e,payload:{...e.payload,from:'123@g.us'}}),null);assert.equal(inboundMessage({...e,payload:{...e.payload,timestamp:1}}),null);assert.equal(inboundMessage({...e,payload:{...e.payload,hasMedia:true}}),null);
 assert.equal(validWebhook('Bearer '+webhookToken()),true);assert.equal(validWebhook('Bearer wrong'),false);
 assert.equal(normalizedPhone('3001234567'),'573001234567');assert.equal(normalizedPhone('+1 (321) 716-8203'),'13217168203');assert.equal(normalizedPhone('bad'),'');
 assert.equal(matchingAccount({status:'WORKING',me:{id:'573217168203@c.us'}}),true);assert.equal(matchingAccount({status:'WORKING',me:{id:'573000000000@c.us'}}),false);
});
test('guided booking confirms only after explicit final choice and respects live availability',async()=>{
 [service]=await query("INSERT INTO services(name,price,duration,buffer) VALUES('Cejas',20000000,60,0) RETURNING *");
 await query('UPDATE settings SET schedule=$1 WHERE id=1',[{dates:{[day]:[{start:'09:00',end:'18:00'}]}}]);
 await query("UPDATE whatsapp_config SET enabled=true,enabled_at=now()-interval '1 minute' WHERE id=1");
 const phone='573001234567';let r=await botStep(query,{},'hola',phone);assert.equal(r.text,undefined);
 r=await botStep(query,{},'reservar',phone);assert.equal(r.state.step,'service');r=await botStep(query,r.state,'1',phone);assert.equal(r.state.step,'date');assert.deepEqual(r.state.dates,[day]);r=await botStep(query,r.state,'1',phone);assert.equal(r.state.step,'slot');
 r=await botStep(query,r.state,'1',phone);assert.equal(r.state.step,'name');r=await botStep(query,r.state,'Ana Prueba',phone);assert.equal(r.state.step,'confirm');assert.equal((await query('SELECT * FROM bookings')).length,0);
 const confirmed=await transaction(q=>botStep(q,r.state,'CONFIRMAR',phone));assert.ok(confirmed.bookingId);assert.match(confirmed.text!,/confirmada/);assert.equal((await query('SELECT * FROM bookings')).length,1);
 assert.equal((await query("SELECT * FROM notification_jobs WHERE channel='waha_customer'")).length,0);
 const collision=await transaction(q=>botStep(q,r.state,'CONFIRMAR','573009876543'));assert.equal(collision.state.step,'slot');assert.equal((await query('SELECT * FROM bookings')).length,1);
 assert.equal((await botStep(query,{step:'paused'},'hola',phone)).text,undefined);assert.equal((await botStep(query,{},'ASESOR',phone)).state.step,'paused');
});
test('web opt-in queues confirmation atomically; no consent does not queue',async()=>{
 let slots=await available(service.id,day);const id=await reserve({serviceId:service.id,date:day,start:slots[0],customer:'Web Cliente',phone:'+573004445566',whatsappConsent:true});assert.equal((await query("SELECT * FROM notification_jobs WHERE booking_id=$1 AND channel='waha_customer'",[id])).length,1);
 slots=await available(service.id,day);const other=await reserve({serviceId:service.id,date:day,start:slots[0],customer:'Sin Avisos',phone:'+573004445566'});assert.equal((await query('SELECT * FROM notification_jobs WHERE booking_id=$1',[other])).length,0);
});
test('duplicate webhook and concurrent workers advance a chat once, and sends stay ordered',async()=>{
 const e={event:'message',session:'default',me:{id:'573217168203@c.us'},payload:{id:'unique-message',from:'573008889999@c.us',fromMe:false,body:'RESERVAR',timestamp:Math.floor(Date.now()/1000)}};
 await receive(e);await receive(e);assert.equal((await query('SELECT * FROM whatsapp_inbox')).length,1);
 await Promise.all([processInbox(),processInbox()]);assert.equal((await query("SELECT * FROM notification_jobs WHERE channel='waha_reply'")).length,1);
 await receive({...e,payload:{...e.payload,id:'second',body:'1'}});await processInbox();
 await processJobs(async()=> 'sent');const jobs=await query("SELECT * FROM notification_jobs WHERE channel='waha_reply' ORDER BY id");assert.equal(jobs[0].status,'sent');assert.equal(jobs[1].status,'pending');
 await processJobs(async()=> 'sent');assert.equal((await query('SELECT status FROM notification_jobs WHERE id=$1',[jobs[1].id]))[0].status,'sent');
});
