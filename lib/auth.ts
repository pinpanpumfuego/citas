import { cookies } from 'next/headers';
import {credentials,validSession} from './credentials';
export const localMode=()=>process.env.NODE_ENV==='development' && !process.env.ADMIN_PASSWORD;
export {equal} from './credentials';
export async function isAdmin(){if(localMode())return true;const v=(await cookies()).get('citas_session')?.value;if(!v||!process.env.SESSION_SECRET)return false;return validSession(v,(await credentials()).version);}
