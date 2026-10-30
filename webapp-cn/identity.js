// 统一身份层：一个 uid 挂多个身份（手机 / 邮箱 / 通行密钥 / 第三方）
//
// 为什么要这一层：云认证后端把「手机号用户」和「邮箱用户」当成两个互不相关的账号，
// 导致同一个人在手机登录后看不到自己绑的邮箱，反之亦然。这里把身份收敛到本站自己的
// uid 上：任意一种身份登录，只要能匹配到已有 uid 就归入同一个账户。
//
// 验证码校验放在服务端完成（转发到云认证后端），所以「我通过了验证码」这件事由服务器
// 确认，而不是前端自称。验证通过后由本站签发自己的令牌，后续所有数据读写都按 uid 走。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const wa = require('./webauthn');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'identity.json');
const PUBLISHABLE_KEY = process.env.WB_PUBLISHABLE_KEY ||
  'wbpk_9t6FrPA3X0La8ej8Er0qOS_JbUC6UgrcfVY1TbJJnI8wfeSqynu0OQW';
// 仅本地自测：开启后验证码固定为 123456（生产环境绝不能开）
const DEV_OTP = process.env.DEV_OTP === '1';
const TOKEN_TTL = 30 * 24 * 3600 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ------------------------------------------------------------------ 存储 */
let db = null;
function load() {
  if (db) return db;
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { db = null; }
  if (!db || db.v !== 1 || !db.users || !db.index || !db.tokens) {
    db = { v: 1, users: {}, index: { phone: {}, email: {}, cred: {}, oauth: {} }, tokens: {} };
  }
  for (const k of ['phone', 'email', 'cred', 'oauth']) if (!db.index[k]) db.index[k] = {};
  return db;
}
function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db));
  } catch (e) { console.error('[identity] 写入失败', e.message); }
}
function newUid() { return 'u_' + crypto.randomBytes(9).toString('hex'); }
function now() { return Date.now(); }

function publicUser(u) {
  if (!u) return null;
  return {
    uid: u.uid, name: u.name || '',
    phone: u.phone || '', phoneVerified: !!u.phoneVerified,
    email: u.email || '', emailVerified: !!u.emailVerified,
    oauth: Object.keys(u.oauth || {}),
    hasPassword: !!u.password,
    passkeys: (u.passkeys || []).map(p => ({ id: p.id, label: p.label, createdAt: p.createdAt })),
    createdAt: u.createdAt, lastLogin: u.lastLogin,
  };
}

/* ------------------------------------------------------------------ 令牌 */
function issueToken(uid) {
  const t = 'sm_' + crypto.randomBytes(24).toString('hex');
  load().tokens[t] = { uid, exp: now() + TOKEN_TTL };
  save();
  return t;
}
function userByToken(req, url) {
  let t = '';
  const h = String(req.headers.authorization || '');
  if (h.toLowerCase().startsWith('bearer ')) t = h.slice(7).trim();
  if (!t && url && url.searchParams) t = url.searchParams.get('token') || '';
  if (!t) return null;
  const rec = load().tokens[t];
  if (!rec) return null;
  if (rec.exp && rec.exp < now()) { delete db.tokens[t]; save(); return null; }
  return load().users[rec.uid] || null;
}
function revokeToken(req, url) {
  const h = String(req.headers.authorization || '');
  let t = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
  if (!t && url && url.searchParams) t = url.searchParams.get('token') || '';
  if (t) { delete load().tokens[t]; save(); }
}

/* ------------------------------------------------------------------ 密码 */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}
function verifyPassword(pw, rec) {
  if (!rec || !rec.hash || !rec.salt) return false;
  try {
    const h = crypto.scryptSync(pw, rec.salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(rec.hash, 'hex'));
  } catch (e) { return false; }
}

/* --------------------------------------------------- 云认证后端（验证码） */
// 云认证后端挂在部署平台网关上（/.cloud/...），只有从对外域名进来才会被网关接管。
// 应用内部拿到的 host 常常是沙箱内网地址，直接请求会绕过网关、被 SPA 回退成 HTML，
// 所以识别到内网 host 时一律改用对外域名。
const DEFAULT_ORIGIN = (process.env.SELF_ORIGIN || 'https://stellarium-web-cn.app.workbuddy.host').replace(/\/+$/, '');
function selfOrigin(req) {
  if (process.env.SELF_ORIGIN) return DEFAULT_ORIGIN;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  // 只有对外域名上的 /.cloud/ 才会被平台网关接管；沙箱内部域名请求过去会被当成普通路径
  if (!/\.workbuddy\.host$/i.test(host)) return DEFAULT_ORIGIN;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return proto + '://' + host;
}
// 部署平台的网关只放行带分享码的请求，服务端访问云认证后端时必须带上，
// 否则会被网关拦回一个 HTML 页面（表现为「验证码发送失败（HTTP 200）」）。
const SHARECODE = process.env.SHARECODE || 'ZRF4MO7BGX';
function cloudUrl(req, path) {
  const q = SHARECODE ? (path.indexOf('?') >= 0 ? '&' : '?') + 'sharecode=' + encodeURIComponent(SHARECODE) : '';
  return selfOrigin(req) + path + q;
}
async function cloudSend(req, kind, value) {
  // 云认证后端要求 E.164 带空格格式：+86 13800138000
  const e164 = /^\+/.test(value) ? value : '+86 ' + value.replace(/^0/, '');
  const body = kind === 'phone'
    ? { phone_number: e164, target: 'ANY' }
    : { email: value, usage: 'email' };
  const url = cloudUrl(req, '/.cloud/auth/v1/verification');
  let r, raw = '';
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wb-webapp-access-key': PUBLISHABLE_KEY },
      body: JSON.stringify(body),
    });
    raw = await r.text();
  } catch (e) {
    throw new Error('无法连接云认证后端：' + e.message);
  }
  let j = {};
  try { j = JSON.parse(raw); } catch (e) { /* 非 JSON，下面按原文报错 */ }
  if (!r.ok || !j.verification_id) {
    throw new Error(j.message || j.error_description ||
      ('验证码发送失败（HTTP ' + r.status + '，请求 ' + url + '，云返回：' + raw.replace(/\s+/g, ' ').slice(0, 120) + '）'));
  }
  return { verificationId: j.verification_id, isExistingUser: j.is_user === true };
}
async function cloudVerify(req, verificationId, code) {
  const r = await fetch(cloudUrl(req, '/.cloud/auth/v1/verification/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-wb-webapp-access-key': PUBLISHABLE_KEY },
    body: JSON.stringify({ verification_id: verificationId, verification_code: code }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.verification_token) throw new Error(j.message || '验证码不正确或已过期');
  return j.verification_token;
}

/* --------------------------------------------------- 身份解析 / 关联 */
function findBy(kind, value) {
  const d = load();
  const key = kind === 'phone' ? String(value) : String(value).trim().toLowerCase();
  const uid = d.index[kind] && d.index[kind][key];
  return uid ? d.users[uid] : null;
}
function linkIdentity(user, kind, value) {
  const d = load();
  const key = kind === 'phone' ? String(value) : String(value).trim().toLowerCase();
  const taken = d.index[kind][key];
  if (taken && taken !== user.uid) return { error: '该' + (kind === 'phone' ? '手机号' : '邮箱') + '已被其他账号绑定' };
  d.index[kind][key] = user.uid;
  if (kind === 'phone') { user.phone = value; user.phoneVerified = true; }
  if (kind === 'email') { user.email = key; user.emailVerified = true; }
  return {};
}
function createUser() {
  const d = load();
  const u = {
    uid: newUid(), name: '', phone: '', phoneVerified: false,
    email: '', emailVerified: false, oauth: {}, passkeys: [], password: null,
    places: [], createdAt: now(), lastLogin: now(),
  };
  d.users[u.uid] = u;
  return u;
}

/* ------------------------------------------------------------- 通行密钥 */
function rpIdOf(req) { return (selfOrigin(req).split('://')[1] || '').split(':')[0]; }

async function passkeyRegisterBegin(req, user) {
  const challenge = crypto.randomBytes(32).toString('base64url');
  const id = crypto.randomBytes(16).toString('base64url');
  pending.set(id, { uid: user.uid, challenge, kind: 'register', exp: now() + 5 * 60000 });
  return {
    challengeId: id, challenge,
    rp: { name: '星象仪网页版', id: rpIdOf(req) },
    user: { id: Buffer.from(user.uid).toString('base64url'), name: user.email || user.phone || user.uid, displayName: user.name || '星象仪用户' },
  };
}
async function passkeyRegisterFinish(req, body) {
  const p = pending.get(body.challengeId);
  if (!p || p.kind !== 'register' || p.exp < now()) throw new Error('通行密钥注册已超时，请重试');
  const cred = body.credential || {};
  const clientData = JSON.parse(Buffer.from(
    wa.b64uToBuf(cred.response && cred.response.clientDataJSON), 'utf8').toString());
  if (clientData.challenge !== p.challenge) throw new Error('挑战值不匹配');
  const reg = wa.verifyRegistration(cred, {
    challenge: p.challenge,
    origin: selfOrigin(req),
    rpId: rpIdOf(req),
  });
  if (!reg || !reg.publicKey) throw new Error('凭据校验失败');
  const user = load().users[p.uid];
  if (!user) throw new Error('账号不存在');
  pending.delete(body.challengeId);
  const cid = cred.id;
  const existing = (user.passkeys || []).findIndex(x => x.id === cid);
  const rec = {
    id: cid, label: body.label || '本机通行密钥',
    publicKey: reg.publicKey, alg: reg.alg || -7,
    counter: reg.counter || 0, createdAt: now(),
  };
  if (existing >= 0) user.passkeys[existing] = rec; else (user.passkeys = user.passkeys || []).push(rec);
  load().index.cred[cid] = user.uid;
  save();
  return { ok: true };
}

async function passkeyLoginBegin(req) {
  const challenge = crypto.randomBytes(32).toString('base64url');
  const id = crypto.randomBytes(16).toString('base64url');
  pending.set(id, { challenge, kind: 'login', exp: now() + 5 * 60000 });
  return { challengeId: id, challenge, rpId: rpIdOf(req) };
}
async function passkeyLoginFinish(req, body) {
  const p = pending.get(body.challengeId);
  if (!p || p.kind !== 'login' || p.exp < now()) throw new Error('登录已超时，请重试');
  const cred = body.credential || {};
  const uid = load().index.cred[cred.id];
  if (!uid) throw new Error('这台设备上没有匹配的通行密钥');
  const user = load().users[uid];
  const rec = (user.passkeys || []).find(x => x.id === cred.id);
  if (!rec) throw new Error('通行密钥记录不存在');
  const res = wa.verifyAssertion(cred, {
    publicKey: rec.publicKey, alg: rec.alg,
    challenge: p.challenge, origin: selfOrigin(req), rpId: rpIdOf(req),
    prevCounter: rec.counter || 0,
  });
  if (!res || res.ok !== true) throw new Error('通行密钥校验失败');
  rec.counter = res.counter || rec.counter;
  user.lastLogin = now();
  pending.delete(body.challengeId);
  save();
  return { token: issueToken(uid), user: publicUser(user) };
}
const pending = new Map();

/* ------------------------------------------------------------ 第三方登录 */
async function oauthLink(req, body) {
  const token = String(body.accessToken || '');
  if (!token) throw new Error('缺少第三方登录凭据');
  const r = await fetch(cloudUrl(req, '/.cloud/auth/v1/user/me'), {
    headers: { 'x-wb-webapp-access-key': PUBLISHABLE_KEY, Authorization: 'Bearer ' + token },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error('第三方登录凭据无效');
  const provider = String(body.provider || 'workbuddy');
  const key = provider + ':' + j.id;
  let user = findBy('oauth', key);
  let fresh = false;
  if (!user) {
    if (body.token) user = userByToken(req, null);
    if (!user) { user = createUser(); fresh = true; }
    load().index.oauth[key] = user.uid;
    user.oauth = user.oauth || {};
    user.oauth[provider] = j.id;
  }
  if (j.email && !user.email) { const e = linkIdentity(user, 'email', j.email); if (!e.error) user.emailVerified = true; }
  if (j.phone && !user.phone) { const e = linkIdentity(user, 'phone', j.phone); if (!e.error) user.phoneVerified = true; }
  user.lastLogin = now();
  save();
  return { token: issueToken(user.uid), user: publicUser(user), fresh };
}

/* ------------------------------------------------------------------ 路由 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 1e6) { req.destroy(); reject(new Error('请求体过大')); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(new Error('请求体不是合法 JSON')); } });
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

async function handle(req, res, url) {
  const p = url.pathname;
  try {
    /* 发送验证码 */
    if (p === '/api/id/otp/send' && req.method === 'POST') {
      const b = await readBody(req);
      const kind = b.kind === 'email' ? 'email' : 'phone';
      const value = String(b.value || '').trim();
      if (kind === 'phone' && !/^1\d{10}$/.test(value)) return json(res, 400, { error: '请填写 11 位大陆手机号' });
      if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return json(res, 400, { error: '邮箱格式不正确' });
      if (DEV_OTP) return json(res, 200, { verificationId: 'dev-' + crypto.randomBytes(8).toString('hex'), isExistingUser: !!findBy(kind, value), dev: true });
      const r = await cloudSend(req, kind, value);
      return json(res, 200, r);
    }

    /* 校验验证码 → 登录或绑定 */
    if (p === '/api/id/otp/verify' && req.method === 'POST') {
      const b = await readBody(req);
      const kind = b.kind === 'email' ? 'email' : 'phone';
      const value = String(b.value || '').trim();
      const code = String(b.code || '').trim();
      if (!/^\d{4,8}$/.test(code)) return json(res, 400, { error: '请填写验证码' });
      if (!(DEV_OTP && code === '123456')) await cloudVerify(req, String(b.verificationId || ''), code);

      const key = kind === 'phone' ? value : value.toLowerCase();
      const intent = b.intent === 'bind' ? 'bind' : 'login';
      let user = findBy(kind, key);

      if (intent === 'bind') {
        const cur = userByToken(req, url) || (b.token ? userByToken({ headers: { authorization: 'Bearer ' + b.token } }, null) : null);
        if (!cur) return json(res, 401, { error: '请先登录再绑定' });
        if (user && user.uid !== cur.uid) return json(res, 409, { error: '该' + (kind === 'phone' ? '手机号' : '邮箱') + '已被其他账号绑定' });
        const e = linkIdentity(cur, kind, key);
        if (e.error) return json(res, 409, { error: e.error });
        save();
        return json(res, 200, { ok: true, user: publicUser(cur) });
      }

      // 登录：命中已有身份就归入那个账户，否则新建
      let fresh = false;
      if (!user) { user = createUser(); fresh = true; }
      const e = linkIdentity(user, kind, key);
      if (e.error) return json(res, 409, { error: e.error });
      user.lastLogin = now();
      save();
      return json(res, 200, { token: issueToken(user.uid), user: publicUser(user), fresh });
    }

    /* 当前登录态 */
    if (p === '/api/id/me' && req.method === 'GET') {
      const u = userByToken(req, url);
      if (!u) return json(res, 401, { error: '未登录' });
      return json(res, 200, { user: publicUser(u), places: u.places || [] });
    }

    /* 更新资料 */
    if (p === '/api/id/profile' && req.method === 'POST') {
      const u = userByToken(req, url);
      if (!u) return json(res, 401, { error: '未登录' });
      const b = await readBody(req);
      if (typeof b.name === 'string') u.name = b.name.slice(0, 40);
      save();
      return json(res, 200, { user: publicUser(u) });
    }

    /* 设置 / 修改密码 */
    if (p === '/api/id/password' && req.method === 'POST') {
      const u = userByToken(req, url);
      if (!u) return json(res, 401, { error: '未登录' });
      const b = await readBody(req);
      const pw = String(b.password || '');
      if (pw.length < 8) return json(res, 400, { error: '密码至少 8 位' });
      if (u.password && !verifyPassword(String(b.oldPassword || ''), u.password)) {
        return json(res, 403, { error: '原密码不正确' });
      }
      u.password = hashPassword(pw);
      save();
      return json(res, 200, { ok: true });
    }

    /* 密码登录（手机或邮箱都可以） */
    if (p === '/api/id/login/password' && req.method === 'POST') {
      const b = await readBody(req);
      const id = String(b.identifier || '').trim().toLowerCase();
      const pw = String(b.password || '');
      if (!id || !pw) return json(res, 400, { error: '请填写账号与密码' });
      const user = findBy('email', id) || findBy('phone', id);
      if (!user || !user.password || !verifyPassword(pw, user.password)) {
        return json(res, 401, { error: '账号或密码不正确' });
      }
      user.lastLogin = now();
      save();
      return json(res, 200, { token: issueToken(user.uid), user: publicUser(user) });
    }

    /* 通行密钥 */
    if (p === '/api/id/passkey/register/begin' && req.method === 'POST') {
      const u = userByToken(req, url);
      if (!u) return json(res, 401, { error: '请先登录再绑定通行密钥' });
      return json(res, 200, await passkeyRegisterBegin(req, u));
    }
    if (p === '/api/id/passkey/register/finish' && req.method === 'POST') {
      const b = await readBody(req);
      await passkeyRegisterFinish(req, b);
      const u = userByToken(req, url);
      return json(res, 200, { ok: true, user: u ? publicUser(u) : null });
    }
    if (p === '/api/id/passkey/login/begin' && req.method === 'POST') {
      return json(res, 200, await passkeyLoginBegin(req));
    }
    if (p === '/api/id/passkey/login/finish' && req.method === 'POST') {
      const b = await readBody(req);
      return json(res, 200, await passkeyLoginFinish(req, b));
    }
    if (p === '/api/id/passkey/delete' && req.method === 'POST') {
      const u = userByToken(req, url);
      if (!u) return json(res, 401, { error: '未登录' });
      const b = await readBody(req);
      const id = String(b.id || '');
      u.passkeys = (u.passkeys || []).filter(x => x.id !== id);
      delete load().index.cred[id];
      save();
      return json(res, 200, { user: publicUser(u) });
    }

    /* 第三方登录 / 绑定 */
    if (p === '/api/id/oauth' && req.method === 'POST') {
      const b = await readBody(req);
      return json(res, 200, await oauthLink(req, b));
    }

    /* 收藏（按 uid 存，不再按云用户分散） */
    if (p === '/api/id/places' && req.method === 'GET') {
      const u = userByToken(req, url);
      if (!u) return json(res, 401, { error: '未登录' });
      return json(res, 200, { places: u.places || [] });
    }
    if (p === '/api/id/places' && req.method === 'POST') {
      const u = userByToken(req, url);
      if (!u) return json(res, 401, { error: '未登录' });
      const b = await readBody(req);
      const list = Array.isArray(b.places) ? b.places.slice(0, 500) : [];
      u.places = list;
      save();
      return json(res, 200, { ok: true, count: list.length });
    }

    /* 解绑身份 */
    if (p === '/api/id/unlink' && req.method === 'POST') {
      const u = userByToken(req, url);
      if (!u) return json(res, 401, { error: '未登录' });
      const b = await readBody(req);
      const kind = String(b.kind || '');
      if (kind === 'phone') { delete load().index.phone[u.phone]; u.phone = ''; u.phoneVerified = false; }
      else if (kind === 'email') { delete load().index.email[u.email]; u.email = ''; u.emailVerified = false; }
      else if (kind === 'oauth') { for (const k of Object.keys(u.oauth || {})) delete load().index.oauth[k + ':' + u.oauth[k]]; u.oauth = {}; }
      else return json(res, 400, { error: '不支持的解绑类型' });
      save();
      return json(res, 200, { user: publicUser(u) });
    }

    /* 退出登录 */
    if (p === '/api/id/logout' && req.method === 'POST') {
      revokeToken(req, url);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'unknown endpoint' });
  } catch (e) {
    return json(res, 400, { error: e.message || '请求失败' });
  }
}

module.exports = { handle, userByToken, publicUser };
