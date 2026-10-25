export function depositAmount(price:number,mode:string,value:number){
 if(mode==='none')return 0;
 if(!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(value)||value<=0)throw new Error('Revisa el anticipo.');
 if(mode==='fixed'&&value<=price)return value;
 if(mode==='percent'&&value<=100)return Math.ceil(price*value/100);
 throw new Error('El anticipo no puede superar el precio. El porcentaje debe ser de 1 a 100.');
}
