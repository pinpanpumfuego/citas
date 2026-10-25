import {randomBytes,scrypt,timingSafeEqual,createHmac} from 'node:crypto';
import {promisify} from 'node:util';
import {query} from './db';
const derive=promisify(scrypt);
export function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export async function credentials(){const [row]=await query('SELECT password_hash,version FROM admin_credentials WHERE id=1');return row as {password_hash:string;version:number};}
async function matches(password:string,hash:string){
 if(!password||password.length>256)return false;
 if(!hash)return !!process.env.ADMIN_PASSWORD&&equal(password,process.env.ADMIN_PASSWORD);
 const [algorithm,salt,digest]=hash.split('$');if(algorithm!=='scrypt'||!salt||!digest)return false;
 return equal((await derive(password,salt,64) as Buffer).toString('hex'),digest);
}
export async function verifyPassword(password:unknown){if(typeof password!=='string')return null;const row=await credentials();return await matches(password,row.password_hash)?row:null;}
export async function changePassword(current:unknown,next:unknown,confirmation:unknown){
 if(typeof next!=='string'||next.length<8||next.length>128)throw new Error('La nueva contraseña debe tener entre 8 y 128 caracteres.');
 if(next!==confirmation)throw new Error('Las contraseñas nuevas no coinciden.');
 const row=await verifyPassword(current);if(!row)throw new Error('La contraseña actual no es correcta.');
 if(next===current)throw new Error('Elige una contraseña diferente a la actual.');
 const salt=randomBytes(16).toString('hex'),digest=(await derive(next,salt,64) as Buffer).toString('hex');
 const changed=await query('UPDATE admin_credentials SET password_hash=$1,version=version+1 WHERE id=1 AND version=$2 RETURNING version',[`scrypt$${salt}$${digest}`,row.version]);
 if(!changed.length)throw new Error('La contraseña cambió en otra sesión. Vuelve a iniciar sesión.');
 return changed[0].version as number;
}
function sign(value:string){if(!process.env.SESSION_SECRET)throw new Error('SESSION_SECRET is required');return createHmac('sha256',process.env.SESSION_SECRET).update(value).digest('hex');}
export function sessionToken(version:number){const value=`${Date.now()+12*3600000}.${version}`;return `${value}.${sign(value)}`;}
export function validSession(value:string,version:number){
 const parts=value.split('.');
 // Existing cookies remain valid only until the first password change.
 if(parts.length===2&&version===0)return Number(parts[0])>Date.now()&&equal(parts[1],sign(parts[0]));
 if(parts.length!==3||parts[1]!==String(version)||Number(parts[0])<=Date.now()||!Number.isFinite(Number(parts[0])))return false;
 return equal(parts[2],sign(parts[0]+'.'+parts[1]));
}
