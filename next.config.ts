import type {NextConfig} from 'next';
const config:NextConfig={serverExternalPackages:['@electric-sql/pglite','pg'],async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'}]},{source:'/api/(.*)',headers:[{key:'Cache-Control',value:'no-store'}]}];}};
export default config;
