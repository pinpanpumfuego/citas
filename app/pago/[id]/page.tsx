import PaymentPage from './payment-page';
export const metadata={title:'Anticipo de tu cita',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PaymentPage id={id}/>;}
