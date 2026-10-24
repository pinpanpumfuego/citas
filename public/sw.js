self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// No personal information or reservation responses are cached.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<html lang="es"><meta name="viewport" content="width=device-width"><title>Sin conexión</title><body style="font-family:system-ui;padding:40px;background:#f6f3ed;color:#283e35"><h1>Conecta para continuar</h1><p>Necesitas conexión para consultar la agenda y confirmar reservas.</p><button onclick="location.reload()">Reintentar</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));});
