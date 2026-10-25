import {NextRequest,NextResponse} from 'next/server';
import {isAdmin} from '@/lib/auth';
import {query} from '@/lib/db';
import {paymentStatus,submitReceipt,checkout,receiptMime} from '@/lib/payments';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(req.nextUrl.searchParams.has('qr')){const [qr]=await query('SELECT content,mime FROM payment_qr WHERE id=1');if(!qr)return new NextResponse('Sin QR.',{status:404});const ext=qr.mime==='image/png'?'png':qr.mime==='image/webp'?'webp':'jpg';return new NextResponse(new Uint8Array(qr.content),{headers:{'Content-Type':qr.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':req.nextUrl.searchParams.has('download')?'attachment; filename="QR-Bancolombia.'+ext+'"':'inline'}});}
 if(!await isAdmin())return new NextResponse('Inicia sesión.',{status:401});
 const id=req.nextUrl.searchParams.get('receipt');if(!id||!/^[a-f0-9-]{36}$/i.test(id))return new NextResponse('Comprobante inválido.',{status:400});
 const [r]=await query('SELECT content,mime FROM payment_receipts WHERE booking_id=$1',[id]);if(!r)return new NextResponse('Sin comprobante.',{status:404});
 return new NextResponse(new Uint8Array(r.content),{headers:{'Content-Type':r.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
}
export async function POST(req:NextRequest){
 try{
 const origin=req.headers.get('origin');if(!origin||new URL(origin).host!==req.headers.get('host'))return NextResponse.json({error:'Origen no permitido.'},{status:403});
 const multipart=req.headers.get('content-type')?.startsWith('multipart/form-data'),max=multipart?6*1024*1024:8192;
 if(Number(req.headers.get('content-length')||0)>max)return NextResponse.json({error:'El archivo es demasiado grande.'},{status:413});
 // Bound streamed bodies too, rather than trusting the Content-Length header.
 const reader=req.body?.getReader();if(!reader)throw new Error('Solicitud vacía.');let length=0;const chunks:Uint8Array[]=[];
 while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>max){await reader.cancel();return NextResponse.json({error:'El archivo es demasiado grande.'},{status:413});}chunks.push(r.value);}
 const raw=Buffer.concat(chunks);
 if(multipart){const form=await new Request(req.url,{method:'POST',headers:{'content-type':req.headers.get('content-type')!},body:raw}).formData(),file=form.get('receipt');if(form.get('action')==='upload_qr'){if(!await isAdmin())return NextResponse.json({error:'Inicia sesión.'},{status:401});const qr=form.get('qr');if(!(qr instanceof File)||qr.size<12||qr.size>5*1024*1024)throw new Error('Elige una imagen de tu QR de hasta 5 MB.');const bytes=Buffer.from(await qr.arrayBuffer()),mime=receiptMime(bytes);await query('INSERT INTO payment_qr(id,content,mime) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET content=excluded.content,mime=excluded.mime,updated_at=now()',[bytes,mime]);return NextResponse.json({ok:true});}if(!(file instanceof File))throw new Error('Adjunta el comprobante.');return NextResponse.json(await submitReceipt(form.get('id'),form.get('token'),Buffer.from(await file.arrayBuffer()),String(form.get('reference')||'')));}
 const b=JSON.parse(raw.toString());if(b.action==='remove_qr'){if(!await isAdmin())return NextResponse.json({error:'Inicia sesión.'},{status:401});await query('DELETE FROM payment_qr WHERE id=1');return NextResponse.json({ok:true});}if(b.action==='status')return NextResponse.json(await paymentStatus(b.id,b.token),{headers:{'Cache-Control':'no-store'}});if(b.action==='checkout')return NextResponse.json(await checkout(b.id,b.token));throw new Error('Acción inválida.');
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No pudimos procesar el pago.'},{status:400});}
}
