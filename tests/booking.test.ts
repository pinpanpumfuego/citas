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

test('password rotation rejects invalid changes, stores a hash, and revokes old sessions',async()=>{
 const {verifyPassword,changePassword,sessionToken,validSession,credentials}=await import('../lib/credentials');
 const oldPassword=process.env.ADMIN_PASSWORD,oldSecret=process.env.SESSION_SECRET;
 process.env.ADMIN_PASSWORD='Initial-test-123';process.env.SESSION_SECRET='test-session-secret-only';
 try{
  assert.equal((await verifyPassword('Initial-test-123'))?.version,0);
  const before=sessionToken(0);assert.ok(validSession(before,0));
  await assert.rejects(changePassword('wrong','New-test-password','New-test-password'),/actual/);
  await assert.rejects(changePassword('Initial-test-123','short','short'),/8 y 128/);
  await assert.rejects(changePassword('Initial-test-123','New-test-password','different'),/coinciden/);
  await assert.rejects(changePassword('Initial-test-123','Initial-test-123','Initial-test-123'),/diferente/);
  const version=await changePassword('Initial-test-123','New-test-password','New-test-password');
  assert.equal(version,1);assert.equal(await verifyPassword('Initial-test-123'),null);
  assert.equal((await verifyPassword('New-test-password'))?.version,1);
  const stored=await credentials();assert.match(stored.password_hash,/^scrypt\$/);assert.ok(!stored.password_hash.includes('New-test-password'));
  assert.equal(validSession(before,version),false);const next=sessionToken(version);assert.ok(validSession(next,version));
  assert.equal(validSession(next+'x',version),false);assert.equal(validSession('NaN.1.fake',version),false);
  process.env.ADMIN_PASSWORD='Another-env-password';assert.equal(await verifyPassword('Another-env-password'),null);
  assert.equal((await verifyPassword('New-test-password'))?.version,1);
 }finally{if(oldPassword===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=oldPassword;if(oldSecret===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=oldSecret;}
});
after(async()=>{await (db() as any).close();await rm(dir,{recursive:true,force:true});});
test('maintenance login is optional, independent and cannot rotate the owner password',async()=>{
 const {verifyLoginPassword,verifyPassword,changePassword}=await import('../lib/credentials');
 const previous=process.env.MAINTENANCE_PASSWORD;
 try{
  delete process.env.MAINTENANCE_PASSWORD;
  assert.equal(await verifyLoginPassword('Maintenance-test-123'),null);
  process.env.MAINTENANCE_PASSWORD='Maintenance-test-123';
  assert.ok(await verifyLoginPassword('Maintenance-test-123'));
  assert.ok(await verifyLoginPassword('New-test-password'));
  assert.equal(await verifyPassword('Maintenance-test-123'),null);
  assert.equal(await verifyLoginPassword('incorrect'),null);
  assert.equal(await verifyLoginPassword(''),null);
  await assert.rejects(changePassword('Maintenance-test-123','Changed-test-123','Changed-test-123'),/actual/);
  delete process.env.MAINTENANCE_PASSWORD;
  assert.equal(await verifyLoginPassword('Maintenance-test-123'),null);
 }finally{if(previous===undefined)delete process.env.MAINTENANCE_PASSWORD;else process.env.MAINTENANCE_PASSWORD=previous;}
});
test('Medellin slots stay at UTC minus five throughout the year',()=>{
  const winter=candidates('2030-01-10','09:00','10:00',30,0),summer=candidates('2030-07-10','09:00','10:00',30,0);
  assert.equal(winter[0],'2030-01-10T14:00:00.000Z');assert.equal(summer[0],'2030-07-10T14:00:00.000Z');
  assert.equal(localParts(winter.at(-1)!).time,'09:30');
});
test('reservation concurrency, buffers, cancellation and inactive services',async()=>{
  const dates=Object.fromEntries([3,4].map(n=>[new Date(Date.now()+n*86400000).toISOString().slice(0,10),[{start:'09:00',end:'18:00'}]]));
  await query('UPDATE settings SET schedule=$1 WHERE id=1',[{dates}]);
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
  await query('UPDATE settings SET schedule=$1 WHERE id=1',[{dates:{[date]:[]}}]);assert.deepEqual(await available(1,date),[]);
});

test('split schedules and date overrides respect service buffers and existing bookings',async()=>{
 const {validateRanges}=await import('../lib/schedule');
 assert.throws(()=>validateRanges([{start:'10:00',end:'12:00'},{start:'11:00',end:'13:00'}]));
 assert.throws(()=>validateRanges([{start:'18:00',end:'09:00'}]));
 const [s]=await query("INSERT INTO services(name,price,duration,buffer) VALUES('Largo',20000,90,30) RETURNING id");
 const date=new Date(Date.now()+6*86400000).toISOString().slice(0,10);
 const weekly=Array.from({length:7},()=>[{start:'09:00',end:'11:00'},{start:'14:00',end:'16:00'}]);
 const schedule={weekly,dates:{[date]:weekly[0]} as Record<string,{start:string;end:string}[]>};
 await query('UPDATE settings SET schedule=$1::jsonb WHERE id=1',[JSON.stringify(schedule)]);
 let slots=await available(s.id,date);assert.deepEqual(slots.map(t=>localParts(t).time),['09:00','14:00']);
 await reserve({serviceId:s.id,date,start:slots[0],customer:'Prueba',phone:'+573217168203'});
 assert.deepEqual((await available(s.id,date)).map(t=>localParts(t).time),['14:00']);
 schedule.dates[date]=[];
 await query('UPDATE settings SET schedule=$1::jsonb WHERE id=1',[JSON.stringify(schedule)]);
 assert.deepEqual(await available(s.id,date),[]);
 schedule.weekly=Array.from({length:7},()=>[]);
 schedule.dates[date]=[{start:'16:00',end:'18:00'}];
 await query('UPDATE settings SET schedule=$1::jsonb WHERE id=1',[JSON.stringify(schedule)]);
 assert.deepEqual((await available(s.id,date)).map(t=>localParts(t).time),['16:00']);
 delete schedule.dates[date];
 await query('UPDATE settings SET schedule=$1::jsonb WHERE id=1',[JSON.stringify(schedule)]);
 assert.deepEqual(await available(s.id,date),[]);
});

test('quick changes preview conflicts, close whole date ranges, edit and release blocks',async()=>{
 const {changeAvailability,changeBounds}=await import('../lib/availability-change');
 const date=new Date(Date.now()+12*86400000).toISOString().slice(0,10);
 const until=new Date(Date.parse(date)+2*86400000).toISOString().slice(0,10);
 const weekly=Array.from({length:7},()=>[{start:'09:00',end:'18:00'}]);
 await query('UPDATE settings SET schedule=$1::jsonb WHERE id=1',[JSON.stringify({weekly,dates:Object.fromEntries([0,1,2,3].map(n=>[new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10),weekly[0]]))})]);
 const [s]=await query("INSERT INTO services(name,price,duration,buffer) VALUES('Cambios',20000,90,30) RETURNING id");
 const slots=await available(s.id,date);
 const id=await reserve({serviceId:s.id,date,start:slots[0],customer:'Cita existente',phone:'+573217168203'});
 const vacation={mode:'vacation',date,until};
 const preview=await changeAvailability(vacation,true);assert.equal(preview.conflicts?.length,1);
 await assert.rejects(()=>changeAvailability(vacation));
 assert.equal((await query('SELECT status FROM bookings WHERE id=$1',[id]))[0].status,'confirmed');
 await query("UPDATE bookings SET status='cancelled' WHERE id=$1",[id]);
 await changeAvailability(vacation);
 const [block]=await query("SELECT * FROM bookings WHERE kind='block' AND start_at=$1",[changeBounds(vacation).start]);
 const middle=new Date(Date.parse(date)+86400000).toISOString().slice(0,10);
 assert.deepEqual(await available(s.id,middle),[]);
 assert.deepEqual(await available(s.id,until),[]);
 const next=new Date(Date.parse(until)+86400000).toISOString().slice(0,10);assert.ok((await available(s.id,next)).length);
 await changeAvailability({mode:'hours',id:block.id,date,from:'12:00',to:'14:00',reason:'Almuerzo'});
 assert.ok((await available(s.id,date)).some(t=>localParts(t).time==='09:00'));
 assert.ok(!(await available(s.id,date)).some(t=>localParts(t).time==='12:00'));
 await query("UPDATE bookings SET status='cancelled' WHERE id=$1",[block.id]);
 assert.ok((await available(s.id,date)).some(t=>localParts(t).time==='12:00'));
 await assert.rejects(()=>changeAvailability({mode:'hours',id, date,from:'10:00',to:'11:00'}));
 assert.throws(()=>changeBounds({mode:'vacation',date,until:'2020-01-01'}));
});
test('extra hours merge existing windows without reopening blocked time',async()=>{
 const {changeAvailability}=await import('../lib/availability-change');
 const date=new Date(Date.now()+18*86400000).toISOString().slice(0,10);
 const weekly=Array.from({length:7},()=>[]);
 await query('UPDATE settings SET schedule=$1::jsonb WHERE id=1',[JSON.stringify({weekly,dates:{}})]);
 await changeAvailability({mode:'extra',date,from:'09:00',to:'11:00'});
 await changeAvailability({mode:'extra',date,from:'10:00',to:'14:00'});
 const [s]=await query('SELECT schedule FROM settings WHERE id=1');
 assert.deepEqual(s.schedule.dates[date],[{start:'09:00',end:'14:00'}]);
 await changeAvailability({mode:'hours',date,from:'12:00',to:'14:00'});
 await changeAvailability({mode:'extra',date,from:'13:00',to:'18:00'});
 assert.ok(!(await available(1,date)).some(t=>localParts(t).time==='13:00'));
});

test('daily visual hours split precisely around bookings and never label occupied time free',async()=>{
 const {dayTimeline}=await import('../lib/day-timeline');
 const date='2030-01-10',settings={schedule:{weekly:Array.from({length:7},()=>[{start:'09:15',end:'12:00'},{start:'14:00',end:'17:00'}]),dates:{}}};
 settings.schedule.dates={[date]:settings.schedule.weekly[0]};
 const bookings=[{id:'a',kind:'appointment',status:'confirmed',start_at:date+'T10:15:00-05:00',end_at:date+'T11:45:00-05:00'},{id:'b',kind:'block',status:'confirmed',start_at:date+'T14:30:00-05:00',end_at:date+'T15:15:00-05:00'}];
 const items=dayTimeline(date,settings,bookings);
 assert.equal(items.filter(x=>x.kind==='appointment').length,1);
 assert.equal(items.filter(x=>x.kind==='block').length,1);
 for(const item of items.filter(x=>x.kind==='free'))for(const b of bookings)assert.ok(!(item.start<Date.parse(b.end_at)&&item.end>Date.parse(b.start_at)));
 assert.ok(items.some(x=>x.kind==='free'&&localParts(new Date(x.start)).time==='11:45'));
 assert.ok(!items.some(x=>x.kind==='free'&&localParts(new Date(x.start)).time==='12:00'));
 assert.ok(dayTimeline(date,settings,[{...bookings[1],status:'cancelled'}]).some(x=>x.kind==='free'&&localParts(new Date(x.start)).time==='14:00'));
 const closed={schedule:{...settings.schedule,dates:{[date]:[]}}};assert.equal(dayTimeline(date,closed,bookings).filter(x=>x.kind==='free').length,0);
 const full=dayTimeline(date,settings,[{kind:'block',status:'confirmed',start_at:'2030-01-09T00:00:00-05:00',end_at:'2030-01-12T00:00:00-05:00'}]);assert.equal(full.length,1);assert.equal(full[0].end-full[0].start,86400000);
});

test('dates are closed by default, bounded opening is inclusive and never cancels bookings or removes blocks',async()=>{
 const {openingPlan,openPeriod}=await import('../lib/open-period');
 const {scheduleFor}=await import('../lib/schedule');
 assert.deepEqual(scheduleFor({weekdays:[0,1,2,3,4,5,6],open_time:'09:00',close_time:'18:00'}).weekly,Array.from({length:7},()=>[]));
 const from=new Date(Date.now()+30*86400000).toISOString().slice(0,10),until=new Date(Date.parse(from)+6*86400000).toISOString().slice(0,10),before=new Date(Date.parse(from)-86400000).toISOString().slice(0,10),afterDate=new Date(Date.parse(until)+86400000).toISOString().slice(0,10);
 await query('UPDATE settings SET schedule=$1 WHERE id=1',[{weekly:Array.from({length:7},()=>[{start:'00:00',end:'23:00'}]),dates:{}}]);
 assert.deepEqual(await available(1,from),[]);
 const input={from,until,days:[0,1,2,3,4,5,6],ranges:[{start:'09:00',end:'12:00'},{start:'14:00',end:'18:00'}]};
 assert.equal(openingPlan(input).dates.length,7);
 assert.equal(openingPlan({...input,days:[new Date(from+'T12:00Z').getUTCDay()]}).dates.length,1);
 assert.throws(()=>openingPlan({...input,until:before}));assert.throws(()=>openingPlan({...input,days:[]}));assert.throws(()=>openingPlan({...input,ranges:[{start:'18:00',end:'09:00'}]}));assert.throws(()=>openingPlan({...input,until:'2040-01-01'}));
 await openPeriod(input,true);assert.deepEqual(await available(1,from),[]);
 await openPeriod(input);assert.ok((await available(1,from)).length);assert.ok((await available(1,until)).length);assert.deepEqual(await available(1,before),[]);assert.deepEqual(await available(1,afterDate),[]);
 const id=await reserve({serviceId:1,date:from,start:(await available(1,from))[0],customer:'Se conserva',phone:'+573000000000'});
 const {changeAvailability}=await import('../lib/availability-change');await changeAvailability({mode:'hours',date:until,from:'14:00',to:'16:00'});
 await openPeriod({...input,ranges:[{start:'10:00',end:'18:00'}],replace:true});
 assert.equal((await query('SELECT status FROM bookings WHERE id=$1',[id]))[0].status,'confirmed');assert.ok(!(await available(1,until)).some(t=>localParts(t).time==='14:00'));
 // A deliberately closed date is retained unless replacement is explicit.
 await query("UPDATE settings SET schedule=jsonb_set(schedule,ARRAY['dates',$1], '[]'::jsonb) WHERE id=1",[until]);
 const preview=await openPeriod(input,true);assert.equal(preview.skipped?.length,7);
 await openPeriod(input);assert.deepEqual(await available(1,until),[]);
 await openPeriod({...input,replace:true});assert.ok((await available(1,until)).length);
 assert.deepEqual(await available(1,afterDate),[]);
});

test('different weekday hours repeat only within the period and closed days replace openings explicitly',async()=>{
 const {openingPlan,openPeriod}=await import('../lib/open-period');
 const weekly=Array.from({length:7},()=>[] as {start:string;end:string}[]);
 weekly[1]=[{start:'09:00',end:'12:00'},{start:'14:00',end:'18:00'}];weekly[2]=[{start:'11:00',end:'16:00'}];
 const input={from:'2030-01-07',until:'2030-01-20',weekly};
 const plan=openingPlan(input);assert.equal(plan.dates.length,14);assert.deepEqual(plan.patch['2030-01-07'],weekly[1]);assert.deepEqual(plan.patch['2030-01-14'],weekly[1]);assert.deepEqual(plan.patch['2030-01-08'],weekly[2]);assert.deepEqual(plan.patch['2030-01-13'],[]);assert.equal(plan.patch['2030-01-21'],undefined);
 assert.throws(()=>openingPlan({...input,weekly:[]}));assert.throws(()=>openingPlan({...input,weekly:weekly.map(()=>[{start:'18:00',end:'09:00'}])}));
 await query('UPDATE settings SET schedule=$1 WHERE id=1',[{dates:{'2030-01-13':[{start:'09:00',end:'18:00'}],'2030-01-21':[{start:'10:00',end:'12:00'}]}}]);
 const before=await query('SELECT id,status FROM bookings ORDER BY id');
 await openPeriod(input,true);assert.equal((await query('SELECT schedule FROM settings WHERE id=1'))[0].schedule.dates['2030-01-07'],undefined);
 await openPeriod(input);assert.equal((await query('SELECT schedule FROM settings WHERE id=1'))[0].schedule.dates['2030-01-13'].length,1);
 await openPeriod({...input,replace:true});const saved=(await query('SELECT schedule FROM settings WHERE id=1'))[0].schedule;
 assert.deepEqual(saved.dates['2030-01-13'],[]);assert.deepEqual(saved.dates['2030-01-08'],weekly[2]);assert.deepEqual(saved.dates['2030-01-21'],[{start:'10:00',end:'12:00'}]);assert.deepEqual(saved.weekly,Array.from({length:7},()=>[]));assert.deepEqual(await query('SELECT id,status FROM bookings ORDER BY id'),before);
});

test('touch calendar applies only explicitly selected dates and can close them without changing others',async()=>{
 const {openingPlan,openPeriod}=await import('../lib/open-period');
 const input={dates:['2030-03-04','2030-03-06','2030-03-04'],ranges:[{start:'10:00',end:'15:00'}],replace:true};
 assert.deepEqual(openingPlan(input).dates,['2030-03-04','2030-03-06']);assert.throws(()=>openingPlan({...input,dates:[]}));assert.throws(()=>openingPlan({...input,dates:['2030-02-30']}));
 await query('UPDATE settings SET schedule=$1 WHERE id=1',[{dates:{'2030-03-05':[{start:'09:00',end:'12:00'}]}}]);
 await openPeriod(input);await openPeriod({...input,dates:['2030-03-04'],ranges:[]});const [s]=await query('SELECT schedule FROM settings WHERE id=1');
 assert.deepEqual(s.schedule.dates['2030-03-04'],[]);assert.deepEqual(s.schedule.dates['2030-03-06'],input.ranges);assert.deepEqual(s.schedule.dates['2030-03-05'],[{start:'09:00',end:'12:00'}]);
});

test('appointment edits preserve identity and protect closed or occupied hours',async()=>{
 const {editBooking}=await import('../lib/edit-booking');
 const {randomUUID}=await import('node:crypto');
 const date='2035-06-15',next='2035-06-16';
 await query('UPDATE settings SET schedule=$1 WHERE id=1',[{dates:{[date]:[{start:'09:00',end:'18:00'}],[next]:[{start:'09:00',end:'18:00'}]}}]);
 const [s]=await query("INSERT INTO services(name,price,duration,buffer) VALUES('Edición',25000,60,0) RETURNING id");
 const id=randomUUID(),block=randomUUID();
 await query("INSERT INTO bookings(id,service_id,service_name,price,customer,phone,start_at,end_at) VALUES($1,$2,'Edición',25000,'Cliente','+573001234567',$3,$4)",[id,s.id,date+'T09:00:00-05:00',date+'T10:00:00-05:00']);
 await query("INSERT INTO bookings(id,service_name,price,customer,phone,start_at,end_at,kind) VALUES($1,'Descanso',0,'','',$2,$3,'block')",[block,next+'T12:00:00-05:00',next+'T13:00:00-05:00']);
 const input={id,serviceId:s.id,customer:'Cliente corregido',phone:'+573009876543',price:30000,duration:60,date:next,time:'10:00'};
 await assert.rejects(editBooking({...input,time:'08:00'}),/horario abierto/);
 await assert.rejects(editBooking({...input,time:'12:00'}),/cruza/);
 await assert.rejects(editBooking({...input,date:'2035-06-17'}),/horario abierto/);
 await editBooking(input);
 let [saved]=await query('SELECT * FROM bookings WHERE id=$1',[id]);assert.equal(saved.customer,input.customer);assert.equal(saved.price,30000);assert.equal(localParts(saved.start_at).date,next);assert.equal(localParts(saved.start_at).time,'10:00');
 await editBooking({...input,customer:'Otro nombre'}); // It must not conflict with itself.
 await query("UPDATE bookings SET status='cancelled' WHERE id=$1",[id]);
 await assert.rejects(editBooking(input),/confirmadas/);
 [saved]=await query('SELECT * FROM bookings WHERE id=$1',[id]);assert.equal(saved.status,'cancelled');
});

test('reservation list includes old history, searches and paginates all matching appointments',async()=>{
 const {listReservations}=await import('../lib/reservations');
 const {randomUUID}=await import('node:crypto');
 for(let i=0;i<32;i++){const start=new Date(Date.UTC(2010,0,1+i,14));await query("INSERT INTO bookings(id,service_name,price,customer,phone,start_at,end_at,status) VALUES($1,'Historial',100,'Historial único','+573001112233',$2,$3,$4)",[randomUUID(),start.toISOString(),new Date(+start+3600000).toISOString(),i===0?'cancelled':'completed']);}
 const first=await listReservations('all','Historial único',1),second=await listReservations('all','Historial único',2);
 assert.equal(first.total,32);assert.equal(first.rows.length,30);assert.equal(second.rows.length,2);assert.equal(new Set([...first.rows,...second.rows].map(b=>b.id)).size,32);
 assert.equal((await listReservations('cancelled','Historial único',1)).total,1);
 assert.equal((await listReservations('completed','Historial único',1)).total,31);
 assert.equal((await listReservations('next','Historial único',1)).total,0);
 assert.equal((await listReservations('all','not a customer',1)).total,0);
});
