import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
export const localMode=()=>process.env.NODE_ENV==='development' && !process.env.ADMIN_PASSWORD;
export function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);}
function sign(s:string){if(!process.env.SESSION_SECRET)throw new Error('SESSION_SECRET is required');return createHmac('sha256',process.env.SESSION_SECRET).update(s).digest('hex');}
export function token(){const value=String(Date.now()+12*3600000);return `${value}.${sign(value)}`;}
export async function isAdmin(){if(localMode())return true;const v=(await cookies()).get('citas_session')?.value; if(!v || !process.env.SESSION_SECRET)return false;const [expiry,sig]=v.split('.');return Number(expiry)>Date.now() && equal(sig||'',sign(expiry));}
