import { isAdmin } from '@/lib/auth';
import AdminApp from './workspace';
import Login from './login';
export const dynamic='force-dynamic';
export default async function Admin(){return await isAdmin()?<AdminApp/>:<Login/>;}
