import type { MetadataRoute } from 'next';
export default function manifest():MetadataRoute.Manifest{return {name:'La Princesa de las Cejas',short_name:'La Princesa',description:'Reservas y gestión del estudio',start_url:'/',display:'standalone',background_color:'#f6f3ed',theme_color:'#171010',icons:[{src:'/logo-diana-perez.jpg',sizes:'1280x1280',type:'image/jpeg',purpose:'any'}]};}
