import {NextRequest,NextResponse} from 'next/server';
import {isAdmin} from '@/lib/auth';
import {publicConfiguration,saveConfiguration,subscribe,enqueueTest} from '@/lib/notifications';
import {query} from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET(){if(!await isAdmin())return NextResponse.json({error:'Inicia sesión'},{status:401});return NextResponse.json(await publicConfiguration());}
export async function POST(req:NextRequest){if(!await isAdmin())return NextResponse.json({error:'Inicia sesión'},{status:401});let origin;try{origin=new URL(req.headers.get('origin')||'');}catch{return new Response(null,{status:403});}if(origin.host!==req.headers.get('host'))return new Response(null,{status:403});
 try{const body=await req.text();if(body.length>12000)return new Response(null,{status:413});const p=JSON.parse(body);if(p.action==='config')await saveConfiguration(p);else if(p.action==='subscribe')await subscribe(p.subscription);else if(p.action==='unsubscribe')await query('DELETE FROM push_devices WHERE endpoint=$1',[String(p.endpoint||'')]);else if(p.action==='test')await enqueueTest(p.channel,p.endpoint);else throw new Error('Acción no válida');return NextResponse.json({ok:true});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo guardar'},{status:400});}}
