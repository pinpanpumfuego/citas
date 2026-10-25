import {NextRequest} from 'next/server';
import {validWebhook,receive} from '@/lib/whatsapp';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 if(!validWebhook(req.headers.get('authorization')||''))return new Response(null,{status:401});
 if(Number(req.headers.get('content-length')||0)>100000)return new Response(null,{status:413});
 try{const raw=await req.text();if(raw.length>100000)return new Response(null,{status:413});await receive(JSON.parse(raw));return Response.json({ok:true});}catch{return Response.json({error:'Intenta de nuevo'},{status:503});}
}
