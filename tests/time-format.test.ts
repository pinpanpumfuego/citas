import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayTime,formatClock,localParts} from '../lib/time';
test('clock formats distinguish noon and midnight without changing appointment time',()=>{
 assert.equal(formatClock('00:00','12h'),'12:00 AM');
 assert.equal(formatClock('12:00','12h'),'12:00 PM');
 assert.equal(formatClock('14:30','12h'),'2:30 PM');
 assert.equal(formatClock('23:59','12h'),'11:59 PM');
 assert.equal(formatClock('24:00','12h'),'12:00 AM');
 assert.equal(formatClock('09:05','24h'),'09:05');
 const instant='2030-01-10T19:30:00Z';
 assert.equal(displayTime(instant,'24h'),'14:30');
 assert.equal(displayTime(instant,'12h'),'2:30 PM');
 assert.deepEqual(localParts(instant),{date:'2030-01-10',time:'14:30'});
});
