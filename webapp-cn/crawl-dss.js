// 补充抓取：DSS 彩色巡天（从 order3 起才有瓦片）
const fs = require('fs');
const path = require('path');
const OUT = './public';
const ONLINE = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/';
const manifestPath = path.join(OUT, '..', 'mirror-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const localFor = (url) => path.join(OUT, 'online', url.slice(ONLINE.length));
let bytes = 0, ok = 0;

async function fetchOne(url) {
  const dest = localFor(url);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    manifest.files[url] = buf.length; bytes += buf.length; ok++;
  } catch (e) { }
}

async function pool(items, worker, conc) {
  let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < items.length) await worker(items[i++]);
  }));
}

(async () => {
  const maxOrder = Number(process.argv[2] || 4);
  for (let o = 3; o <= maxOrder; o++) {
    const count = 12 * Math.pow(4, o);
    await pool([...Array(count).keys()], n =>
      fetchOne(`${ONLINE}surveys/dss/v1/Norder${o}/Dir${Math.floor(n / 10000)}/Npix${n}.webp`), 24);
    console.log(`dss order ${o} done, +${((bytes) / 1048576).toFixed(1)}MB, files=${ok}`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log('TOTAL', (bytes / 1048576).toFixed(1) + 'MB', ok, 'files');
})();
