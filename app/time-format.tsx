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
 const {format}=useTimeFormat(),[internal,setInternal]=useState(defaultValue),current=value??internal;
 const [hour,minute]=current.split(':').map(Number),is12=format==='12h';
 function update(h:number,m:number){const next=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');setInternal(next);onChange?.({target:{value:next}});}
 return <span className={'time-input '+(is12?'time-input-12':'')}>
  <input type="hidden" name={name} value={current} disabled={disabled}/>
  <select aria-label={'Hora '+(label||name||'')} value={is12?hour%12||12:hour} required={required} disabled={disabled} onChange={e=>update(is12?Number(e.target.value)%12+(hour>=12?12:0):Number(e.target.value),minute)}>{Array.from({length:is12?12:24},(_,i)=>is12?i+1:i).map(h=><option key={h} value={h}>{String(h).padStart(2,'0')}</option>)}</select>
  <span aria-hidden="true">:</span>
  <select aria-label={'Minutos '+(label||name||'')} value={minute} required={required} disabled={disabled} onChange={e=>update(hour,Number(e.target.value))}>{Array.from({length:60},(_,m)=><option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}</select>
  {is12&&<select aria-label={'AM o PM '+(label||name||'')} value={hour>=12?'PM':'AM'} disabled={disabled} onChange={e=>update(hour%12+(e.target.value==='PM'?12:0),minute)}><option>AM</option><option>PM</option></select>}
 </span>;
}
export function TimeFormatSetting({format,save,busy}:{format:TimeFormat;save:(payload:any)=>Promise<boolean>;busy:boolean}){
 return <section className="panel settings-form account-panel"><h2>Formato de hora</h2><p className="muted">Elige cómo se muestran las horas en el negocio. No cambia la hora de las citas.</p><div className="schedule-modes"><button type="button" aria-pressed={format==='24h'} disabled={busy} onClick={()=>save({action:'time_format',format:'24h'})}>24 horas<br/>14:30</button><button type="button" aria-pressed={format==='12h'} disabled={busy} onClick={()=>save({action:'time_format',format:'12h'})}>AM / PM<br/>2:30 PM</button></div></section>;
}
