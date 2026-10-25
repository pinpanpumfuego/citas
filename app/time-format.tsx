'use client';
import {createContext,useContext,useState} from 'react';
import {displayTime,formatClock,TimeFormat} from '@/lib/time';
export const TimeFormatContext=createContext<TimeFormat>('24h');
export function useTimeFormat(){
 const format=useContext(TimeFormatContext);
 return {format,displayTime:(date:string|Date)=>displayTime(date,format),clock:(time:string)=>formatClock(time,format)};
}
type Props={'aria-label'?:string;name?:string;value?:string;defaultValue?:string;required?:boolean;disabled?:boolean;onChange?:(event:{target:{value:string}})=>void};
export function TimeInput({'aria-label':label,name,value,defaultValue='09:00',required,disabled,onChange}:Props){
 const {clock}=useTimeFormat(),[internal,setInternal]=useState(defaultValue),current=value??internal;
 const times=Array.from({length:96},(_,i)=>String(Math.floor(i/4)).padStart(2,'0')+':'+String(i%4*15).padStart(2,'0'));
 if(!times.includes(current))times.push(current);
 times.sort();
 return <select className="simple-time-select" aria-label={label} name={name} value={current} required={required} disabled={disabled} onChange={e=>{setInternal(e.target.value);onChange?.({target:{value:e.target.value}});}}>
  {times.map(t=><option key={t} value={t}>{clock(t)}</option>)}
 </select>;
}
export function TimeFormatSetting({format,save,busy}:{format:TimeFormat;save:(payload:any)=>Promise<boolean>;busy:boolean}){
 return <section className="panel settings-form account-panel"><h2>Formato de hora</h2><p className="muted">Elige cómo se muestran las horas en el negocio. No cambia la hora de las citas.</p><div className="schedule-modes"><button type="button" aria-pressed={format==='24h'} disabled={busy} onClick={()=>save({action:'time_format',format:'24h'})}>24 horas<br/>14:30</button><button type="button" aria-pressed={format==='12h'} disabled={busy} onClick={()=>save({action:'time_format',format:'12h'})}>AM / PM<br/>2:30 PM</button></div></section>;
}
