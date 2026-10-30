// 星象仪网页版（Stellarium Web 国内镜像）静态服务 + 通行密钥后端
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const wa = require('./webauthn');

const ROOT = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const BROKER_FILE = path.join(DATA_DIR, 'broker.json');
const KEY_FILE = path.join(DATA_DIR, 'broker.key');
const PORT = process.env.PORT || 3000;
const HOST = process.env.BIND_IP || '0.0.0.0';
const APP_NAME = '星象仪网页版';
// 仅本机自测用：允许未登录状态下完成一次通行密钥绑定（生产环境不要打开）
const ALLOW_ANON_PASSKEY = process.env.ALLOW_ANON_PASSKEY === '1';
// 公钥（可公开），仅用于向云认证后端校验访问令牌
const PUBLISHABLE_KEY = process.env.WB_PUBLISHABLE_KEY ||
  'wbpk_9t6FrPA3X0La8ej8Er0qOS_JbUC6UgrcfVY1TbJJnI8wfeSqynu0OQW';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.eph': 'application/octet-stream',
  '.dat': 'application/octet-stream',
  '.gz': 'application/gzip',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.utf8': 'text/plain; charset=utf-8',
  '': 'text/plain; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.js', '.css', '.json', '.svg', '.html', '.txt', '.md', '.utf8', '.eph']);
const gzCache = new Map();

/* ------------------------------------------------------ 通行密钥凭据存储 */
fs.mkdirSync(DATA_DIR, { recursive: true });

let brokerKey = null;
function getBrokerKey() {
  if (brokerKey) return brokerKey;
  try {
    brokerKey = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
    if (brokerKey.length !== 32) throw new Error('bad key');
  } catch (e) {
    brokerKey = crypto.randomBytes(32);
    try { fs.writeFileSync(KEY_FILE, brokerKey.toString('hex'), { mode: 0o600 }); } catch (e2) { /* 只读文件系统：进程内密钥 */ }
  }
  return brokerKey;
}

function readBroker() {
  try {
    const d = JSON.parse(fs.readFileSync(BROKER_FILE, 'utf8'));
    if (d && Array.isArray(d.records)) return d;
  } catch (e) { /* 首次运行 */ }
  return { records: [] };
}

function writeBroker(db) {
  try {
    fs.writeFileSync(BROKER_FILE, JSON.stringify(db, null, 1));
  } catch (e) { /* 只读文件系统：本次进程内仍可用 */ }
}

function sealSession(obj) {
  const key = getBrokerKey();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), 'utf8')), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function openSession(sealed) {
  const key = getBrokerKey();
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  d.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const out = Buffer.concat([d.update(Buffer.from(sealed.data, 'base64')), d.final()]);
  return JSON.parse(out.toString('utf8'));
}

/* -------------------------------------------------------------- 挑战缓存 */
const challenges = new Map();      // id -> {challenge, mode, ownerId, exp}
const CHALLENGE_TTL = 5 * 60 * 1000;

function newChallenge(mode, ownerId) {
  const id = crypto.randomBytes(16).toString('hex');
  const challenge = wa.bufToB64u(crypto.randomBytes(32));
  challenges.set(id, { challenge, mode, ownerId: ownerId || null, exp: Date.now() + CHALLENGE_TTL });
  if (challenges.size > 5000) {
    for (const [k, v] of challenges) if (v.exp < Date.now()) challenges.delete(k);
  }
  return { id, challenge };
}

function takeChallenge(id, mode) {
  const c = challenges.get(id);
  if (!c) return null;
  challenges.delete(id);
  if (c.mode !== mode || c.exp < Date.now()) return null;
  return c;
}

/* --------------------------------------------------------- 请求辅助工具 */
function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 128 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

function siteOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || (/(localhost|127\.0\.0\.1)/.test(host) ? 'http' : 'https');
  return proto + '://' + host;
}

function rpIdOf(req) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return host.split(':')[0];
}

/** 用云认证后端校验访问令牌，拿到云端用户 id（失败返回 null） */
async function resolveUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const bases = [siteOrigin(req), 'http://127.0.0.1:' + PORT];
  for (const base of bases) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(base + '/.cloud/auth/v1/user/me', {
        headers: { Authorization: 'Bearer ' + token, 'x-wb-webapp-access-key': PUBLISHABLE_KEY },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) continue;
      const j = await r.json().catch(() => null);
      if (!j || typeof j !== 'object') continue;
      const id = j.sub || (j.user && (j.user.id || j.user.sub)) || j.id || '';
      if (id) return { id: String(id), email: j.email || (j.user && j.user.email) || '', phone: j.phone || (j.user && j.user.phone) || '' };
      return null;
    } catch (e) { /* 换下一个基址 */ }
  }
  return null;
}

/* ------------------------------------------------------------ 通行密钥 API */
async function handlePasskey(req, res, url) {
  const p = url.pathname;

  if (p === '/api/passkey/register/begin' && req.method === 'POST') {
    const user = await resolveUser(req);
    const body = await readBody(req);
    const { id, challenge } = newChallenge('register', user && user.id);
    const uid = (user && user.id) || ('anon:' + crypto.randomBytes(8).toString('hex'));
    return json(res, 200, {
      challengeId: id,
      challenge,
      verified: !!user,
      rp: { id: rpIdOf(req), name: APP_NAME },
      user: {
        id: wa.bufToB64u(Buffer.from(uid, 'utf8')),
        name: (body.account && (body.account.email || body.account.phone)) || uid,
        displayName: (body.account && (body.account.email || body.account.phone)) || '星象仪用户',
      },
    });
  }

  if (p === '/api/passkey/register/finish' && req.method === 'POST') {
    const body = await readBody(req);
    const ch = takeChallenge(body.challengeId, 'register');
    if (!ch) return json(res, 400, { error: '挑战已过期，请重试' });
    const user = await resolveUser(req);
    const ownerId = (user && user.id) || ch.ownerId || (ALLOW_ANON_PASSKEY ? 'anon-test' : null);
    if (!ownerId) return json(res, 401, { error: '登录状态已失效，请重新用验证码登录后再绑定通行密钥' });

    let info;
    try {
      info = wa.verifyRegistration({
        credential: body.credential,
        expectedChallenge: ch.challenge,
        rpId: rpIdOf(req),
        origin: siteOrigin(req),
      });
    } catch (e) { return json(res, 400, { error: '通行密钥校验失败：' + e.message }); }

    const db = readBroker();
    db.records = db.records.filter((r) => !(r.credId === info.credId));
    const rec = {
      credId: info.credId,
      ownerId,
      label: String(body.label || '通行密钥').slice(0, 40),
      account: body.account || {},
      jwk: info.jwk,
      alg: info.alg,
      counter: info.counter,
      createdAt: Date.now(),
      session: body.session && body.session.value ? sealSession(body.session) : null,
      sessionKey: body.session && body.session.key ? String(body.session.key) : null,
    };
    db.records.push(rec);
    writeBroker(db);
    return json(res, 200, { ok: true, id: info.credId, label: rec.label });
  }

  if (p === '/api/passkey/login/begin' && req.method === 'POST') {
    const { id, challenge } = newChallenge('login', null);
    return json(res, 200, { challengeId: id, challenge, rpId: rpIdOf(req) });
  }

  if (p === '/api/passkey/login/finish' && req.method === 'POST') {
    const body = await readBody(req);
    const ch = takeChallenge(body.challengeId, 'login');
    if (!ch) return json(res, 400, { error: '挑战已过期，请重试' });
    const credId = (body.credential && (body.credential.id || body.credential.rawId)) || '';
    const db = readBroker();
    const rec = db.records.find((r) => r.credId === credId);
    if (!rec) return json(res, 404, { error: '这个通行密钥还没在本站绑定过' });

    try {
      const r = wa.verifyAssertion({
        credential: body.credential,
        record: rec,
        expectedChallenge: ch.challenge,
        rpId: rpIdOf(req),
        origin: siteOrigin(req),
      });
      if (r.counter > 0) { rec.counter = r.counter; writeBroker(db); }
    } catch (e) {
      return json(res, 401, { error: '通行密钥验证失败：' + e.message });
    }

    if (!rec.session) return json(res, 409, { error: '这条通行密钥没有可恢复的登录凭据，请先用验证码登录一次' });
    let blob;
    try { blob = openSession(rec.session); } catch (e) { return json(res, 409, { error: '本机保存的登录凭据已失效（服务重启），请用验证码登录一次' }); }
    const sessKey = (blob && blob.key) || rec.sessionKey;
    const sessVal = blob && typeof blob.value === 'string' ? blob.value : JSON.stringify(blob);
    if (!sessKey || !sessVal) return json(res, 409, { error: '本机保存的登录凭据不完整，请用验证码登录一次' });
    return json(res, 200, {
      ok: true,
      session: { key: sessKey, value: sessVal },
      account: rec.account || {},
      label: rec.label,
    });
  }

  if (p === '/api/passkey/list' && req.method === 'POST') {
    const user = await resolveUser(req);
    if (!user) return json(res, 401, { error: '需要登录' });
    const db = readBroker();
    return json(res, 200, {
      items: db.records.filter((r) => r.ownerId === user.id).map((r) => ({ id: r.credId, label: r.label, createdAt: r.createdAt, hasSession: !!r.session })),
    });
  }

  if (p === '/api/passkey/delete' && req.method === 'POST') {
    const user = await resolveUser(req);
    if (!user) return json(res, 401, { error: '需要登录' });
    const body = await readBody(req);
    const db = readBroker();
    const before = db.records.length;
    db.records = db.records.filter((r) => !(r.credId === body.id && r.ownerId === user.id));
    writeBroker(db);
    return json(res, 200, { ok: true, removed: before - db.records.length });
  }

  // 登录态下把最新会话写回凭据，保证下次免验证码登录可用
  if (p === '/api/passkey/session' && req.method === 'POST') {
    const user = await resolveUser(req);
    if (!user) return json(res, 401, { error: '需要登录' });
    const body = await readBody(req);
    if (!body.session || !body.session.value) return json(res, 400, { error: '缺少会话数据' });
    const db = readBroker();
    let n = 0;
    for (const r of db.records) {
      if (r.ownerId === user.id) {
        r.session = sealSession(body.session);
        r.sessionKey = String(body.session.key || r.sessionKey || '');
        if (body.account) r.account = body.account;
        n++;
      }
    }
    writeBroker(db);
    return json(res, 200, { ok: true, updated: n });
  }

  return json(res, 404, { error: 'unknown endpoint' });
}

/* ---------------------------------------------------------------- 静态服务 */
function safeJoin(root, urlPath) {
  const p = path.normalize(path.join(root, decodeURIComponent(urlPath)));
  return p.startsWith(root) ? p : null;
}

function serveStatic(req, res, urlPath) {
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  let file = safeJoin(ROOT, urlPath);

  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(ROOT, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  }

  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': /index\.html$/.test(file) ? 'no-cache'
      : (/-[A-Za-z0-9_]{8}\./.test(path.basename(file)) ? 'public, max-age=31536000, immutable' : 'public, max-age=604800'),
    ETag: etag,
  };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }

  const ae = req.headers['accept-encoding'] || '';
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(ae) && stat.size > 1024) {
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    const key = file + ':' + stat.mtimeMs;
    if (gzCache.has(key)) {
      headers['Content-Length'] = gzCache.get(key).length;
      res.writeHead(200, headers);
      return res.end(gzCache.get(key));
    }
    return fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(500); return res.end(); }
      zlib.gzip(buf, { level: 6 }, (e, gz) => {
        if (e) { headers['Content-Length'] = buf.length; res.writeHead(200, headers); return res.end(buf); }
        if (gzCache.size < 3000) gzCache.set(key, gz);
        headers['Content-Length'] = gz.length;
        res.writeHead(200, headers);
        res.end(gz);
      });
    });
  }

  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); } catch (e) { res.writeHead(400); return res.end('bad request'); }

  if (url.pathname.startsWith('/api/')) {
    try {
      if (url.pathname === '/api/health') return json(res, 200, { ok: true, app: APP_NAME, passkeys: readBroker().records.length });
      if (url.pathname.startsWith('/api/passkey/')) return await handlePasskey(req, res, url);
      return json(res, 404, { error: 'unknown endpoint' });
    } catch (e) {
      return json(res, 500, { error: e.message || 'server error' });
    }
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => console.log(APP_NAME + ' listening on ' + HOST + ':' + PORT));
