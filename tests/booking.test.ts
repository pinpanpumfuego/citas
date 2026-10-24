import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {candidates,localParts} from '../lib/time';
const dir=await mkdtemp(path.join(tmpdir(),'citas-test-'));
process.env.LOCAL_DB_PATH=dir;
const {query,db}=await import('../lib/db');
const {available,reserve}=await import('../lib/booking');
after(async()=>{await (db() as any).close();await rm(dir,{recursive:true,force:true});});
test('Boston slots follow summer and winter offsets',()=>{
  const winter=candidates('2030-01-10','09:00','10:00',30,0),summer=candidates('2030-07-10','09:00','10:00',30,0);
  assert.equal(winter[0],'2030-01-10T14:00:00.000Z');assert.equal(summer[0],'2030-07-10T13:00:00.000Z');
  assert.equal(localParts(winter.at(-1)!).time,'09:30');
});
test('reservation concurrency, buffers, cancellation and inactive services',async()=>{
  await query("UPDATE settings SET weekdays='{0,1,2,3,4,5,6}' WHERE id=1");
  const [s]=await query("INSERT INTO services(name,price,duration,buffer) VALUES('Prueba',3500,30,15) RETURNING id");
  const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  const slots=await available(s.id,date);assert.ok(slots.length>0);
  const input={serviceId:s.id,date,start:slots[0],customer:'Prueba',phone:'+16175550100'};
  const results=await Promise.allSettled([reserve(input),reserve(input)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const remaining=await available(s.id,date);assert.ok(!remaining.includes(slots[0]));assert.ok(!remaining.includes(slots[1]));assert.ok(!remaining.includes(slots[2]));assert.ok(remaining.includes(slots[3]));
  await query("UPDATE bookings SET status='cancelled'");assert.ok((await available(s.id,date)).includes(slots[0]));
  await query('UPDATE services SET active=false WHERE id=$1',[s.id]);assert.equal((await available(s.id,date)).length,0);
});
test('blocks prevent overlap and closed weekdays prevent bookings',async()=>{
  await query('UPDATE services SET active=true');
  const date=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
  const slots=await available(1,date);
  await query("INSERT INTO bookings(id,service_name,price,customer,phone,start_at,end_at,kind) VALUES('00000000-0000-0000-0000-000000000001','Descanso',0,'','',$1,$2,'block')",[slots[0],new Date(Date.parse(slots[0])+3600000).toISOString()]);
  assert.ok(!(await available(1,date)).includes(slots[0]));
  await assert.rejects(()=>reserve({serviceId:1,date,start:slots[0],customer:'Prueba',phone:'+16175550100'}));
  await query("UPDATE settings SET weekdays='{}' WHERE id=1");assert.deepEqual(await available(1,date),[]);
});
