// 地图瓦片 + 地理编码 + IP 定位：全部经由本站（国内源/自托管），浏览器不再访问境外服务
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GEO_DIR = path.join(__dirname, 'public', 'data-geo');
const TILE_CACHE = path.join(__dirname, 'data', 'tiles');

/* ------------------------------------------------------------- 数据集加载 */
let cnPlaces = [];
let worldPlaces = [];
try {
  cnPlaces = JSON.parse(fs.readFileSync(path.join(GEO_DIR, 'geo-cn.json'), 'utf8'));
} catch (e) { /* 文件缺失时退化为仅国家级 */ }
try {
  worldPlaces = JSON.parse(fs.readFileSync(path.join(GEO_DIR, 'geo-world.json'), 'utf8'));
} catch (e) { /* ignore */ }

// 按省建索引，加速反向检索
const byProvince = new Map();
for (const p of cnPlaces) {
  if (p.l === 'province') continue; // 省级单独遍历（只有 34 个）
}
const districts = cnPlaces.filter((p) => p.l === 'district');
const cities = cnPlaces.filter((p) => p.l === 'city');
const provinces = cnPlaces.filter((p) => p.l === 'province');
const china = cnPlaces.find((p) => p.l === 'country') || { n: '中国', g: [104.2, 35.9] };

function hav(a, b) {
  // 球面距离（km），a/b = [lng,lat]
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearest(list, lngLat) {
  let best = null, bestD = Infinity;
  for (const p of list) {
    const d = hav(p.g, lngLat);
    if (d < bestD) { bestD = d; best = p; }
  }
  return { p: best, d: bestD };
}

/** 找到坐标所属的省（通过最近省级质心，够用） */
function provinceOf(lngLat) {
  return nearest(provinces, lngLat).p;
}

/* --------------------------------------------------------- Nominatim 兼容 */
function nomPlace(name, lat, lon, address) {
  return {
    lat: String(lat), lon: String(lon),
    display_name: name,
    address: address || {},
    boundingbox: [String(lat - 0.08), String(lat + 0.08), String(lon - 0.08), String(lon + 0.08)],
    importance: 0.6,
    place_id: 1,
    osm_type: 'node', osm_id: 0,
    category: 'boundary', type: 'administrative',
  };
}

function reverseLocal(lat, lng) {
  const ll = [lng, lat];
  // 中国范围粗判定（经纬度包围盒）
  const inChinaBox = lat >= 17.5 && lat <= 54.5 && lng >= 72 && lng <= 136;
  if (!inChinaBox) return null;
  const prov = provinceOf(ll);
  const provName = prov ? prov.n : '';
  const provD = nearest(provinces, ll).d;
  // 直辖市（北京市/上海市/天津市/重庆市）本身就是城市层级，不再另找地级市
  const isMunicipality = /^(北京市|上海市|天津市|重庆市)$/.test(provName);
  const dist = nearest(districts, ll);
  const city = isMunicipality ? null : nearest(cities, ll);
  const cityName = isMunicipality ? provName : (city.p && city.d < 60 ? city.p.n : provName);

  const parts = ['中国'];
  if (provName) parts.push(provName);
  if (!isMunicipality && cityName && cityName !== provName) parts.push(cityName);
  if (dist.p && dist.d < 25 && dist.p.n !== cityName) parts.push(dist.p.n);

  if (dist.p && dist.d < 25) {
    return nomPlace(parts.join(' '), lat, lng, {
      country: '中国', country_code: 'cn', state: provName, city: cityName, suburb: dist.p.n,
    });
  }
  if (!isMunicipality && city.p && city.d < 50) {
    return nomPlace(['中国', provName, city.p.n].join(' '), lat, lng, {
      country: '中国', country_code: 'cn', state: provName, city: city.p.n,
    });
  }
  if (provD < 200) {
    return nomPlace('中国 ' + provName, lat, lng, { country: '中国', country_code: 'cn', state: provName });
  }
  return null; // 落到服务端 Nominatim / 国家质心
}

function searchLocal(q, limit) {
  const s = String(q || '').trim();
  if (!s) return [];
  const res = [];
  const seen = new Set();
  const push = (p, label) => {
    if (!p || seen.has(p.n)) return;
    seen.add(p.n);
    res.push(nomPlace(label, p.g[1], p.g[0], { name: p.n }));
  };
  const m = s.replace(/(市|省|区|县|自治州|地区|盟)$/g, '');
  // 区县 > 城市 > 省份 > 国家 顺序，各级内部按名称前缀优先
  const LBL = { district: '区县', city: '城市', province: '省份', country: '国家', municipality: '直辖市' };
  const tiers = [
    districts.filter((p) => p.n === s || p.n.replace(/区$/, '') === m || p.n.replace(/(市|区|县)$/, '') === m),
    cities.filter((p) => p.n === s || p.n.replace(/市$/, '') === m),
    provinces.filter((p) => p.n === s || p.n.replace(/(省|市)$/, '') === m),
    districts.filter((p) => p.n.includes(m) && m.length >= 2),
    cities.filter((p) => p.n.includes(m) && m.length >= 2),
    provinces.filter((p) => p.n.includes(m) && m.length >= 2),
    worldPlaces.filter((p) => (p.n && p.n.includes(m)) || (p.e && p.e.toLowerCase().startsWith(s.toLowerCase()))),
  ];
  for (const tier of tiers) {
    for (const p of tier.slice(0, limit)) {
      if (res.length >= limit) break;
      push(p, p.n + (p.l ? ' · ' + LBL[p.l] : ''));
    }
    if (res.length >= limit) break;
  }
  return res;
}

/* ------------------------------------------------- 服务端 Nominatim 兜底 */
const nomCache = new Map(); // url -> {t, body}
async function nominatimFallback(pathQs) {
  const url = 'https://nominatim.openstreetmap.org/' + pathQs;
  const hit = nomCache.get(url);
  if (hit && Date.now() - hit.t < 7 * 864e5) return hit.body;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, {
      headers: { 'User-Agent': 'stellarium-web-cn-mirror/1.0 (personal mirror)', 'Accept-Language': 'zh-CN,zh' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const body = await r.text();
    if (nomCache.size > 3000) nomCache.clear();
    nomCache.set(url, { t: Date.now(), body });
    return body;
  } catch (e) {
    return null;
  }
}

/* ---------------------------------------------------------------- 瓦片代理 */
const AMAP_HOSTS = ['webrd01', 'webrd02', 'webrd03', 'webrd04'];
const memTiles = new Map();
fs.mkdirSync(TILE_CACHE, { recursive: true });

// 1×1 透明 PNG（源站全部失败时的兜底，避免碎图标）
const BLANK_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAAC0lEQVR4nGP4DwABBQEC/8PRfgAAAABJRU5ErkJggg==', 'base64');

async function fetchTile(z, x, y) {
  const key = z + '/' + x + '/' + y;
  const mem = memTiles.get(key);
  if (mem) return mem;

  const file = path.join(TILE_CACHE, z + '', x + '', y + '.png');
  try {
    const buf = fs.readFileSync(file);
    memTiles.set(key, buf);
    if (memTiles.size > 800) { const k0 = memTiles.keys().next().value; memTiles.delete(k0); }
    return buf;
  } catch (e) { /* 未缓存 */ }

  // 高德（国内源，中文标注）。AMap 为 GCJ-02 坐标，城市级选择场景偏移可忽略
  const host = AMAP_HOSTS[(x + y) % 4];
  const u = `https://${host}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(u, { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 100) {
        memTiles.set(key, buf);
        try {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, buf);
        } catch (e) { /* 只读盘：只用内存缓存 */ }
        if (memTiles.size > 800) { const k0 = memTiles.keys().next().value; memTiles.delete(k0); }
        return buf;
      }
    }
  } catch (e) { /* 落到兜底 */ }

  memTiles.set(key, BLANK_TILE);
  return BLANK_TILE;
}

/* --------------------------------------------------------------- IP 定位 */
const ipCache = new Map();
async function locateByIp(ip) {
  const def = { latitude: 39.9042, longitude: 116.4074, city: '北京', region_name: '北京市', country_name: '中国', time_zone: 'Asia/Shanghai' };
  if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('::1')) return def;
  const hit = ipCache.get(ip);
  if (hit && Date.now() - hit.t < 864e5) return hit.v;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch('https://whois.pconline.com.cn/ipJson.jsp?json=true&ip=' + encodeURIComponent(ip), { signal: ctrl.signal });
    clearTimeout(timer);
    const txt = await r.text();
    const j = JSON.parse(txt); // GBK? pconline json=true 返回 UTF-8
    const prov = (j.province || '').replace(/[省市]$/, '');
    const city = (j.city || '').replace(/[省市]$/, '');
    // 在数据集里找城市/省份坐标
    let hit2 = cities.find((p) => p.n.replace(/市$/, '') === city) || null;
    if (!hit2) hit2 = cities.find((p) => p.n.replace(/市$/, '').includes(city) && city) || null;
    if (!hit2) hit2 = provinces.find((p) => p.n.replace(/(省|市)$/, '') === prov) || null;
    const v = hit2 ? {
      latitude: hit2.g[1], longitude: hit2.g[0],
      city: city || prov, region_name: j.province || prov, country_name: '中国',
      time_zone: 'Asia/Shanghai',
    } : def;
    if (ipCache.size > 2000) ipCache.clear();
    ipCache.set(ip, { t: Date.now(), v });
    return v;
  } catch (e) {
    return def;
  }
}

/* ----------------------------------------------------------------- 路由 */
function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function handleGeo(req, res, url) {
  const p = url.pathname;

  // 地图瓦片
  let m = p.match(/^\/api\/map\/tile\/(\d{1,2})\/(\d{1,3})\/(\d{1,3})\.png$/);
  if (m) {
    const z = +m[1], x = +m[2], y = +m[3];
    const n = 1 << z;
    if (z < 1 || z > 18 || x >= n || y >= n) { res.writeHead(404); return res.end(); }
    const buf = await fetchTile(z, x, y);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=2592000, immutable',
    });
    return res.end(buf);
  }

  // Nominatim 兼容（本地数据优先）
  if (p === '/api/nominatim/search') {
    const q = url.searchParams.get('q') || '';
    let body = searchLocal(q, 5);
    if (!body.length && q) {
      const fb = await nominatimFallback('search' + url.search.replace(/^(\?)/, '?') );
      if (fb) return sendText(res, fb);
    }
    return sendJson(res, 200, body);
  }
  if (p === '/api/nominatim/reverse') {
    const lat = parseFloat(url.searchParams.get('lat'));
    const lon = parseFloat(url.searchParams.get('lon'));
    let local = reverseLocal(lat, lon);
    if (!local) {
      // 海外坐标：先试服务端 Nominatim，再退回国家质心
      const fb = await nominatimFallback('reverse?format=jsonv2&lat=' + lat + '&lon=' + lon);
      let parsed = null;
      try { parsed = JSON.parse(fb); } catch (e) { /* ignore */ }
      if (parsed && parsed.display_name) return sendText(res, fb);
      const w = nearest(worldPlaces, [lon, lat]);
      local = w.p && w.d < 400
        ? nomPlace(w.p.n, lat, lon, { country: w.p.n, country_code: (w.p.c || '').toLowerCase() })
        : nomPlace('未知地点', lat, lon, {});
    }
    return sendJson(res, 200, local);
  }

  // IP 定位（freegeoip 兼容）
  if (p === '/api/geoip/json' || p === '/api/geoip') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
    const v = await locateByIp(ip);
    return sendJson(res, 200, Object.assign({
      ip, country_code: 'CN', zip_code: '', metro_code: 0,
    }, v));
  }

  return false;
}

function sendText(res, body) {
  const buf = Buffer.from(body, 'utf8');
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=86400' });
  res.end(buf);
}

module.exports = { handleGeo };
