import {query} from './db';
export async function listReservations(filter:string,search:string,page:number){
 if(!['all','next','completed','cancelled'].includes(filter)||!Number.isSafeInteger(page)||page<1||page>100000||search.length>100)throw new Error('Filtros de reservas inválidos.');
 const conditions=["kind='appointment'","strpos(lower(customer || ' ' || phone || ' ' || service_name),lower($1))>0"];
 if(filter==='next')conditions.push("status='confirmed' AND end_at>now()");
 if(filter==='completed'||filter==='cancelled')conditions.push(`status='${filter}'`);
 const where=conditions.join(' AND '),size=30;
 const [count]=await query(`SELECT count(*)::integer AS total FROM bookings WHERE ${where}`,[search.trim()]);
 const pages=Math.max(1,Math.ceil(count.total/size)),current=Math.min(page,pages);
 const rows=await query(`SELECT * FROM bookings WHERE ${where} ORDER BY start_at ${filter==='next'?'ASC':'DESC'},id LIMIT $2 OFFSET $3`,[search.trim(),size,(current-1)*size]);
 return {rows,total:count.total,page:current,pages};
}
