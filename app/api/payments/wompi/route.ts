import {NextRequest,NextResponse} from 'next/server';
import {handleWompi} from '@/lib/payments';
export async function POST(req:NextRequest){
 try{const raw=await req.text();if(raw.length>32768)return new NextResponse(null,{status:413});await handleWompi(JSON.parse(raw));return NextResponse.json({ok:true});}catch{return NextResponse.json({error:'No se pudo verificar el evento.'},{status:400});}
}
