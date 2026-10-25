import {test} from 'node:test';
import assert from 'node:assert/strict';
import {durationLabel,durationOptions} from '../lib/duration';
test('durations use hours while retaining exact minutes and existing unusual values',()=>{
 assert.equal(durationLabel(90),'1 hora y media');
 assert.equal(durationLabel(120),'2 horas');
 assert.equal(durationLabel(75),'1 hora y 15 minutos');
 assert.equal(durationLabel(30),'30 minutos');
 assert.equal(durationLabel(90,true),'1 hour and 30 minutes');
 assert.ok(durationOptions(5,480,47).includes(47));
 assert.equal(durationOptions(0,120,0)[0],0);
 assert.ok(durationOptions(5,480,47).every(n=>n>=5&&n<=480));
});
