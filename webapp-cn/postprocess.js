// 后处理：把前端里写死的官方 CDN 地址改写为本地相对路径
const fs = require('fs');
const path = require('path');
const https = require('https');

const PUB = path.join(__dirname, 'public');
const FE = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/stellarium-web/frontend-1.16.0/';
const DATA = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/stellarium-web/libswe-1.17.0-48d7978eca/';
const HOST1 = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/';
const HOST2 = 'https://stellarium.sfo2.digitaloceanspaces.com/';

function rewriteText(s) {
  return s
    .split(FE).join('./')
    .split(DATA).join('./data/')
    .split(HOST1).join('./online/')
    .split(HOST2).join('./online/');
}

// --- 1. JS ---
const jsFiles = fs.readdirSync(path.join(PUB, 'assets')).filter(f => f.endsWith('.js'));
for (const f of jsFiles) {
  const p = path.join(PUB, 'assets', f);
  const before = fs.readFileSync(p, 'utf8');
  let after = rewriteText(before);
  // 引擎模块桩里的 wasm 地址（同目录）
  after = after.replace(/https:\/\/[^"']*?swe-[A-Za-z0-9_-]+\.wasm/g, './swe-C40wx6-2.wasm');
  // api 后端在国内不可达，保留但不会阻塞渲染
  if (after !== before) { fs.writeFileSync(p, after); console.log('rewrote', f, before.length, '->', after.length); }
}

// --- 2. index.html ---
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
html = rewriteText(html);
html = html
  // 去掉 Google 字体、统计脚本、广告像素
  .replace(/<link rel="preconnect"[^>]*>/g, '')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g, '')
  .replace(/<link href="https:\/\/cdn\.jsdelivr\.net[^>]*>/g, '<link rel="stylesheet" href="./vendor/materialdesignicons.min.css">')
  .replace(/<script async src="https:\/\/www\.googletagmanager\.com[^>]*><\/script>/g, '')
  .replace(/<script> window\.dataLayer[\s\S]*?<\/script>/g, '')
  .replace(/<meta name="google-site-verification"[^>]*>/g, '');
html = html.replace(/<title>.*?<\/title>/,
  '<title>Stellarium Web 星空图 · 国内镜像站</title>');
html = html.replace('</head>', `<meta name="description" content="Stellarium Web Engine 国内镜像站：全部星表、星座文化与地景数据本地托管，无需访问境外 CDN。">
<link rel="stylesheet" href="./mirror.css">
</head>`);
html = html.replace('</body>', `<div id="mirror-badge">
  <strong>国内镜像</strong> · 数据本地托管 · <a href="https://github.com/Stellarium/stellarium-web-engine" target="_blank" rel="noopener">Stellarium Web Engine</a>（AGPL-3.0）
  <button id="mirror-badge-x" title="关闭">×</button>
</div>
<script src="./mirror.js"></script>
</body>`);
fs.writeFileSync(path.join(PUB, 'index.html'), html);
console.log('index.html done');

// --- 3. 本地图标字体 ---
fs.mkdirSync(path.join(PUB, 'vendor'), { recursive: true });
fs.mkdirSync(path.join(PUB, 'fonts'), { recursive: true });
const dl = (url, dest) => new Promise((res) => {
  https.get(url, r => {
    if (r.statusCode !== 200) { console.log('fail', url, r.statusCode); return res(false); }
    const ws = fs.createWriteStream(dest);
    r.pipe(ws); ws.on('finish', () => res(true));
  }).on('error', () => res(false));
});
(async () => {
  await dl('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css',
    path.join(PUB, 'vendor/materialdesignicons.min.css'));
  // css 里引用 ../fonts/xxx.woff2，因此放到 public/fonts/
  await dl('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/fonts/materialdesignicons-webfont.woff2',
    path.join(PUB, 'fonts/materialdesignicons-webfont.woff2'));
  const cssP = path.join(PUB, 'vendor/materialdesignicons.min.css');
  if (fs.existsSync(cssP)) {
    let c = fs.readFileSync(cssP, 'utf8');
    c = c.replace(/url\("\.\.\/fonts\//g, 'url("../fonts/').replace(/\?v=[0-9.]+/g, '');
    fs.writeFileSync(cssP, c);
  }
  // CSS 里可能还有别的 url()
  const appCss = fs.readdirSync(path.join(PUB, 'assets')).filter(f => f.endsWith('.css'));
  for (const f of appCss) {
    const p = path.join(PUB, 'assets', f);
    let c = fs.readFileSync(p, 'utf8');
    const out = rewriteText(c).replace(/url\(["']?\/assets\//g, 'url("../assets/');
    if (out !== c) { fs.writeFileSync(p, out); console.log('rewrote css', f); }
  }
  console.log('vendor fonts ok');
})();
