# Citas · La Princesa de las Cejas

Primera versión funcional para una profesional y una sede en Boston.

## Desarrollo local

Requiere Node.js 22 o posterior.

```sh
npm ci
npm run dev
```

Abrir http://localhost:3000 y http://localhost:3000/admin. En desarrollo, si ADMIN_PASSWORD está vacío, el panel permite acceso local sin contraseña. El servidor de desarrollo se enlaza únicamente a 127.0.0.1. No exponer el servidor de desarrollo a internet.

Los datos se guardan en `.data/postgres` usando PGlite (PostgreSQL embebido). No son datos de ejemplo: los servicios y reservas creados persisten al reiniciar. El catálogo inicia vacío; configure servicios, dirección y horario antes de recibir clientes. El horario predeterminado es lunes a sábado, 09:00–18:00, y debe revisarse.

## Incluido

- Web adaptable con selector de idioma de interfaz ES/EN y flujo de reserva.
- PWA con manifest, icono SVG y respuesta sin conexión; requiere conexión para operaciones. La instalación depende del navegador y debe validarse en los dispositivos finales.
- Agenda diaria con navegación semanal, estados confirmada/completada/cancelada y bloqueos de tiempo.
- Crear y editar servicios: nombre, descripción, precio en centavos USD, duración, margen y publicación.
- Editor de nombre, bienvenida, dirección y teléfono público.
- Horario y días de atención, zona America/New_York y horario de verano.
- Base de datos impide reservas superpuestas incluso con peticiones concurrentes.
- Precio y nombre del servicio se conservan en la reserva aunque el catálogo cambie.
- Autenticación administrativa con cookie HttpOnly, firma HMAC y caducidad de 12 horas cuando se configura contraseña.

## Despliegue

Copiar `.env.example` a `.env.local` y configurar DATABASE_URL, ADMIN_PASSWORD y SESSION_SECRET (secreto aleatorio de al menos 32 bytes). Usar un servidor Node persistente y PostgreSQL gestionado. Producción rechaza la base embebida y no habilita acceso sin contraseña. La conexión TLS de PostgreSQL se configura en DATABASE_URL según el proveedor. PGlite local y PostgreSQL de producción son bases separadas: los datos locales no se transfieren automáticamente.

```sh
npm test
npm run typecheck
npm run build
npm start
```

El esquema se inicializa automáticamente en la primera consulta. Para evolución de producción, convertir el esquema inicial en migraciones versionadas y añadir una estrategia de copias/restauración. Utilizar HTTPS y protección de tráfico en el proxy; el límite en memoria de esta versión es global y no sustituye un limitador distribuido. La comprobación de Origin requiere que el proxy preserve el origen público de la aplicación.

## Pendiente, no simulado

WhatsApp no envía ni recibe mensajes: falta número y configuración de Meta Business, webhook firmado, almacenamiento de eventos idempotentes y trabajador con reintentos/plantillas. No hay cobros, anticipos, subida de fotografías, reprogramación directa, historial de auditoría ni CRM independiente. Para cambiar una cita en esta versión se cancela y se vuelve a reservar. No se ha conectado ni modificado el dominio del negocio. El contenido editable tiene una versión textual; ES/EN traduce la interfaz, no el texto escrito por la administradora. Antes de lanzamiento, agregar política de privacidad y condiciones del negocio, migraciones, copias verificadas, monitoreo, accesibilidad del foco en diálogos y validación móvil/PWA.

## Organización

- `app/public-site.tsx`: web y reservas.
- `app/admin`: gestión y acceso del equipo.
- `app/api/data/route.ts`: API con autorización y validación.
- `lib/booking.ts`: disponibilidad y reservas.
- `lib/db.ts`: esquema y adaptadores de PostgreSQL.
- `lib/time.ts`: zona horaria y cálculo de horarios.
- `tests/booking.test.ts`: concurrencia, margen, cancelación y horario.
