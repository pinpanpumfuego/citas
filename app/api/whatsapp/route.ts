import {NextRequest,NextResponse} from 'next/server';
import {isAdmin} from '@/lib/auth';
import {connectionStatus,connect,setEnabled,waha} from '@/lib/whatsapp';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!await isAdmin())return new Response(null,{status:401});
 try{if(req.nextUrl.searchParams.get('qr')==='1'){const data=await waha('/api/default/auth/qr');return NextResponse.json({qr:data.mimetype==='image/png'?'data:image/png;base64,'+data.data:null},{headers:{'Cache-Control':'no-store'}});}
 return NextResponse.json(await connectionStatus(),{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'El QR todavía no está listo. Pulsa Actualizar QR en unos segundos.'},{status:503});}
}
export async function POST(req:NextRequest){
 if(!await isAdmin())return new Response(null,{status:401});
 try{if(new URL(req.headers.get('origin')||'').host!==req.headers.get('host'))return new Response(null,{status:403});}catch{return new Response(null,{status:403});}
 try{const raw=await req.text();if(raw.length>1000)return new Response(null,{status:413});const p=JSON.parse(raw);
 if(p.action==='connect')await connect();else if(p.action==='enable')await setEnabled(true);else if(p.action==='pause')await setEnabled(false);else throw new Error('Acción no válida.');
 return NextResponse.json({ok:true});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo conectar.'},{status:400});}
}
