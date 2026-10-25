import {createHash,createHmac} from 'node:crypto';
import {setTimeout} from 'node:timers/promises';
if(!process.env.SESSION_SECRET)throw new Error('SESSION_SECRET required');
const key=createHash('sha256').update('notifications:'+process.env.SESSION_SECRET).digest();
const token=createHmac('sha256',key).update('notification-worker').digest('hex');
for(;;){try{const r=await fetch('http://app:3000/api/notifications/dispatch',{method:'POST',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(180000)});if(!r.ok)console.error('Notification worker HTTP',r.status);}catch{console.error('Notification worker temporarily unavailable');}await setTimeout(15000);}
