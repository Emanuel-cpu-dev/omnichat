# OmniChat Enterprise

Plataforma SaaS multi-tenant de comunicación interna: chat por departamentos en tiempo real, archivos, videollamadas y pantalla compartida (WebRTC), con suscripción de **5 USD/mes por empresa** y **14 días de prueba**.

## Estructura

```
omnichat/
├── backend/
│   ├── server.js        # API REST + Socket.io + auth + facturación + señalización WebRTC
│   ├── db.js            # Esquema SQLite (todas las tablas llevan company_id)
│   ├── package.json
│   ├── .env.example
│   └── uploads/         # Archivos: uploads/<company_id>/<nombre-aleatorio>
└── frontend/
    ├── src/
    │   ├── App.jsx      # Landing, login/registro, cobro, chat y videollamadas
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── package.json · vite.config.js · tailwind.config.js · postcss.config.js
    └── .env.example
```

## Requisitos

- Node.js 18 o superior
- (Opcional) Un ID de cliente OAuth de Google para el acceso con Google

## Instalación local

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edita .env y define JWT_SECRET (mínimo 32 caracteres):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm install
npm run dev
```

La API queda en `http://localhost:4000`. La base de datos `omnichat.db` se crea sola al primer arranque.

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Abre `http://localhost:5173`.

### 3. Google OAuth (opcional)

1. En Google Cloud Console → Credenciales → *ID de cliente de OAuth* (tipo **Aplicación web**).
2. Añade `http://localhost:5173` en *Orígenes de JavaScript autorizados*.
3. Copia el ID en `GOOGLE_CLIENT_ID` (backend/.env) y `VITE_GOOGLE_CLIENT_ID` (frontend/.env).

## Cómo probarlo

| Qué | Cómo |
|---|---|
| Registrar empresa | "Probar 14 días gratis" → correo, teléfono o Google. Se crean los canales General, Ventas, Soporte y Gerencia (privado). |
| Login por teléfono | Usa formato internacional (`+5493511234567`). En desarrollo el código OTP aparece en pantalla y en la consola del backend. |
| Sumar empleados | El propietario ve su **código de invitación** en la barra lateral; los demás eligen "Unirme con código" al registrarse. |
| Aislamiento | Crea una segunda empresa en una ventana privada: no verá nada de la primera. |
| Fin de la prueba | Ejecuta `sqlite3 backend/omnichat.db "UPDATE companies SET trial_ends_at = 0"` (o espera 14 días). La app bloquea el acceso y pide tarjeta. |
| Pago simulado | `4242 4242 4242 4242` aprobada · `4000 0000 0000 0002` rechazada · `4000 0000 0000 9995` aprobada, pero falla en la renovación (pasa a `past_due`). Cualquier vencimiento futuro y CVC. |
| Videollamada | Abre el mismo canal en dos navegadores (usuarios distintos de la misma empresa) y pulsa **Videollamada**. Necesita `localhost` o HTTPS para usar la cámara. |
| Soporte remoto | Dentro de la llamada, **Compartir pantalla**. |

## Cómo se garantiza el aislamiento entre empresas

1. El JWT incluye `company_id` y se revalida contra la base de datos en cada petición y conexión de socket.
2. Ninguna consulta usa un `company_id` enviado por el cliente: siempre sale del usuario autenticado.
3. Las salas de Socket.io (`t:<empresa>:c:<canal>`) y de llamada (`call:<empresa>:<canal>`) incluyen la empresa; las señales WebRTC solo se retransmiten dentro de la misma sala.
4. Los archivos viven en `uploads/<company_id>/`, con nombre aleatorio, y la descarga exige pertenecer a esa empresa y ver ese canal.

## Seguridad incluida

- Contraseñas con bcrypt (coste 12); respuesta idéntica para correo inexistente o clave incorrecta.
- OTP de 6 dígitos guardado con HMAC, vence en 5 minutos, máximo 5 intentos, con límite de solicitudes por IP.
- Tokens de Google verificados en el servidor (`verifyIdToken`), solo con correo verificado.
- Helmet, CORS restringido a `CLIENT_URL`, límites de tasa en autenticación, validación con Zod, lista blanca de extensiones, límite de tamaño de archivo.
- La tarjeta nunca se guarda: solo marca y últimos 4 dígitos.

## Lo que falta para producción real

Este código es una base funcional y segura de arranque, no un producto terminado. Antes de lanzar:

1. **Pagos reales:** reemplaza el módulo `/api/billing/*` por **Stripe Billing** (Checkout o Elements, para que la tarjeta nunca toque tu servidor) y actualiza el estado de la empresa con los webhooks `invoice.paid`, `invoice.payment_failed` y `customer.subscription.deleted`. Revisa impuestos (IVA) y cobro en USD.
2. **Base de datos:** migra a PostgreSQL (mismo esquema; considera Row-Level Security por `company_id` como segunda barrera).
3. **SMS:** implementa `sendSms()` con Twilio, AWS SNS o Vonage.
4. **Escala horizontal:** añade el adaptador Redis de Socket.io y sesiones sticky en el balanceador.
5. **Archivos:** pasa a S3/GCS con URLs firmadas y antivirus (ClamAV) al subir.
6. **Videollamadas:** la malla P2P sirve hasta ~8 personas. Despliega un servidor **TURN** (coturn) para redes corporativas restrictivas y un **SFU** (LiveKit o mediasoup) para reuniones grandes.
7. **Soporte remoto tipo AnyDesk:** el navegador solo puede *compartir pantalla*; controlar el equipo remoto requiere un agente nativo instalado (por ejemplo, con RustDesk como base).
8. **Sesiones:** cambia el token de `localStorage` a cookie `httpOnly` + `SameSite`, y añade refresh tokens y revocación.
9. **Operación:** HTTPS, CI/CD, logs y métricas, copias de seguridad, pruebas automatizadas, y cumplimiento (RGPD/LGPD y la ley argentina 25.326 de protección de datos personales).
10. **Funciones habituales:** hilos, menciones, edición y borrado de mensajes, mensajes directos, notificaciones push, búsqueda, roles y auditoría.
