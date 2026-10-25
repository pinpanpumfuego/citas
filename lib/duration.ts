export function durationLabel(minutes:number,english=false){
 const hours=Math.floor(minutes/60),rest=minutes%60;
 if(!hours)return `${minutes} ${english?'minutes':'minutos'}`;
 const whole=`${hours} ${english?(hours===1?'hour':'hours'):(hours===1?'hora':'horas')}`;
 if(!rest)return whole;
 if(rest===30&&!english)return whole+' y media';
 return whole+(english?' and ':' y ')+`${rest} ${english?'minutes':'minutos'}`;
}
export function durationOptions(min:number,max:number,current:number){
 return [...new Set([min,...Array.from({length:Math.floor(max/15)},(_,i)=>(i+1)*15),current])].filter(n=>n>=min&&n<=max).sort((a,b)=>a-b);
}
