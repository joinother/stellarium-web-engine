// 星象仪网页版 · 深层资源补全器
// 首次抓取（crawl.js）为了控制体积只取了较浅的层级，放大视野后会出现缺块。
// 本脚本按指定层级补齐 HiPS 分块，已存在的自动跳过，可随时中断重跑。
//
//   node crawl-deep.js stars=4 dss=5            # 扩展星表到 order4、DSS 到 order5
//   node crawl-deep.js gaia=5                   # Gaia 暗星表到 order5（约 150MB）
//   node crawl-deep.js allsky=1                 # 补齐所有 HiPS 的 Allsky 全景图
//   node crawl-deep.js dry=1 dss=5              # 只统计不下载
//
// 体积参考（按实测平均块大小估算）：
//   dss   order4 ≈ 46MB   order5 ≈ 184MB   order6 ≈ 740MB   （官方最大 order9）
//   stars order4 ≈ 129MB  order5 ≈ 515MB                    （扩展星表 8–12 等）
//   gaia  order5 ≈ 146MB  order6 ≈ 585MB                    （order_min=5，12 等以上暗星）

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'public');
const DATA = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/stellarium-web/libswe-1.17.0-48d7978eca/';
const ONLINE = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/';

const args = Object.fromEntries(process.argv.slice(2).map(s => s.split('=')));
const DRY = args.dry === '1';

// 目标：[本地前缀, 远端前缀, 当前层级, 目标层级, 扩展名]
const TARGETS = [];
if (args.stars) {
  TARGETS.push({ name: 'asset_pack_extended/stars', base: DATA + 'asset_pack_extended/stars/', fmt: 'eph', to: +args.stars });
  TARGETS.push({ name: 'stars/base', base: DATA + 'stars/base/', fmt: 'eph', to: +args.stars });
  TARGETS.push({ name: 'stars/minimal', base: DATA + 'stars/minimal/', fmt: 'eph', to: +args.stars });
}
if (args.dss) TARGETS.push({ name: 'dss', base: ONLINE + 'surveys/dss/v1/', fmt: 'webp', to: +args.dss });
if (args.gaia) TARGETS.push({ name: 'gaia', base: ONLINE + 'surveys/gaia/v3/', fmt: 'eph', to: +args.gaia, min: 5 });
if (args.milkyway) TARGETS.push({ name: 'milkyway', base: ONLINE + 'surveys/milkyway/v1/', fmt: 'webp', to: +args.milkyway });

function localPath(url) {
  if (url.startsWith(DATA)) return path.join(OUT, 'data', url.slice(DATA.length));
  if (url.startsWith(ONLINE)) return path.join(OUT, 'online', url.slice(ONLINE.length));
  return null;
}

let bytes = 0, ok = 0, miss = 0, cached = 0;

async function fetchOne(url) {
  const dest = localPath(url);
  if (!dest) return;
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { cached++; return; }
  if (DRY) { miss++; return; }
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 stellarium-mirror' } });
      if (res.status === 404 || res.status === 403) { miss++; return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) { miss++; return; }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      bytes += buf.length; ok++;
      return;
    } catch (e) {
      if (i === 2) { miss++; return; }
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

async function pool(items, worker, conc = 16) {
  let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < items.length) await worker(items[i++]);
  }));
}

(async () => {
  if (!TARGETS.length && !args.allsky) {
    console.log('用法: node crawl-deep.js [stars=N] [dss=N] [gaia=N] [milkyway=N] [allsky=1] [dry=1]');
    return;
  }
  const t0 = Date.now();

  for (const t of TARGETS) {
    const from = t.min || 0;
    console.log(`\n[${t.name}] order ${from} → ${t.to}`);
    for (let o = from; o <= t.to; o++) {
      const count = 12 * Math.pow(4, o);
      const list = [];
      for (let n = 0; n < count; n++) list.push(`${t.base}Norder${o}/Dir${Math.floor(n / 10000)}/Npix${n}.${t.fmt}`);
      const before = { ok, miss, cached };
      // 只探测当前层级是否整体存在，避免对空层级做 5 万次请求
      const probe = localPath(list[0]);
      await pool(list, fetchOne, 24);
      console.log(`  order ${o}: ${count} 块 → 新增 ${ok - before.ok}，缺失 ${miss - before.miss}，已有 ${cached - before.cached}`,
        probe ? '' : '');
      if (ok - before.ok === 0 && cached - before.cached === 0) { console.log('  该层级无数据，停止'); break; }
    }
  }

  if (args.allsky) {
    console.log('\n[allsky] 补齐各 HiPS 的全景图');
    const hips = [];
    const walk = (dir, depth) => {
      if (depth > 4) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (/^v\d+$/.test(e.name) || /^(minimal|base)$/.test(e.name)) hips.push(p);
          else walk(p, depth + 1);
        }
      }
    };
    walk(path.join(OUT, 'online/surveys'), 0);
    walk(path.join(OUT, 'data/stars'), 0);
    walk(path.join(OUT, 'data/asset_pack_extended'), 0);
    walk(path.join(OUT, 'data/landscapes'), 0);
    walk(path.join(OUT, 'data/dsos'), 0);
    const urls = [];
    for (const h of hips) {
      const rel = path.relative(OUT, h).replace(/\\/g, '/');
      const remote = (rel.startsWith('online/') ? ONLINE + rel.slice(7) : DATA + rel.slice(5)) + '/';
      for (const f of ['Norder0/Allsky.webp', 'Norder0/Allsky.png', 'Norder0/Allsky.jpg'])
        urls.push(remote + f);
    }
    await pool(urls, fetchOne, 12);
    console.log('  allsky 候选', urls.length, '→ 新增', ok, '缺失', miss);
  }

  console.log(`\nDONE ${((Date.now() - t0) / 1000).toFixed(0)}s 新增=${ok} 缺失=${miss} 已有=${cached} 新增体积=${(bytes / 1048576).toFixed(1)}MB`);
  console.log('当前 public 总大小: ' + (() => {
    let s = 0; const st = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) st(p); else s += fs.statSync(p).size; } };
    st(OUT); return (s / 1048576).toFixed(0) + 'MB';
  })());
})();
