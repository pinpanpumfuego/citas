import type { Metadata, Viewport } from 'next';
import './globals.css';
import './brand-theme.css';
import RegisterSW from './register-sw';
export const metadata:Metadata={title:'La Princesa de las Cejas · Medellín',description:'Tu espacio de belleza en Medellín. Reserva tu próxima cita.',manifest:'/manifest.webmanifest',icons:{icon:[{url:'/favicon.ico?v=2',sizes:'16x16 32x32 48x48 256x256'},{url:'/favicon.svg?v=2',type:'image/svg+xml'},{url:'/favicon-32x32.png?v=2',sizes:'32x32',type:'image/png'},{url:'/favicon-16x16.png?v=2',sizes:'16x16',type:'image/png'}],apple:[{url:'/apple-touch-icon.png?v=2',sizes:'180x180',type:'image/png'}],shortcut:'/favicon.ico?v=2'},appleWebApp:{capable:true,title:'La Princesa'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#171010'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}<RegisterSW/></body></html>}
