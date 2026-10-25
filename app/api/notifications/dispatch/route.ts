import {NextRequest,NextResponse} from 'next/server';
import {equal} from '@/lib/auth';
import {workerToken,processJobs} from '@/lib/notifications';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){if(!equal(req.headers.get('authorization')||'','Bearer '+workerToken()))return new Response(null,{status:401});return NextResponse.json({processed:await processJobs()});}
