/* =============================================================================
 * OmniChat Enterprise — server.js
 * Express + Socket.io + JWT + multi-tenant + suscripción 5 USD/mes (simulada)
 *
 * Aislamiento multi-tenant:
 *   1. El JWT lleva company_id (cid) y se revalida contra la BD en cada request.
 *   2. TODA consulta filtra por company_id sacado del usuario autenticado,
 *      jamás de parámetros del cliente.
 *   3. Las salas de Socket.io y de llamada incluyen el company_id.
 *   4. Los archivos se guardan en uploads/<company_id>/ y se sirven solo tras
 *      verificar que pertenecen a la empresa del solicitante.
 * ========================================================================== */
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Server } = require('socket.io');
const { OAuth2Client } = require('google-auth-library');
const { z, ZodError } = require('zod');
const db = require('./db');

// ---------- Configuración ----------
const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET;
const IS_PROD = process.env.NODE_ENV === 'production';
const PLAN_PRICE_CENTS = Number(process.env.PLAN_PRICE_CENTS || 500);
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;
const PERIOD_MS = 30 * DAY;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: define JWT_SECRET (>=32 caracteres) en backend/.env');
  process.exit(1);
}
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;
const UPLOAD_ROOT = path.join(__dirname, 'uploads');

// ---------- Utilidades ----------
const httpErr = (status, message, code) => Object.assign(new Error(message), { status, code });
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const uid = () => crypto.randomUUID();
const hmac = (v) => crypto.createHmac('sha256', JWT_SECRET).update(v).digest('hex');

const signToken = (user) =>
  jwt.sign({ sub: user.id, cid: user.company_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

function accessState(c) {
  const t = Date.now();
  if (c.status === 'trial' && c.trial_ends_at > t) return { ok: true, reason: 'trial' };
  if ((c.status === 'active' || c.status === 'canceled') && c.current_period_end > t)
    return { ok: true, reason: c.status };
  return { ok: false, reason: 'expired' };
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });
const publicCompany = (c, user) => ({
  id: c.id,
  name: c.name,
  status: c.status,
  trialEndsAt: c.trial_ends_at,
  currentPeriodEnd: c.current_period_end,
  cardBrand: c.card_brand,
  cardLast4: c.card_last4,
  priceCents: PLAN_PRICE_CENTS,
  access: accessState(c),
  inviteCode: user.role !== 'member' ? c.invite_code : undefined,
});

const getCompany = (id) => db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
const canSeeChannel = (user, ch) =>
  !!ch && ch.company_id === user.company_id && (!ch.is_private || user.role !== 'member');
const getChannelFor = (user, channelId) => {
  const ch = db.prepare('SELECT * FROM channels WHERE id = ? AND company_id = ?').get(channelId, user.company_id);
  return canSeeChannel(user, ch) ? ch : null;
};

// ---------- Alta de cuentas / empresas ----------
function createAccount({ name, email, phone, passwordHash, googleSub, companyName, inviteCode }) {
  try {
    return db.transaction(() => {
      let company, role;
      if (inviteCode) {
        company = db.prepare('SELECT * FROM companies WHERE invite_code = ?').get(inviteCode.trim().toUpperCase());
        if (!company) throw httpErr(404, 'Código de invitación inválido');
        role = 'member';
      } else if (companyName) {
        const now = Date.now();
        company = {
          id: uid(),
          name: companyName.trim(),
          invite_code: crypto.randomBytes(5).toString('hex').toUpperCase(),
          status: 'trial',
          trial_ends_at: now + TRIAL_DAYS * DAY, // prueba gratuita de 14 días
          created_at: now,
        };
        db.prepare(
          `INSERT INTO companies (id,name,invite_code,status,trial_ends_at,created_at)
           VALUES (@id,@name,@invite_code,@status,@trial_ends_at,@created_at)`
        ).run(company);
        const seed = db.prepare(
          'INSERT INTO channels (id,company_id,name,department,is_private,created_at) VALUES (?,?,?,?,?,?)'
        );
        [
          ['general', 'General', 0],
          ['ventas', 'Ventas', 0],
          ['soporte', 'Soporte', 0],
          ['gerencia', 'Gerencia', 1],
        ].forEach(([n, d, p]) => seed.run(uid(), company.id, n, d, p, now));
        role = 'owner';
      } else {
        throw httpErr(400, 'Indica el nombre de tu empresa o un código de invitación', 'NEEDS_SETUP');
      }
      const user = {
        id: uid(), company_id: company.id, name: name.trim(), email: email || null, phone: phone || null,
        password_hash: passwordHash || null, google_sub: googleSub || null, role, created_at: Date.now(),
      };
      db.prepare(
        `INSERT INTO users (id,company_id,name,email,phone,password_hash,google_sub,role,created_at)
         VALUES (@id,@company_id,@name,@email,@phone,@password_hash,@google_sub,@role,@created_at)`
      ).run(user);
      return user;
    })();
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw httpErr(409, 'Ese correo o teléfono ya está registrado');
    throw e;
  }
}

const authResponse = (user) => ({
  token: signToken(user),
  user: publicUser(user),
  company: publicCompany(getCompany(user.company_id), user),
});

// ---------- App ----------
const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '100kb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

// ---------- Middleware de auth / suscripción ----------
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND company_id = ?').get(p.sub, p.cid);
    if (!user) throw new Error('usuario inexistente');
    req.user = user;
    req.company = getCompany(user.company_id);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}
function requireActive(req, res, next) {
  if (!accessState(req.company).ok)
    return res.status(402).json({
      error: 'Tu prueba gratuita terminó. Activa la suscripción para continuar.',
      code: 'SUBSCRIPTION_REQUIRED',
    });
  next();
}
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Permisos insuficientes' });

// ---------- Autenticación ----------
const pwSchema = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100);
const setupFields = { companyName: z.string().min(2).max(80).optional(), inviteCode: z.string().max(20).optional() };

app.post('/api/auth/register', authLimiter, ah(async (req, res) => {
  const b = z.object({
    name: z.string().min(2).max(80), email: z.string().email().toLowerCase(), password: pwSchema, ...setupFields,
  }).parse(req.body);
  const user = createAccount({ ...b, passwordHash: await bcrypt.hash(b.password, 12) });
  res.status(201).json(authResponse(user));
}));

app.post('/api/auth/login', authLimiter, ah(async (req, res) => {
  const b = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1).max(100) }).parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(b.email);
  // bcrypt.compare siempre se ejecuta para no filtrar si el correo existe (timing)
  const ok = await bcrypt.compare(b.password, user?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
  if (!user || !ok) throw httpErr(401, 'Correo o contraseña incorrectos');
  res.json(authResponse(user));
}));

app.post('/api/auth/google', authLimiter, ah(async (req, res) => {
  if (!googleClient) throw httpErr(503, 'Google OAuth no está configurado (GOOGLE_CLIENT_ID)');
  const b = z.object({ idToken: z.string().min(10), ...setupFields }).parse(req.body);
  const ticket = await googleClient.verifyIdToken({ idToken: b.idToken, audience: process.env.GOOGLE_CLIENT_ID });
  const g = ticket.getPayload();
  if (!g?.email || !g.email_verified) throw httpErr(401, 'Tu cuenta de Google no tiene un correo verificado');
  let user = db.prepare('SELECT * FROM users WHERE google_sub = ? OR email = ?').get(g.sub, g.email.toLowerCase());
  if (user && !user.google_sub) {
    db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(g.sub, user.id);
    user.google_sub = g.sub;
  }
  if (!user) {
    if (!b.companyName && !b.inviteCode)
      throw httpErr(404, 'Cuenta nueva: indica tu empresa o un código de invitación', 'NEEDS_SETUP');
    user = createAccount({
      name: g.name || g.email, email: g.email.toLowerCase(), googleSub: g.sub,
      companyName: b.companyName, inviteCode: b.inviteCode,
    });
  }
  res.json(authResponse(user));
}));

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Usa formato internacional, ej. +5493511234567');

async function sendSms(phone, text) {
  // Integra aquí Twilio / AWS SNS / Vonage. Ej. Twilio: client.messages.create({to: phone, from, body: text})
  if (!IS_PROD) console.log(`[SMS simulado] ${phone}: ${text}`);
}

app.post('/api/auth/phone/request', otpLimiter, ah(async (req, res) => {
  const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare(
    `INSERT INTO otps (phone, code_hash, expires_at, attempts) VALUES (?,?,?,0)
     ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0`
  ).run(phone, hmac(`${phone}:${code}`), Date.now() + 5 * 60 * 1000);
  await sendSms(phone, `Tu código de OmniChat es ${code}. Vence en 5 minutos.`);
  res.json({ sent: true, ...(IS_PROD ? {} : { devCode: code }) }); // devCode SOLO en desarrollo
}));

app.post('/api/auth/phone/verify', authLimiter, ah(async (req, res) => {
  const b = z.object({
    phone: phoneSchema, code: z.string().regex(/^\d{6}$/), name: z.string().min(2).max(80).optional(), ...setupFields,
  }).parse(req.body);
  const row = db.prepare('SELECT * FROM otps WHERE phone = ?').get(b.phone);
  if (!row || row.expires_at < Date.now() || row.attempts >= 5) throw httpErr(401, 'Código vencido. Solicita uno nuevo.');
  const good = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hmac(`${b.phone}:${b.code}`)));
  if (!good) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(b.phone);
    throw httpErr(401, 'Código incorrecto');
  }
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(b.phone);
  if (!user) {
    if (!b.name || (!b.companyName && !b.inviteCode))
      throw httpErr(404, 'Cuenta nueva: completa tu nombre y empresa', 'NEEDS_SETUP');
    user = createAccount({ name: b.name, phone: b.phone, companyName: b.companyName, inviteCode: b.inviteCode });
  }
  db.prepare('DELETE FROM otps WHERE phone = ?').run(b.phone);
  res.json(authResponse(user));
}));

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user), company: publicCompany(req.company, req.user) }));

// Obtener miembros de la empresa
app.get('/api/company/members', auth, requireActive, (req, res) => {
  const members = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE company_id = ?').all(req.user.company_id);
  res.json(members);
});

// ---------- Facturación (pasarela simulada tipo Stripe) ----------
// IMPORTANTE: el número de tarjeta NUNCA se guarda; solo marca y últimos 4 dígitos.
// En producción reemplaza esto por Stripe Checkout / Elements (la tarjeta va directo a Stripe, no a tu servidor)
// y escucha los webhooks invoice.paid / invoice.payment_failed para actualizar el estado.
const luhn = (n) => {
  let s = 0, alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = +n[i];
    if (alt && (d *= 2) > 9) d -= 9;
    s += d; alt = !alt;
  }
  return s % 10 === 0;
};
const brandOf = (n) => (/^4/.test(n) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(n) ? 'Mastercard' : /^3[47]/.test(n) ? 'Amex' : 'Tarjeta');

app.get('/api/billing/status', auth, (req, res) => {
  const payments = db.prepare(
    'SELECT id, amount_cents, currency, status, created_at FROM payments WHERE company_id = ? ORDER BY created_at DESC LIMIT 12'
  ).all(req.user.company_id);
  res.json({ company: publicCompany(req.company, req.user), payments });
});

app.post('/api/billing/subscribe', auth, requireRole('owner'), ah(async (req, res) => {
  const b = z.object({
    holder: z.string().min(2).max(80),
    cardNumber: z.string().transform((s) => s.replace(/\s|-/g, '')).pipe(z.string().regex(/^\d{13,19}$/)),
    exp: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/),
    cvc: z.string().regex(/^\d{3,4}$/),
  }).parse(req.body);

  const [mm, yy] = b.exp.split('/').map(Number);
  if (new Date(2000 + yy, mm, 0, 23, 59, 59) < new Date()) throw httpErr(400, 'La tarjeta está vencida');
  const record = (status) =>
    db.prepare('INSERT INTO payments (id,company_id,amount_cents,currency,status,created_at) VALUES (?,?,?,?,?,?)')
      .run(uid(), req.user.company_id, PLAN_PRICE_CENTS, 'usd', status, Date.now());

  // Tarjetas de prueba: 4242 4242 4242 4242 (ok) · 4000 0000 0000 0002 (rechazada) · 4000 0000 0000 9995 (falla en la renovación)
  if (!luhn(b.cardNumber) || b.cardNumber === '4000000000000002') {
    record('failed');
    throw httpErr(402, 'La tarjeta fue rechazada. Prueba con otra.');
  }
  const now = Date.now();
  const base = req.company.current_period_end > now ? req.company.current_period_end : now;
  db.prepare(
    `UPDATE companies SET status='active', current_period_end=?, card_brand=?, card_last4=? WHERE id=?`
  ).run(base + PERIOD_MS, brandOf(b.cardNumber), b.cardNumber.slice(-4), req.user.company_id);
  record('succeeded');
  res.json({ company: publicCompany(getCompany(req.user.company_id), req.user) });
}));

app.post('/api/billing/cancel', auth, requireRole('owner'), (req, res) => {
  db.prepare(`UPDATE companies SET status='canceled' WHERE id=? AND status='active'`).run(req.user.company_id);
  res.json({ company: publicCompany(getCompany(req.user.company_id), req.user) });
});

// Renovación mensual recurrente (en producción: la hace Stripe Billing).
function runRenewals() {
  const due = db.prepare(`SELECT * FROM companies WHERE status='active' AND current_period_end <= ?`).all(Date.now());
  for (const c of due) {
    const fails = c.card_last4 === '9995';
    db.prepare('INSERT INTO payments (id,company_id,amount_cents,currency,status,created_at) VALUES (?,?,?,?,?,?)')
      .run(uid(), c.id, PLAN_PRICE_CENTS, 'usd', fails ? 'failed' : 'succeeded', Date.now());
    if (fails) db.prepare(`UPDATE companies SET status='past_due' WHERE id=?`).run(c.id);
    else db.prepare('UPDATE companies SET current_period_end=? WHERE id=?').run(c.current_period_end + PERIOD_MS, c.id);
  }
}
setInterval(runRenewals, 60 * 60 * 1000).unref();
runRenewals();

// ---------- Canales y mensajes ----------
app.get('/api/channels', auth, requireActive, (req, res) => {
  const rows = db.prepare('SELECT id,name,department,is_private FROM channels WHERE company_id = ? ORDER BY department, name')
    .all(req.user.company_id);
  res.json(rows.filter((c) => !c.is_private || req.user.role !== 'member'));
});

app.post('/api/channels', auth, requireActive, requireRole('owner', 'admin'), ah(async (req, res) => {
  const b = z.object({
    name: z.string().min(2).max(40).transform((s) => s.toLowerCase().replace(/[^a-z0-9áéíóúñ-]+/g, '-')),
    department: z.string().min(2).max(40), isPrivate: z.boolean().optional(),
  }).parse(req.body);
  try {
    const ch = { id: uid(), name: b.name, department: b.department.trim(), is_private: b.isPrivate ? 1 : 0 };
    db.prepare('INSERT INTO channels (id,company_id,name,department,is_private,created_by,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(ch.id, req.user.company_id, ch.name, ch.department, ch.is_private, req.user.id, Date.now());
    io.to(`t:${req.user.company_id}`).emit('channel:created', ch);
    res.status(201).json(ch);
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw httpErr(409, 'Ya existe un canal con ese nombre');
    throw e;
  }
}));

const MSG_SQL = `SELECT m.id, m.channel_id, m.body, m.created_at, m.user_id, u.name AS user_name,
  f.id AS file_id, f.original_name, f.size, f.mime
  FROM messages m JOIN users u ON u.id = m.user_id LEFT JOIN files f ON f.id = m.file_id`;
const toMsg = (r) => ({
  id: r.id, channelId: r.channel_id, body: r.body, createdAt: r.created_at, userId: r.user_id, userName: r.user_name,
  file: r.file_id ? { id: r.file_id, name: r.original_name, size: r.size, mime: r.mime } : null,
});

function saveMessage({ companyId, channelId, userId, body, fileId = null }) {
  const id = uid();
  db.prepare('INSERT INTO messages (id,company_id,channel_id,user_id,body,file_id,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, companyId, channelId, userId, body, fileId, Date.now());
  return toMsg(db.prepare(`${MSG_SQL} WHERE m.id = ? AND m.company_id = ?`).get(id, companyId));
}

app.get('/api/channels/:id/messages', auth, requireActive, (req, res) => {
  if (!getChannelFor(req.user, req.params.id)) return res.status(404).json({ error: 'Canal no encontrado' });
  const before = Number(req.query.before) || Date.now() + 1;
  const rows = db.prepare(`${MSG_SQL} WHERE m.company_id = ? AND m.channel_id = ? AND m.created_at < ?
    ORDER BY m.created_at DESC LIMIT 50`).all(req.user.company_id, req.params.id, before);
  res.json(rows.reverse().map(toMsg));
});

// ---------- Archivos ----------
const ALLOWED_EXT = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.rtf', '.odt', '.ods',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip', '.rar', '.7z', '.tar', '.gz',
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, req.user.company_id); // carpeta por empresa
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: MAX_UPLOAD, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(httpErr(415, 'Tipo de archivo no permitido')),
});

app.post('/api/channels/:id/files', auth, requireActive,
  (req, res, next) => (getChannelFor(req.user, req.params.id) ? next() : res.status(404).json({ error: 'Canal no encontrado' })),
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw httpErr(400, 'Falta el archivo');
    const fileId = uid();
    const original = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
    db.prepare('INSERT INTO files (id,company_id,channel_id,user_id,original_name,stored_name,mime,size,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(fileId, req.user.company_id, req.params.id, req.user.id, original, req.file.filename, req.file.mimetype, req.file.size, Date.now());
    const msg = saveMessage({
      companyId: req.user.company_id, channelId: req.params.id, userId: req.user.id,
      body: String(req.body?.body || '').slice(0, 4000), fileId,
    });
    io.to(`t:${req.user.company_id}:c:${req.params.id}`).emit('message:new', msg);
    res.status(201).json(msg);
  }));

app.get('/api/files/:id/download', auth, requireActive, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id = ? AND company_id = ?').get(req.params.id, req.user.company_id);
  if (!f || !getChannelFor(req.user, f.channel_id)) return res.status(404).json({ error: 'Archivo no encontrado' });
  const full = path.join(UPLOAD_ROOT, f.company_id, path.basename(f.stored_name));
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Archivo no disponible' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(full, f.original_name);
});

// ---------- Socket.io: chat en tiempo real + señalización WebRTC ----------
const io = new Server(server, { cors: { origin: CLIENT_URL }, maxHttpBufferSize: 1e5 });

io.use((socket, next) => {
  try {
    const p = jwt.verify(socket.handshake.auth?.token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND company_id = ?').get(p.sub, p.cid);
    if (!user) throw new Error();
    socket.data.user = user;
    socket.join(`t:${user.company_id}`); // sala de toda la empresa
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  const active = () => accessState(getCompany(user.company_id)).ok;
  const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

  socket.on('channel:join', (channelId, ack) => {
    if (!active()) return reply(ack, { error: 'SUBSCRIPTION_REQUIRED' });
    if (!getChannelFor(user, channelId)) return reply(ack, { error: 'Canal no encontrado' });
    socket.join(`t:${user.company_id}:c:${channelId}`);
    reply(ack, { ok: true });
  });

  socket.on('message:send', (data, ack) => {
    const parsed = z.object({ channelId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).safeParse(data);
    if (!parsed.success) return reply(ack, { error: 'Mensaje inválido' });
    if (!active()) return reply(ack, { error: 'SUBSCRIPTION_REQUIRED' });
    if (!getChannelFor(user, parsed.data.channelId)) return reply(ack, { error: 'Canal no encontrado' });
    const msg = saveMessage({ companyId: user.company_id, channelId: parsed.data.channelId, userId: user.id, body: parsed.data.body });
    io.to(`t:${user.company_id}:c:${msg.channelId}`).emit('message:new', msg);
    reply(ack, { ok: true });
  });

  socket.on('typing', (channelId) => {
    if (typeof channelId === 'string' && socket.rooms.has(`t:${user.company_id}:c:${channelId}`))
      socket.to(`t:${user.company_id}:c:${channelId}`).emit('typing', { channelId, userName: user.name });
  });

  // ----- Videollamadas / soporte remoto (malla P2P WebRTC; el servidor solo retransmite señales) -----
  const leaveCall = () => {
    const room = socket.data.callRoom;
    if (!room) return;
    socket.leave(room);
    socket.to(room).emit('call:peer-left', socket.id);
    socket.data.callRoom = null;
  };

  socket.on('call:join', ({ channelId } = {}, ack) => {
    if (!active()) return reply(ack, { error: 'SUBSCRIPTION_REQUIRED' });
    if (!getChannelFor(user, channelId)) return reply(ack, { error: 'Canal no encontrado' });
    leaveCall();
    const room = `call:${user.company_id}:${channelId}`;
    const peers = [...(io.sockets.adapter.rooms.get(room) || [])].map((id) => ({
      id, name: io.sockets.sockets.get(id)?.data.user.name || 'Participante',
    }));
    if (peers.length >= 8) return reply(ack, { error: 'La sala está llena (máx. 8 participantes en malla P2P)' });
    socket.join(room);
    socket.data.callRoom = room;
    if (!peers.length) socket.to(`t:${user.company_id}:c:${channelId}`).emit('call:started', { channelId, by: user.name });
    reply(ack, { peers });
  });

  socket.on('call:signal', ({ to, data } = {}) => {
    const target = io.sockets.sockets.get(to);
    if (!socket.data.callRoom || !target || target.data.callRoom !== socket.data.callRoom) return; // misma sala = misma empresa
    target.emit('call:signal', { from: socket.id, name: user.name, data });
  });

  socket.on('call:leave', leaveCall);
  socket.on('disconnect', leaveCall);
});

// ---------- Errores ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Datos inválidos', code: 'VALIDATION' });
  if (err instanceof multer.MulterError)
    return res.status(413).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el límite permitido' : err.message });
  if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

server.listen(PORT, () => console.log(`OmniChat API escuchando en http://localhost:${PORT}`));
