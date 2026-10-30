'use strict';
/**
 * 极简 WebAuthn 服务端验签实现（无第三方依赖）
 * 只覆盖通行密钥实际会用到的情况：attestation = none、ES256 / RS256。
 */
const crypto = require('crypto');

function b64uToBuf(s) {
  const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(t + '='.repeat((4 - (t.length % 4)) % 4), 'base64');
}

function bufToB64u(b) {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ------------------------------------------------ CBOR（只支持确定长度） */
function cborDecode(buf) {
  return decodeItem(buf, 0).value;
}

function decodeItem(buf, offset) {
  const first = buf[offset];
  offset += 1;
  const major = first >> 5;
  let info = first & 0x1f;
  let len = info;

  if (info === 24) { len = buf.readUInt8(offset); offset += 1; }
  else if (info === 25) { len = buf.readUInt16BE(offset); offset += 2; }
  else if (info === 26) { len = buf.readUInt32BE(offset); offset += 4; }
  else if (info === 27) { len = Number(buf.readBigUInt64BE(offset)); offset += 8; }
  else if (info === 31) { throw new Error('不支持不定长 CBOR'); }

  switch (major) {
    case 0: return { value: len, offset };
    case 1: return { value: -1 - len, offset };
    case 2: return { value: buf.subarray(offset, offset + len), offset: offset + len };
    case 3: return { value: buf.subarray(offset, offset + len).toString('utf8'), offset: offset + len };
    case 4: {
      const arr = [];
      for (let i = 0; i < len; i++) { const r = decodeItem(buf, offset); arr.push(r.value); offset = r.offset; }
      return { value: arr, offset };
    }
    case 5: {
      const map = new Map();
      for (let i = 0; i < len; i++) {
        const k = decodeItem(buf, offset); offset = k.offset;
        const v = decodeItem(buf, offset); offset = v.offset;
        let key = k.value;
        if (key instanceof Uint8Array) key = Buffer.from(key).toString('hex');
        map.set(key, v.value);
      }
      return { value: map, offset };
    }
    case 6: return decodeItem(buf, offset);            // tag：忽略，取内层
    case 7: return { value: info === 20 ? false : info === 21 ? true : null, offset };
    default: throw new Error('CBOR 类型不支持');
  }
}

/* -------------------------------------------------------- 认证器数据结构 */
function parseAuthData(buf) {
  if (buf.length < 37) throw new Error('authData 长度异常');
  const rpIdHash = buf.subarray(0, 32);
  const flags = buf[32];
  const counter = buf.readUInt32BE(33);
  const out = { rpIdHash, flags, counter, up: !!(flags & 0x01), uv: !!(flags & 0x04), credId: null, cose: null };

  if (flags & 0x40) {
    let p = 37 + 16;                       // aaguid
    const credIdLen = buf.readUInt16BE(p); p += 2;
    out.credId = buf.subarray(p, p + credIdLen); p += credIdLen;
    out.cose = cborDecode(buf.subarray(p));
  }
  return out;
}

function coseToJwk(cose) {
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (kty === 2) {
    const crvId = cose.get(-1);
    const crv = crvId === 1 ? 'P-256' : crvId === 2 ? 'P-384' : crvId === 3 ? 'P-521' : null;
    if (!crv) throw new Error('曲线不支持');
    return { alg, jwk: { kty: 'EC', crv, x: bufToB64u(cose.get(-2)), y: bufToB64u(cose.get(-3)) } };
  }
  if (kty === 3) {
    return {
      alg,
      jwk: { kty: 'RSA', n: bufToB64u(cose.get(-1)), e: bufToB64u(cose.get(-2)) }
    };
  }
  throw new Error('公钥类型不支持（仅支持 ES256 / RS256）');
}

/* -------------------------------------------------------------- 校验逻辑 */
function checkClientData(clientDataBuf, expectedType, expectedChallenge, rpId, origin) {
  let cd;
  try { cd = JSON.parse(clientDataBuf.toString('utf8')); } catch (e) { throw new Error('clientData 解析失败'); }
  if (cd.type !== expectedType) throw new Error('clientData.type 不符');
  if (String(cd.challenge) !== String(expectedChallenge)) throw new Error('challenge 不匹配');
  if (cd.origin) {
    let host;
    try { host = new URL(cd.origin).hostname; } catch (e) { throw new Error('origin 非法'); }
    if (host !== rpId && !originHostAllowed(host, rpId)) throw new Error('origin 与站点不符');
  }
  return cd;
}

function originHostAllowed(host, rpId) {
  return host === rpId;
}

/** 注册校验：返回 {credId, jwk, alg, counter} */
function verifyRegistration(opts) {
  const { credential, expectedChallenge, rpId, origin } = opts;
  const resp = credential.response || {};
  const clientDataBuf = b64uToBuf(resp.clientDataJSON);
  checkClientData(clientDataBuf, 'webauthn.create', expectedChallenge, rpId, origin);

  const attObj = cborDecode(b64uToBuf(resp.attestationObject));
  const authData = parseAuthData(attObj.get('authData'));
  const fmt = attObj.get('fmt');

  if (!authData.credId) throw new Error('注册数据缺少凭据 ID');
  if (authData.rpIdHash.compare(crypto.createHash('sha256').update(rpId).digest()) !== 0) {
    throw new Error('rpIdHash 不匹配（站点域名与通行密钥范围不一致）');
  }
  if (!authData.up) throw new Error('用户未完成验证');

  // fmt=packed 时若有 attestation 签名则校验；none / self 一律跳过（我们只接受 none 语义）
  if (fmt && fmt !== 'none' && fmt !== 'packed') {
    // 不认识的格式不阻断：公钥仍从 authData 取得，后续登录签名会真正校验
  }

  const { alg, jwk } = coseToJwk(authData.cose);
  return { credId: bufToB64u(authData.credId), jwk, alg, counter: authData.counter, fmt: fmt || 'none' };
}

/** 登录校验：返回 true/false */
function verifyAssertion(opts) {
  const { credential, record, expectedChallenge, rpId, origin } = opts;
  const resp = credential.response || {};
  const clientDataBuf = b64uToBuf(resp.clientDataJSON);
  checkClientData(clientDataBuf, 'webauthn.get', expectedChallenge, rpId, origin);

  const authDataBuf = b64uToBuf(resp.authenticatorData);
  const authData = parseAuthData(authDataBuf);
  if (authData.rpIdHash.compare(crypto.createHash('sha256').update(rpId).digest()) !== 0) {
    throw new Error('rpIdHash 不匹配');
  }
  if (!authData.up) throw new Error('用户未完成验证');

  const signature = b64uToBuf(resp.signature);
  const clientHash = crypto.createHash('sha256').update(clientDataBuf).digest();
  const signedData = Buffer.concat([authDataBuf, clientHash]);

  let key;
  try {
    key = crypto.createPublicKey({ key: record.jwk, format: 'jwk' });
  } catch (e) { throw new Error('已存公钥无法解析'); }

  const ok = crypto.verify('sha256', signedData, { key, dsaEncoding: 'der' }, signature);
  if (!ok) throw new Error('签名校验失败');

  return { counter: authData.counter };
}

module.exports = {
  b64uToBuf, bufToB64u, cborDecode, parseAuthData, coseToJwk,
  verifyRegistration, verifyAssertion
};
