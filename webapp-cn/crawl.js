// Stellarium Web 国内镜像 - 资源抓取器
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || './public';
const FE = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/stellarium-web/frontend-1.16.0/';
const DATA = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/stellarium-web/libswe-1.17.0-48d7978eca/';
const ONLINE = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/';

const manifestPath = path.join(OUT, '..', 'mirror-manifest.json');
let manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { files: {} };

function localFor(url) {
  if (url.startsWith(FE)) return path.join(OUT, url.slice(FE.length));
  if (url.startsWith(DATA)) return path.join(OUT, 'data', url.slice(DATA.length));
  if (url.startsWith('https://stellarium.sfo2.digitaloceanspaces.com/'))
    return path.join(OUT, 'online', url.slice('https://stellarium.sfo2.digitaloceanspaces.com/'.length));
  if (url.startsWith(ONLINE)) return path.join(OUT, 'online', url.slice(ONLINE.length));
  return null;
}

let bytes = 0, ok = 0, fail = 0;

async function fetchOne(url, retries = 3) {
  const dest = localFor(url);
  if (!dest) { console.log('SKIP(mapping)', url); return null; }
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    const st = fs.statSync(dest);
    manifest.files[url] = st.size; bytes += st.size;
    return { url, size: st.size, cached: true, dest };
  }
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 stellarium-mirror' } });
      if (res.status === 404 || res.status === 403) { fail++; return { url, status: res.status }; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) { fail++; return { url, status: 'empty' }; }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      manifest.files[url] = buf.length; bytes += buf.length; ok++;
      return { url, size: buf.length, dest, buf };
    } catch (e) {
      if (i === retries - 1) { fail++; return { url, error: e.message }; }
      await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
}

async function pool(items, worker, conc = 12) {
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < items.length) {
      const idx = i++;
      res[idx] = await worker(items[idx], idx);
    }
  }));
  return res;
}

// 从 JSON / 文本中提取相对资源引用
function extractRefs(buf, url) {
  const text = buf.toString('utf8');
  const refs = new Set();
  const re = /["'\s(]((?:\.\/)?[A-Za-z0-9_@%+.,\-/]+\.(?:webp|png|jpg|jpeg|json|md|utf8|eph|txt|dat|gz|svg|woff2|css|js))/g;
  let m;
  while ((m = re.exec(text))) {
    let p = m[1];
    if (p.startsWith('http') || p.startsWith('//') || p.startsWith('data:')) continue;
    if (p.includes('://')) continue;
    try { refs.add(new URL(p, url).href); } catch (e) {}
  }
  return [...refs];
}

// 枚举 HiPS 分块
async function enumerateHips(baseUrl, maxOrder, opts = {}) {
  const fmt = opts.fmt || 'eph';
  const found = [];
  for (let o = 0; o <= maxOrder; o++) {
    const count = 12 * Math.pow(4, o);
    const idxs = [...Array(count).keys()];
    const hits = [];
    await pool(idxs, async (n) => {
      const u = `${baseUrl}Norder${o}/Dir${Math.floor(n / 10000)}/Npix${n}.${fmt}`;
      const r = await fetchOne(u, 1);
      if (r && r.size) hits.push(n);
    }, 20);
    console.log(`  order ${o}: ${hits.length}/${count} tiles`);
    if (!hits.length) break;
    if (opts.stopAfterOrder !== undefined && o >= opts.stopAfterOrder) break;
  }
}

(async () => {
  const t0 = Date.now();
  // ---- 1. 前端资源 ----
  console.log('[1/6] 前端 shell');
  const shell = await pool(['', 'assets/index-Dhk2oPcR.js', 'assets/index-D4IBqhPY.css',
    'assets/swe-BrUvszdd.js', 'assets/swe-C40wx6-2.wasm', 'assets/logo-BPi9T_T3.svg',
    'assets/smp-Cb7jwr26.png', 'assets/google-download-DB5eYYiV.png', 'assets/apple-download-BUpa96oe.png'],
    u => fetchOne(FE + u), 6);

  // ---- 2. 核心数据文件 ----
  console.log('[2/6] 核心数据');
  const core = ['asterisms.json', 'galaxy-models.json', 'meteor-showers.json', 'planetary-features.json',
    'mpcorb.dat', 'skycultures/index.json', 'landscapes/index.json'];
  const coreRes = await pool(core, u => fetchOne(DATA + u), 6);

  // ---- 3. 外部在线数据 ----
  console.log('[3/6] 在线数据 (mpc / skysources / surveys 元数据)');
  await pool([
    'mpc/v1/CometEls.txt',
    'skysources/v1/tle_satellite.jsonl.gz',
    'surveys/milkyway/v1/properties', 'surveys/gaia/v3/properties', 'surveys/dss/v1/properties',
  ], u => fetchOne(ONLINE + u), 5);

  // ---- 4. 递归引用 (星座文化 / 地景 / 探针) ----
  console.log('[4/6] 递归抓取引用资源');
  const queue = new Set();
  for (const r of coreRes) if (r && r.buf) for (const ref of extractRefs(r.buf, r.url)) queue.add(ref);

  const cultures = JSON.parse(fs.readFileSync(path.join(OUT, 'data/skycultures/index.json'), 'utf8'));
  for (const c of cultures) {
    const b = DATA + 'skycultures/' + c + '/';
    for (const f of ['index.json', 'description.md', 'description.en.utf8', 'description.zh.utf8', 'description.zh_CN.utf8', 'description.utf8'])
      queue.add(b + f);
  }
  const landscapes = JSON.parse(fs.readFileSync(path.join(OUT, 'data/landscapes/index.json'), 'utf8'));
  for (const l of landscapes) {
    const b = DATA + 'landscapes/' + l + '/';
    for (const f of ['properties', 'index.json', 'description.en.utf8', 'description.zh.utf8', 'description.utf8'])
      queue.add(b + f);
  }
  // 全部探针（来自已抓到的引用 + 常见列表）
  for (const p of ['bepi_colombo', 'europa_clipper', 'gaia', 'hayabusa2', 'hera', 'juice', 'jwst', 'lucy',
    'new_horizons', 'osiris_apex', 'parker_sp', 'psyche', 'solar_orbiter', 'tesla_roadster', 'voyager1', 'voyager2', 'iss', 'hubble'])
    queue.add(DATA + 'probes/' + p + '.json');

  let rounds = 0;
  while (queue.size && rounds < 4) {
    const batch = [...queue]; queue.clear();
    console.log(`  round ${rounds + 1}: ${batch.length} refs`);
    const done = await pool(batch, u => fetchOne(u), 16);
    for (const r of done) if (r && r.buf && r.size < 3_000_000) {
      const ext = (r.url.split('?')[0].split('.').pop() || '').toLowerCase();
      if (['json', 'md', 'utf8', 'txt', 'properties'].includes(ext))
        for (const ref of extractRefs(r.buf, r.url)) queue.add(ref);
    }
    rounds++;
  }

  // ---- 5. 星表 / 深空 / 地景贴图 ----
  console.log('[5/6] 星表与贴图分块');
  const hipsTargets = [
    [DATA + 'stars/minimal/', 3, 'eph'],
    [DATA + 'stars/base/', 3, 'eph'],
    [DATA + 'asset_pack_extended/stars/', 3, 'eph'],
    [DATA + 'asset_pack_extended/dso/', 3, 'eph'],
    [DATA + 'dsos/base/', 3, 'eph'],
    [ONLINE + 'surveys/milkyway/v1/', 1, 'webp'],
    [ONLINE + 'surveys/dss/v1/', 3, 'webp'],
  ];
  for (const [base, mo, fmt] of hipsTargets) {
    console.log(' ->', base.replace(DATA, '').replace(ONLINE, 'online/'));
    await enumerateHips(base, mo, { fmt });
  }
  for (const l of landscapes) {
    console.log(' -> landscape', l);
    await enumerateHips(DATA + 'landscapes/' + l + '/', 2, { fmt: 'webp' });
  }

  // allsky 贴图
  await pool([
    ONLINE + 'surveys/milkyway/v1/Norder0/Allsky.webp',
    ...landscapes.map(l => DATA + 'landscapes/' + l + '/Norder0/Allsky.webp'),
  ], u => fetchOne(u), 6);

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log('\nDONE', ((Date.now() - t0) / 1000).toFixed(0) + 's',
    'ok=' + ok, 'fail/skip=' + fail, 'bytes=' + (bytes / 1048576).toFixed(1) + 'MB',
    'files=' + Object.keys(manifest.files).length);
})();
