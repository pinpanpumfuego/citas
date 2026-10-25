import {NextRequest,NextResponse} from 'next/server';
import {equal} from '@/lib/auth';
import {workerToken,processJobs} from '@/lib/notifications';
import {processInbox} from '@/lib/whatsapp-bot';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){if(!equal(req.headers.get('authorization')||'','Bearer '+workerToken()))return new Response(null,{status:401});let received=0;try{received=await processInbox();}catch{console.error('WhatsApp inbox processing will retry');}return NextResponse.json({received,processed:await processJobs()});}
