import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegisterSW from './register-sw';
export const metadata:Metadata={title:'La Princesa de las Cejas · Medellín',description:'Tu espacio de belleza en Medellín. Reserva tu próxima cita.',manifest:'/manifest.webmanifest',icons:{icon:'/logo-diana-perez.jpg',apple:'/logo-diana-perez.jpg'},appleWebApp:{capable:true,title:'La Princesa'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#171010'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}<RegisterSW/></body></html>}
