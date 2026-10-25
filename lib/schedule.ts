export type Range={start:string;end:string};
export type Schedule={weekly:Range[][];dates:Record<string,Range[]>};
export function scheduleFor(s:any):Schedule{return s.schedule||{weekly:Array.from({length:7},(_,i)=>s.weekdays.includes(i)?[{start:s.open_time,end:s.close_time}]:[]),dates:{}};}
export function validateRanges(value:unknown):Range[]{
 if(!Array.isArray(value)||value.length>8)throw new Error('Usa hasta 8 franjas por día.');
 const time=/^([01]\d|2[0-3]):[0-5]\d$/;
 const ranges=value.map(r=>{if(!r||typeof r.start!=='string'||typeof r.end!=='string'||!time.test(r.start)||!time.test(r.end)||r.start>=r.end)throw new Error('Cada franja debe terminar después de empezar.');return {start:r.start,end:r.end};}).sort((a,b)=>a.start.localeCompare(b.start));
 if(ranges.some((r,i)=>i>0&&r.start<ranges[i-1].end))throw new Error('Las franjas del mismo día no pueden cruzarse.');
 return ranges;
}
