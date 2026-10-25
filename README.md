# Citas · La Princesa de las Cejas

Primera versión funcional para una profesional y una sede en Medellín.

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
- Crear y editar servicios: nombre, descripción, precio en centavos COP, duración, margen y publicación.
- Editor de nombre, bienvenida, dirección y teléfono público.
- Horario y días de atención, zona America/Bogota (UTC−5 todo el año).
- Base de datos impide reservas superpuestas incluso con peticiones concurrentes.
- Precio y nombre del servicio se conservan en la reserva aunque el catálogo cambie.
- Autenticación administrativa con cookie HttpOnly, firma HMAC y caducidad de 12 horas cuando se configura contraseña.

## Producción en Hostinger

Publicado el 25 de octubre de 2026 (UTC) en https://www.laprincesadelascejas.com. Administración: `/admin`.

El VPS existente aloja `/opt/citas`: Docker Compose ejecuta Next.js en `127.0.0.1:3107` y PostgreSQL 17 en una red privada sin puerto público. Nginx sirve el dominio y redirige HTTP a HTTPS. Certbot renueva el certificado mediante el temporizador existente y un hook recarga Nginx.

Las claves están únicamente en `/opt/citas/.env`, con permisos restringidos. No incluirlas en Git. `deploy/backup.sh` genera una copia diaria comprimida en `/var/backups/citas` y conserva treinta días; son copias dentro del mismo VPS, no externas. La tarea está en `/etc/cron.d/citas-backup`. Los valores DNS anteriores están en `deploy/dns-before.json`.

Antes de aceptar reservas, entrar al panel y configurar servicios, precios, duración, dirección y horario real. El catálogo de producción inicia vacío. WhatsApp tiene un enlace de contacto; la automatización con Meta sigue pendiente.

## Despliegue alternativo

Copiar `.env.example` a `.env.local` y configurar DATABASE_URL, ADMIN_PASSWORD y SESSION_SECRET (secreto aleatorio de al menos 32 bytes). Usar un servidor Node persistente y PostgreSQL gestionado. Producción rechaza la base embebida y no habilita acceso sin contraseña. La conexión TLS de PostgreSQL se configura en DATABASE_URL según el proveedor. PGlite local y PostgreSQL de producción son bases separadas: los datos locales no se transfieren automáticamente.

```sh
npm test
npm run typecheck
npm run build
npm start
```

El esquema se inicializa automáticamente en la primera consulta. Para evolución de producción, convertir el esquema inicial en migraciones versionadas y añadir una estrategia de copias/restauración. Utilizar HTTPS y protección de tráfico en el proxy; el límite en memoria de esta versión es global y no sustituye un limitador distribuido. La comprobación de Origin requiere que el proxy preserve el origen público de la aplicación.

## Pendiente, no simulado

WhatsApp no envía ni recibe mensajes: falta configuración de Meta Business, webhook firmado, almacenamiento de eventos idempotentes y trabajador con reintentos/plantillas. No hay cobros, anticipos, subida de fotografías, reprogramación directa, historial de auditoría ni CRM independiente. Para cambiar una cita en esta versión se cancela y se vuelve a reservar. El contenido editable tiene una versión textual; ES/EN traduce la interfaz, no el texto escrito por la administradora. Quedan pendientes política de privacidad y condiciones del negocio, migraciones versionadas, copias externas, monitoreo, accesibilidad del foco en diálogos y validación de instalación en dispositivos reales.

## Organización

- `app/public-site.tsx`: web y reservas.
- `app/admin`: gestión y acceso del equipo.
- `app/api/data/route.ts`: API con autorización y validación.
- `lib/booking.ts`: disponibilidad y reservas.
- `lib/db.ts`: esquema y adaptadores de PostgreSQL.
- `lib/time.ts`: zona horaria y cálculo de horarios.
- `tests/booking.test.ts`: concurrencia, margen, cancelación y horario.

La sede es Medellín, Colombia. El número público inicial es +57 3217168203 y se puede editar en Página web. La web abre WhatsApp mediante un enlace; no envía mensajes automáticamente. Los precios nuevos se ingresan en COP. El material gráfico no define precios ni duraciones reservables.

## Avisos de nuevas citas

Administración → Avisos permite cambiar los destinos, conectar los proveedores, activar cada canal y enviar pruebas. Correo: SMTP SSL puerto 465 de Hostinger o Gmail con contraseña de aplicación. WhatsApp: Cloud API v23.0, token de sistema con permisos de mensajería, ID del número emisor y plantilla aprobada con tres parámetros de cuerpo (servicio, fecha, enlace). Los destinos son independientes del contacto público. No se envían mensajes automáticos a clientes.

Push se activa en cada dispositivo. En iOS/iPadOS 16.4 o posterior se instala desde Safari en la pantalla de inicio antes de solicitar permiso. Las claves VAPID se generan una sola vez y se guardan en PostgreSQL. Las credenciales SMTP, el token de Meta y la clave privada VAPID se cifran con AES-256-GCM usando una clave derivada de SESSION_SECRET: conservar este secreto junto con el respaldo; cambiarlo requiere migrar/reconfigurar las credenciales y suscripciones.

Un trigger crea la cola en la misma transacción de la reserva. El servicio Docker `notifications` procesa hasta tres trabajos cada 15 segundos con autenticación interna; no publica puertos adicionales. Reintenta fallos temporales hasta cinco veces y recupera trabajos interrumpidos tras cinco minutos. Un corte después de la aceptación del proveedor puede generar un duplicado. `sent` significa aceptado por el proveedor, no entregado o leído. Las citas canceladas, destinos cambiados y canales desactivados se omiten antes de enviar. Los dispositivos caducados se retiran al recibir HTTP 404/410. No activar canales sin credenciales reales ni interpretar una prueba en cola como entrega confirmada.

Validación: `npm test`, `npm run build`. Las pruebas usan una base aislada y proveedores simulados, sin enviar mensajes reales.

## Apertura por períodos

Todas las fechas sin entrada explícita en `schedule.dates` quedan cerradas. `scheduleFor` ignora los antiguos horarios semanales, incluso en bases existentes; las fechas que ya se abrieron expresamente y las reservas/bloqueos se conservan. El endpoint `weekly_schedule` se rechaza para impedir que una pestaña antigua reabra semanas indefinidas.

Horarios → Abrir un período permite elegir inicio/fin inclusivos (hasta un año), días de la semana y una o varias franjas. La vista simplificada abre las fechas nuevas con el botón Abrir horario. Si encuentra días configurados, pregunta si conservarlos o actualizarlos. Por defecto conserva cualquier fecha con configuración previa (incluidos cierres). La opción de sustituir afecta únicamente a los días seleccionados, sin borrar citas ni bloqueos. Los días no seleccionados conservan su estado. La agenda permite editar/cerrar una fecha concreta. El horizonte público de reserva sigue siendo 90 días.

## Iconos

Arte vectorial en `public/icon.svg` y `public/favicon.svg`: corona dorada, fondo negro/burdeos y monograma LP. `node scripts/generate-icons.mjs` genera PNG 192/512, variantes maskable con contenido dentro de la zona segura central, Apple Touch 180, favicon PNG 16/32, ICO con tamaños 16/32/48/256 y badge de notificaciones. Las rutas se declaran en layout, manifest y service worker. El logo completo del negocio se conserva en la página.
