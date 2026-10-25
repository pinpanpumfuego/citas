import {scheduleFor} from './schedule';
export type DayItem={start:number;end:number;kind:'free'|'block'|'appointment';booking?:any};
export function dayTimeline(date:string,settings:any,bookings:any[]):DayItem[]{
 const base=Date.parse(date+'T00:00:00-05:00');const schedule=scheduleFor(settings);
 const ranges=(schedule.dates[date]??schedule.weekly[new Date(date+'T12:00:00Z').getUTCDay()]).map(r=>({start:Date.parse(date+'T'+r.start+':00-05:00'),end:Date.parse(date+'T'+r.end+':00-05:00')}));
 const occupied=bookings.filter(b=>b.status!=='cancelled').map(b=>({start:Math.max(base,Date.parse(b.start_at)),end:Math.min(base+86400000,Date.parse(b.end_at)),kind:b.kind as 'block'|'appointment',booking:b})).filter(b=>b.end>b.start);
 const cuts=new Set<number>();ranges.forEach(r=>{cuts.add(r.start);cuts.add(r.end);for(let t=base;t<base+86400000;t+=3600000)if(t>r.start&&t<r.end)cuts.add(t);});occupied.forEach(b=>{cuts.add(b.start);cuts.add(b.end);});
 const points=[...cuts].sort((a,b)=>a-b),free:DayItem[]=[];
 for(let i=0;i<points.length-1;i++){const start=points[i],end=points[i+1];if(ranges.some(r=>start>=r.start&&end<=r.end)&&!occupied.some(b=>start<b.end&&end>b.start))free.push({start,end,kind:'free'});}
 return [...free,...occupied].sort((a,b)=>a.start-b.start);
}
