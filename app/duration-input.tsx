'use client';
import {useState} from 'react';
import {durationLabel,durationOptions} from '@/lib/duration';
export default function DurationInput({name,value,defaultValue=30,min=5,max=480,onChange}:{name?:string;value?:number;defaultValue?:number;min?:number;max?:number;onChange?:(value:number)=>void}){
 const [internal,setInternal]=useState(defaultValue),current=value??internal;
 return <select className="simple-duration-select" name={name} value={current} required onChange={e=>{const next=Number(e.target.value);setInternal(next);onChange?.(next);}}>{durationOptions(min,max,current).map(n=><option key={n} value={n}>{n===0?'Sin pausa':durationLabel(n)}</option>)}</select>;
}
