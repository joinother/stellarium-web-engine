// 抓取太阳系天体表面贴图（sso 巡天）
const fs = require('fs');
const path = require('path');
const OUT = './public';
const ONLINE = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/';
const manifestPath = path.join(OUT, '..', 'mirror-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const localFor = u => path.join(OUT, 'online', u.slice(ONLINE.length));
let bytes = 0, ok = 0;

async function get(url) {
  const dest = localFor(url);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  try {
    const r = await fetch(url);
    if (!r.ok) return;
    const b = Buffer.from(await r.arrayBuffer());
    if (!b.length) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, b);
    manifest.files[url] = b.length; bytes += b.length; ok++;
  } catch (e) { }
}
async function pool(items, w, c) { let i = 0; await Promise.all(Array.from({ length: c }, async () => { while (i < items.length) await w(items[i++]); })); }

const targets = [
  ['sso/moon/v2', 3], ['sso/moon-normal/v3', 3],
  ['sso/sun/v1', 1], ['sso/venus/v2', 1], ['sso/default/v1', 1],
  ['sso/jupiter/v1', 3], ['sso/saturn/v1', 3], ['sso/mars/v1', 3], ['sso/mercury/v1', 2],
  ['sso/uranus/v1', 2], ['sso/neptune/v2', 2], ['sso/io/v1', 2], ['sso/callisto/v1', 2],
  ['sso/ganymede/v1', 2], ['sso/europa/v1', 2], ['sso/titan/v1', 2], ['sso/phobos/v1', 1], ['sso/deimos/v1', 1],
];

(async () => {
  for (const [dir, maxOrder] of targets) {
    const before = bytes;
    await get(`${ONLINE}surveys/${dir}/properties`);
    for (let o = 0; o <= maxOrder; o++) {
      const n = 12 * Math.pow(4, o);
      await pool([...Array(n).keys()], i =>
        get(`${ONLINE}surveys/${dir}/Norder${o}/Dir${Math.floor(i / 10000)}/Npix${i}.webp`), 20);
    }
    console.log(dir, '->', ((bytes - before) / 1048576).toFixed(1) + 'MB');
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log('TOTAL', (bytes / 1048576).toFixed(1) + 'MB', ok, 'files');
})();
