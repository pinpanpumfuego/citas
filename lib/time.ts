export const ZONE='America/Bogota';
const localFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function localParts(value:Date|string) {
  const p=Object.fromEntries(localFormatter.formatToParts(new Date(value)).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
export function today() {return localParts(new Date()).date;}
export function validDate(date:string) {return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;}
export function candidates(date:string, open:string, close:string, duration:number, now=Date.now()) {
  if(!validDate(date)) return [];
  const [oh,om]=open.split(':').map(Number), [ch,cm]=close.split(':').map(Number);
  const result:string[]=[];
  const start=Date.parse(`${date}T00:00:00Z`);
  for(let t=start;t<start+36*3600000;t+=15*60000){
    const p=localParts(new Date(t)); const [h,m]=p.time.split(':').map(Number);
    const end=localParts(new Date(t+duration*60000)); const [eh,em]=end.time.split(':').map(Number);
    if(p.date===date && end.date===date && h*60+m>=oh*60+om && eh*60+em<=ch*60+cm && t>=now+60*60000) result.push(new Date(t).toISOString());
  }
  return result;
}
export const money=(cents:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP'}).format(cents/100);
export const displayTime=(date:string|Date)=>new Intl.DateTimeFormat('es',{timeZone:ZONE,hour:'numeric',minute:'2-digit'}).format(new Date(date));
