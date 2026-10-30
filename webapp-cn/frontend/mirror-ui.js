/*
 * 星象仪网页版（Stellarium Web 国内镜像）· 增强层
 * 1) 界面中文化（向 vue-i18n 注入 zh-CN 词表，缺失项自动回落英文）
 * 2) 当前视角 → 可分享链接（复用前端原生支持的 URL 参数）
 * 3) 我的观测点收藏（浏览器本地存储，可导出 / 导入）
 * 本文件只做前端增强，不改动引擎与星表数据。
 */
(function () {
  'use strict';

  var STORE_KEY = 'sweb-mirror-places-v1';
  var LANG_KEY = 'sweb-mirror-lang';

  /* 云服务配置（来自应用开通云服务时返回的 publicConfig，仅含公开标识，无敏感密钥） */
  var CLOUD = {
    endpoint: 'https://stellarium-web-cn.app.workbuddy.host',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_9t6FrPA3X0La8ej8Er0qOS_JbUC6UgrcfVY1TbJJnI8wfeSqynu0OQW',
    table: 'sky_places'
  };
  var cloudClient = null;
  var cloudUser = null;
  var pendingOtp = null;
  var listRefresher = null;

  /* ---------------------------------------------------------------- 中文词表 */
  var ZH = {
    'About': '关于',
    'Privacy': '隐私',
    'Data Credits': '数据来源',
    'Search...': '搜索天体…',
    'Observe': '观测',
    'Constellations': '星座',
    'Constellations Art': '星座图绘',
    'Atmosphere': '大气',
    'Landscape': '地景',
    'Azimuthal Grid': '地平网格',
    'Equatorial Grid': '赤道网格',
    'Deep Sky Objects': '深空天体',
    'Night Mode': '夜间模式',
    'Fullscreen': '全屏',
    'Could not show the Online Star Map': '无法显示在线星图',
    'It seems that your browser cannot load Web Assembly!': '你的浏览器似乎无法加载 WebAssembly！',
    'Web assembly is necessary for Stellarium Web to display the star map. Please upgrade your web browser and try again!':
      'Stellarium Web 需要 WebAssembly 才能绘制星图，请升级浏览器后重试。',
    'desktop version': '桌面版',
    'Use Autolocation': '自动定位',
    'My Locations': '我的地点',
    'Use this location': '使用此位置',
    'Unknown Address': '未知地点',
    'Lat {0}° Lon {1}°': '纬度 {0}° 经度 {1}°',
    'Unknown': '未知',
    'Near {0}': '靠近 {0}',
    'Magnitude': '星等',
    'Distance': '距离',
    'Radius': '半径',
    'Spectral Type': '光谱型',
    'Size': '大小',
    'Ra/Dec': '赤经/赤纬',
    'Az/Alt': '方位/高度',
    'Phase': '相位',
    'Not visible tonight': '今夜不可见',
    'Always visible tonight': '今夜整夜可见',
    'Rise: {0}&nbsp;&nbsp;&nbsp; Set: {1}': '升起：{0}&nbsp;&nbsp;&nbsp; 落下：{1}',
    'Visibility': '可见性',
    'Meridian Line': '子午线',
    'Ecliptic Line': '黄道线',
    'Dark night': '天文暗夜',
    'Moonlight': '月光',
    'Dawn': '曙光',
    'Daylight': '白昼',
    'Sign in to your Stellarium account': '登录 Stellarium 账号',
    'No account yet?': '还没有账号？',
    'Create a Stellarium account': '注册 Stellarium 账号',
    'Thanks for signing up!': '注册成功，感谢支持！',
    'Deleting your Stellarium account is permanent and cannot be undone.': '注销账号不可恢复，请谨慎操作。',
    'Use your Stellarium account to': '使用 Stellarium 账号可以',
    'Sign in': '登录',
    'Sign out': '退出登录',
    'Tonight': '今晚',
    'Sunset': '日落',
    'Sunrise': '日出',
    'Solar System': '太阳系',
    'current location': '当前位置',
    'No planet is visible tonight': '今晚没有可见行星',
    'No night': '无极夜',
    'Delete': '删除',
    'Observing setup': '观测器材',
    'Instrument': '主镜',
    'Accessories': '附件',
    'New instrument': '新建器材',
    'None': '无',
    'New {0}...': '新建 {0}…',
    'Manufacturer': '厂商',
    'Model': '型号',
    'Back': '返回',
    'Cancel': '取消',
    'Edit': '编辑',
    'The unaided eye': '肉眼',
    'Generic': '通用',
    'Focal Length': '焦距',
    'Apparent Field of View': '表观视场',
    'Diameter': '口径',
    'Barlow / Reducer': '巴洛镜 / 减焦镜',
    'Rotation': '旋转',
    'Equatorial Mount': '赤道仪',
    'Camera Body': '相机机身',
    'Multiplier': '倍率',
    'Magnification': '放大倍数',
    'Real Field of View': '实际视场',
    'or Meters @ 1000m': '或米 @ 1000 米',
    'Width': '宽',
    'Height': '高',
    'Resolution': '分辨率',
    'Pixel Size': '像元大小',
    'Sensor Size': '传感器尺寸',
    'From the camera database': '取自相机数据库',
    'Search a camera': '搜索相机',
    'No camera found': '未找到相机',
    'FOV': '视场',
    'Shape': '形状',
    'Telrad': 'Telrad 寻星环',
    'Cross Reticle': '十字分划',
    'Archive': '归档',
    'Could not save the equipment': '无法保存器材',
    'Could not delete the equipment': '无法删除器材',
    'Field of View': '视场',
    'Exit Pupil': '出瞳直径',
    'Focal Ratio': '焦比',
    'pixel': '像素',
    'mm': '毫米',
    'px': '像素',
    'Naked Eye': '肉眼',
    'Binoculars': '双筒镜',
    'Telescope': '望远镜',
    'Camera': '相机',
    'Finder': '寻星镜',
    'Circle': '圆形',
    'Rectangle': '矩形',
    'Eyepiece': '目镜',
    'Barlow': '巴洛镜',
    'Sensor': '传感器',
    'View Settings': '显示设置',
    'My Observations': '我的观测',
    'Calendar': '日历',
    'Stellarium App': 'Stellarium 应用',
    'I Agree': '我同意',
    'Tonight': '今晚',
    'My equipment': '我的器材',
    'Reset view': '重置视角'
  };

  function vueApp() {
    var el = document.getElementById('app');
    return el && el.__vue_app__;
  }

  // vue-i18n 实例是通过 provide(symbol) 注入的，globalProperties 上没有 $i18n
  function i18nInstance() {
    var app = vueApp();
    var gp = app && app.config && app.config.globalProperties;
    if (gp && gp.$i18n) return gp.$i18n;
    var prov = app && app._context && app._context.provides;
    if (!prov) return null;
    var syms = Object.getOwnPropertySymbols(prov);
    for (var i = 0; i < syms.length; i++) {
      var v = prov[syms[i]];
      if (v && typeof v === 'object' && v.global && typeof v.global.t === 'function' && '__instances' in v) return v;
    }
    return null;
  }

  function currentLocale(i18n) {
    var g = i18n.global || i18n;
    if (typeof g.locale === 'string') return g.locale;
    if (g.locale && typeof g.locale === 'object' && 'value' in g.locale) return g.locale.value;
    if (typeof i18n.locale === 'string') return i18n.locale;
    return 'en';
  }

  function setLocale(i18n, lang) {
    var g = i18n.global || i18n;
    if (g.locale && typeof g.locale === 'object' && 'value' in g.locale) { g.locale.value = lang; return; }
    if (typeof g.locale === 'string') { g.locale = lang; }
    if (typeof i18n.locale === 'string') { i18n.locale = lang; }
  }

  var zhInstalled = false;

  function installZh(force) {
    var i18n = i18nInstance();
    if (!i18n) return false;
    try {
      if (!zhInstalled) {
        var g = i18n.global || i18n;
        g.mergeLocaleMessage('zh-CN', ZH);
        g.mergeLocaleMessage('zh', ZH);
        zhInstalled = true;
      }
      if (force) {
        // 语言不该被前端重置：仅在当前不是中文时改
        var cur = currentLocale(i18n);
        if (cur !== 'zh-CN' && cur !== 'zh') setLocale(i18n, 'zh-CN');
      }
    } catch (e) {
      return false;
    }
    return true;
  }

  var wantZh = localStorage.getItem(LANG_KEY) !== 'en';

  function bootstrapLang() {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (installZh(wantZh) && tries > 2) {
        clearInterval(timer);
        if (wantZh) document.documentElement.lang = 'zh-CN';
      }
      if (tries > 120) clearInterval(timer);
    }, 250);
    // 兜底：前端若在设置里被切回英文，重新拉回
    setInterval(function () { if (wantZh) installZh(true); }, 2000);
  }

  /* ------------------------------------------------ DOM 兜底翻译（静态文案） */
  var SKIP_SEL = '#sm-panel, #mirror-badge, #sm-fab, .sm-toast';
  var REV = (function () { var m = {}; for (var k in ZH) m[k] = ZH[k]; return m; })();

  function inSkip(node) {
    var p = node.parentNode;
    if (!p) return true;
    var e = p.nodeType === 1 ? p : p.parentNode;
    try { return !!(e && e.closest && e.closest(SKIP_SEL)); } catch (err) { return false; }
  }

  function translateText(t) {
    var s = t.nodeValue;
    if (!s) return;
    var trimmed = s.trim();
    if (!trimmed || trimmed.length > 80) return;
    if (REV[trimmed]) { t.nodeValue = s.replace(trimmed, REV[trimmed]); return; }
    var m = /^FOV\s+([\d.]+)\s*°$/.exec(trimmed);
    if (m) t.nodeValue = s.replace(trimmed, '视场 ' + m[1] + '°');
  }

  function translateAttrs(root) {
    if (!root.querySelectorAll) return;
    var list = root.querySelectorAll('[placeholder],[title],[aria-label]');
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      ['placeholder', 'title', 'aria-label'].forEach(function (a) {
        var v = e.getAttribute(a);
        if (v && REV[v]) e.setAttribute(a, REV[v]);
      });
    }
  }

  function translateDom(root) {
    if (!wantZh || !root || root.nodeType !== 1) return;
    try {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var n, batch = [];
      while ((n = w.nextNode())) { if (!inSkip(n)) batch.push(n); }
      for (var i = 0; i < batch.length; i++) translateText(batch[i]);
      translateAttrs(root);
    } catch (e) { /* ignore */ }
  }

  function watchDom() {
    var app = document.getElementById('app');
    if (!app) { setTimeout(watchDom, 300); return; }
    var mo = new MutationObserver(function (muts) {
      if (!wantZh) return;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') { translateText(m.target); continue; }
        for (var j = 0; j < m.addedNodes.length; j++) {
          var nd = m.addedNodes[j];
          if (nd.nodeType === 3) translateText(nd);
          else if (nd.nodeType === 1) translateDom(nd);
        }
      }
    });
    mo.observe(app, { childList: true, subtree: true, characterData: true });
    // 菜单、图例等静态文案在挂载时就已渲染，补几轮扫描
    [800, 1800, 3500, 6000, 10000].forEach(function (d) {
      setTimeout(function () { translateDom(app); }, d);
    });
  }

  /* ------------------------------------------------------------ 视角与链接 */
  function stelCore() {
    var s = window._stel;
    return s && (s.core || (s.$stel && s.$stel.core));
  }

  function mjdToDate(mjd) {
    return new Date((mjd + 2400000.5 - 2440587.5) * 86400000);
  }

  function isoUtc(d) {
    return d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
  }

  function captureView() {
    var c = stelCore();
    if (!c) return null;
    var r = Math.PI / 180;
    var view = {
      fov: (c.fov / r).toFixed(2),
      lat: (c.latitude / r).toFixed(2),
      lng: (c.longitude / r).toFixed(2),
      elev: Math.round(c.elevation || 0),
      az: (c.yaw / r).toFixed(2),
      alt: (c.pitch / r).toFixed(2),
      date: null
    };
    if (typeof c.utc === 'number' && c.utc > 40000 && c.utc < 100000) {
      try { view.date = isoUtc(mjdToDate(c.utc)); } catch (e) { /* ignore */ }
    }
    if (!view.date) view.date = isoUtc(new Date());
    return view;
  }

  function viewToUrl(v) {
    var u = new URL(location.href);
    u.hash = '';
    var q = [
      'fov=' + v.fov, 'lat=' + v.lat, 'lng=' + v.lng, 'elev=' + v.elev,
      'az=' + v.az, 'alt=' + v.alt, 'date=' + encodeURIComponent(v.date)
    ];
    return u.origin + u.pathname + '?' + q.join('&');
  }

  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /* -------------------------------------------------------------- 本地收藏 */
  function loadPlaces() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
  }

  function savePlaces(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  }

  /* ------------------------------------------------------------------ 云同步 */
  function cloudReady() {
    return !!(window.WorkBuddyCloud && CLOUD.endpoint);
  }

  function initCloud() {
    if (!cloudReady() || cloudClient) return;
    try {
      cloudClient = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: CLOUD.endpoint,
        oauthRelayBaseUrl: CLOUD.oauthRelayBaseUrl,
        publishableKey: CLOUD.publishableKey
      });
    } catch (e) {
      cloudClient = null;
    }
  }

  function rowToPlace(r) {
    return {
      id: r.client_id, name: r.name, url: r.url,
      fov: r.fov, lat: r.lat, lng: r.lng, elev: r.elev, az: r.az, alt: r.alt,
      date: r.observed_at,
      ts: r.created_at ? new Date(r.created_at).getTime() : 0
    };
  }

  function placeToRow(p) {
    return {
      client_id: p.id, name: p.name, url: p.url,
      fov: p.fov, lat: p.lat, lng: p.lng, elev: p.elev || null, az: p.az, alt: p.alt,
      observed_at: p.date || null,
      owner_name: cloudUser ? (cloudUser.email || '').split('@')[0] : null
    };
  }

  async function cloudPull() {
    var res = await cloudClient.database.from(CLOUD.table).select('*').order('created_at', { ascending: false });
    if (res.error) throw new Error(res.error.message || '拉取失败');
    return (res.data || []).map(rowToPlace);
  }

  async function cloudInsert(place) {
    var res = await cloudClient.database.from(CLOUD.table).insert([placeToRow(place)]);
    if (res.error && !/duplicate|unique/i.test(res.error.message || '')) throw new Error(res.error.message);
  }

  async function cloudDelete(clientId) {
    var res = await cloudClient.database.from(CLOUD.table).delete().eq('client_id', clientId);
    if (res.error) throw new Error(res.error.message);
  }

  /* 登录后全量合并：云端没有的推上去，本地没有的拉下来；同 id 冲突时保留较新一条 */
  async function cloudMerge() {
    var remote = await cloudPull();
    var local = loadPlaces();
    var byId = {};
    local.forEach(function (p) { byId[p.id] = p; });
    var merged = local.slice();
    var pushed = 0, pulled = 0;

    for (var i = 0; i < remote.length; i++) {
      var r = remote[i];
      var l = byId[r.id];
      if (!l) { merged.push(r); pulled++; }
      else if ((r.ts || 0) > (l.ts || 0)) {
        for (var j = 0; j < merged.length; j++) if (merged[j].id === r.id) merged[j] = r;
        pulled++;
      }
    }
    var remoteIds = {};
    remote.forEach(function (r) { remoteIds[r.id] = 1; });
    for (var k = 0; k < local.length; k++) {
      if (!remoteIds[local[k].id]) {
        try { await cloudInsert(local[k]); pushed++; } catch (e) { /* 单条失败不中断 */ }
      }
    }
    savePlaces(merged);
    return { pushed: pushed, pulled: pulled };
  }

  async function syncNow(btn) {
    if (!cloudUser) return;
    var old = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '同步中…'; btn.disabled = true; }
    try {
      var r = await cloudMerge();
      if (listRefresher) listRefresher();
      toast('云同步完成：上传 ' + r.pushed + ' 条，下载 ' + r.pulled + ' 条');
      setCloudStatus('已同步 · ' + new Date().toLocaleTimeString());
    } catch (e) {
      toast('云同步失败：' + e.message);
      setCloudStatus('同步失败，可重试');
    } finally {
      if (btn) { btn.textContent = old || '立即同步'; btn.disabled = false; }
    }
  }

  /* 登录/保存/删除后的增量推送（登录态下静默执行） */
  async function cloudPushPlace(place) {
    if (!cloudUser) return;
    try { await cloudInsert(place); } catch (e) { /* 静默，下次全量合并兜底 */ }
  }

  async function cloudRemovePlace(id) {
    if (!cloudUser) return;
    try { await cloudDelete(id); } catch (e) { /* 静默 */ }
  }

  async function restoreSession() {
    if (!cloudReady()) return;
    initCloud();
    if (!cloudClient) return;
    try {
      var s = await cloudClient.auth.getSession();
      if (s && s.data && s.data.session) {
        var u = s.data.session.user || (await cloudClient.auth.getUser()).data;
        cloudUser = u || { email: '已登录' };
        onCloudSignedIn();
      }
    } catch (e) { /* 未登录 */ }
  }


  /* ------------------------------------------------- 通行密钥 / 账号底层工具 */
  function b64uToBuf(s) {
    var t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(t + '='.repeat((4 - t.length % 4) % 4));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bufToB64u(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* SDK 把登录态写在 localStorage 的 workbuddy-cloud.session.<appId> 中 */
  var SESSION_PREFIX = 'workbuddy-cloud.session.';

  function readSessionBlob() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(SESSION_PREFIX) === 0) {
          var v = localStorage.getItem(k);
          if (v && v.length > 10) return { key: k, value: v };
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function currentAccount() {
    return { email: (cloudUser && cloudUser.email) || '', phone: (cloudUser && cloudUser.phone) || '' };
  }

  async function apiPost(path, body) {
    var headers = { 'Content-Type': 'application/json' };
    try {
      var tk = await cloudClient.auth.getAccessToken();
      if (tk) headers.Authorization = 'Bearer ' + tk;
    } catch (e) { /* 匿名接口不需要 */ }
    var r = await fetch(path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  /* 只校验验证码、不建号：直接调云后端 verification/verify 换取 verification_token */
  async function verifyOnly(verificationId, code) {
    var r = await fetch('/.cloud/auth/v1/verification/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wb-webapp-access-key': CLOUD.publishableKey },
      body: JSON.stringify({ verification_id: verificationId, verification_code: code })
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.verification_token) throw new Error(j.message || '验证码校验失败');
    return j.verification_token;
  }

  function passkeySupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }

  function serializeAttestation(cred) {
    return {
      id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
      response: {
        clientDataJSON: bufToB64u(cred.response.clientDataJSON),
        attestationObject: bufToB64u(cred.response.attestationObject)
      }
    };
  }

  function serializeAssertion(cred) {
    return {
      id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
      response: {
        clientDataJSON: bufToB64u(cred.response.clientDataJSON),
        authenticatorData: bufToB64u(cred.response.authenticatorData),
        signature: bufToB64u(cred.response.signature),
        userHandle: cred.response.userHandle ? bufToB64u(cred.response.userHandle) : null
      }
    };
  }

  async function addPasskey(label) {
    if (!passkeySupported()) throw new Error('当前浏览器不支持通行密钥');
    var blob = readSessionBlob();
    var begin = await apiPost('/api/passkey/register/begin', { account: currentAccount() });
    var cred = await navigator.credentials.create({
      publicKey: {
        challenge: b64uToBuf(begin.challenge),
        rp: begin.rp,
        user: { id: b64uToBuf(begin.user.id), name: begin.user.name, displayName: begin.user.displayName },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
      }
    });
    if (!cred) throw new Error('未创建通行密钥');
    var res = await apiPost('/api/passkey/register/finish', {
      challengeId: begin.challengeId,
      label: label || '本机通行密钥',
      account: currentAccount(),
      session: blob,
      credential: serializeAttestation(cred)
    });
    try {
      await cloudClient.database.from('sweb_passkeys').insert([{ credential_id: cred.id, label: label || '本机通行密钥' }]);
    } catch (e) { /* 云端索引表写失败不影响登录 */ }
    return res;
  }

  async function loginWithPasskey() {
    if (!passkeySupported()) throw new Error('当前浏览器不支持通行密钥');
    var begin = await apiPost('/api/passkey/login/begin', {});
    var cred = await navigator.credentials.get({
      publicKey: {
        challenge: b64uToBuf(begin.challenge),
        rpId: begin.rpId,
        userVerification: 'preferred',
        timeout: 60000
      }
    });
    if (!cred) throw new Error('未选择通行密钥');
    var res = await apiPost('/api/passkey/login/finish', {
      challengeId: begin.challengeId,
      credential: serializeAssertion(cred)
    });
    if (!res.session || !res.session.key) throw new Error('没有可恢复的登录凭据');
    localStorage.setItem(res.session.key, res.session.value);
    await restoreSession();
    return res;
  }

  async function refreshPasskeySession() {
    if (!cloudUser) return;
    var blob = readSessionBlob();
    if (!blob) return;
    try { await apiPost('/api/passkey/session', { session: blob, account: currentAccount() }); } catch (e) { /* 静默 */ }
  }

  /* ------------------------------------------------------------------ 界面 */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function toast(msg) {
    var t = document.querySelector('.sm-toast');
    if (!t) { t = el('div', 'sm-toast'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t.__h);
    t.__h = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function buildPanel() {
    var fab = el('button', '', '<span class="dot"></span>我的星图');
    fab.id = 'sm-fab';
    fab.title = '保存 / 分享当前观测视角';

    var panel = el('aside', '');
    panel.id = 'sm-panel';
    panel.innerHTML =
      '<header><div><h2>星象仪网页版</h2>' +
      '<div class="sub">我的星图 · 观测点与视角 · 登录后云同步</div></div>' +
      '<button id="sm-close" title="关闭">×</button></header>' +
      '<div id="sm-body"></div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var body = panel.querySelector('#sm-body');
    var cloudBox = el('div', '');
    var state = el('div', 'sm-state', '');
    var btnSave = el('button', 'sm-btn', '保存当前视角');
    var btnCopy = el('button', 'sm-btn ghost', '复制分享链接');
    var row = el('div', 'sm-row');
    row.appendChild(btnSave);
    row.appendChild(btnCopy);

    var listWrap = el('div', '');
    var tools = el('div', 'sm-row');
    var btnExport = el('button', 'sm-btn ghost', '导出备份');
    var btnImport = el('button', 'sm-btn ghost', '导入备份');
    tools.appendChild(btnExport);
    tools.appendChild(btnImport);

    body.appendChild(cloudBox);
    body.appendChild(state);
    body.appendChild(row);
    body.appendChild(el('div', 'sm-hr'));
    body.appendChild(el('div', 'sm-label', '已保存的观测点'));
    body.appendChild(listWrap);
    body.appendChild(tools);
    body.appendChild(el('div', 'sm-note',
      '提示：链接里已包含视场、坐标与时间，发给别人打开即可还原同一片天空。' +
      '未登录时数据仅存于本机浏览器；登录后自动云端同步，换设备登录同一邮箱即可找回。'));

    /* ------------------------------------- 账号：手机号 / 邮箱 / 通行密钥 */
    var authState = {
      tab: 'phone',
      phone: { value: '', verificationId: '', isExistingUser: false },
      email: { value: '', verificationId: '', isExistingUser: false, token: null }
    };

    function mkInput(placeholder, type) {
      var i = el('input', 'sm-input');
      i.type = type || 'text';
      i.placeholder = placeholder;
      return i;
    }

    function codeRow(placeholder, onSend) {
      var row = el('div', 'sm-row');
      var code = mkInput(placeholder || '验证码', 'text');
      code.inputMode = 'numeric';
      code.autocomplete = 'one-time-code';
      var btn = el('button', 'sm-btn ghost', '获取验证码');
      btn.type = 'button';
      btn.style.flex = '0 0 auto';
      btn.addEventListener('click', function () { onSend(code, btn); });
      row.appendChild(code);
      row.appendChild(btn);
      return row;
    }

    function countdown(btn) {
      var n = 60;
      btn.disabled = true;
      var timer = setInterval(function () {
        btn.textContent = n + 's';
        if (--n < 0) { clearInterval(timer); btn.textContent = '重新获取'; btn.disabled = false; }
      }, 1000);
    }

    function setCloudStatus(t) {
      var n = cloudBox.querySelector('.sm-cloud-status');
      if (n) n.textContent = t;
    }

    function renderCloud() {
      cloudBox.innerHTML = '';
      if (!cloudReady()) {
        cloudBox.innerHTML = '<div class="sm-state">云同步未就绪（SDK 未加载），收藏仍保存在本机。</div>';
        return;
      }
      if (cloudUser) renderSignedIn();
      else renderAuth();
    }

    /* ------------------------------------------------------------ 已登录态 */
    function renderSignedIn() {
      var who = cloudUser.email || cloudUser.phone || '已登录';
      var box = el('div', 'sm-state');
      box.innerHTML = '<b>☁ ' + escapeHtml(who) + '</b>' +
        '<div class="sm-cloud-status" style="margin-top:2px">已登录 · 收藏自动云端同步</div>';
      cloudBox.appendChild(box);

      var rowBtns = el('div', 'sm-row');
      var bSync = el('button', 'sm-btn ghost', '立即同步');
      var bOut = el('button', 'sm-btn ghost', '退出登录');
      bSync.addEventListener('click', function () { syncNow(bSync); });
      bOut.addEventListener('click', async function () {
        try { await cloudClient.auth.signOut(); } catch (e) { /* ignore */ }
        cloudUser = null; pendingOtp = null;
        renderCloud();
        toast('已退出登录（收藏保留在本机）');
      });
      rowBtns.appendChild(bSync);
      rowBtns.appendChild(bOut);
      cloudBox.appendChild(rowBtns);

      cloudBox.appendChild(el('div', 'sm-hr'));
      cloudBox.appendChild(el('div', 'sm-label', '通行密钥 · 免验证码登录'));
      var pkWrap = el('div', '');
      cloudBox.appendChild(pkWrap);

      var bAdd = el('button', 'sm-btn ghost', '添加通行密钥');
      bAdd.style.marginTop = '8px';
      bAdd.addEventListener('click', async function () {
        if (!passkeySupported()) { toast('当前浏览器不支持通行密钥'); return; }
        var label = window.prompt('给这个通行密钥起个名字（例如：MacBook 触控 ID）', '本机通行密钥');
        if (label === null) return;
        bAdd.disabled = true; bAdd.textContent = '等待系统验证…';
        try {
          await addPasskey((label || '').trim() || '本机通行密钥');
          toast('通行密钥已绑定，下次可免验证码登录');
          renderPasskeyList(pkWrap);
        } catch (e) {
          var msg = String(e.message || e);
          if (/NotAllowed|abort/i.test(msg)) msg = '已取消或验证超时';
          toast('绑定失败：' + msg);
        }
        bAdd.disabled = false; bAdd.textContent = '添加通行密钥';
      });
      cloudBox.appendChild(bAdd);
      cloudBox.appendChild(el('div', 'sm-note',
        '通行密钥保存在你的设备（触控 ID / Windows Hello / 手机指纹）里，站点只保存公钥。' +
        '绑定后可在登录页用「通行密钥」一键进入，不必再等短信或邮件验证码。'));

      renderPasskeyList(pkWrap);
    }

    async function renderPasskeyList(wrap) {
      wrap.innerHTML = '<div class="sm-empty">读取中…</div>';
      var items = [];
      try {
        var r = await apiPost('/api/passkey/list', {});
        items = r.items || [];
      } catch (e) {
        wrap.innerHTML = '<div class="sm-empty">通行密钥列表读取失败（可稍后重试）</div>';
        return;
      }
      if (!items.length) {
        wrap.innerHTML = '<div class="sm-empty">还没有绑定通行密钥。</div>';
        return;
      }
      wrap.innerHTML = '';
      var list = el('div', 'sm-list');
      items.forEach(function (it) {
        var n = el('div', 'sm-item sm-pk');
        n.innerHTML = '<div class="t">🔑 ' + escapeHtml(it.label || '通行密钥') + '</div>' +
          '<div class="m">' + (it.hasSession ? '可免验证码登录' : '需先用验证码登录一次') +
          ' · ' + new Date(it.createdAt).toLocaleDateString() + '</div>';
        var del = el('button', 'sm-del', '×');
        del.title = '删除';
        del.addEventListener('click', async function (e) {
          e.stopPropagation();
          try {
            await apiPost('/api/passkey/delete', { id: it.id });
            try { await cloudClient.database.from('sweb_passkeys').delete().eq('credential_id', it.id); } catch (e2) { /* ignore */ }
            toast('已删除该通行密钥');
            renderPasskeyList(wrap);
          } catch (e3) { toast('删除失败：' + e3.message); }
        });
        n.appendChild(del);
        list.appendChild(n);
      });
      wrap.appendChild(list);
    }

    /* -------------------------------------------------------------- 未登录态 */
    function renderAuth() {
      var head = el('div', 'sm-state');
      head.innerHTML = '<b>☁ 登录 / 注册</b><div class="sm-cloud-status" style="margin-top:2px">' +
        '手机号或邮箱验证码 · 也可用通行密钥</div>';
      cloudBox.appendChild(head);

      var tabs = el('div', 'sm-tabs');
      var panes = el('div', '');
      [['phone', '手机号'], ['email', '邮箱'], ['passkey', '通行密钥']].forEach(function (t) {
        var b = el('button', 'sm-tab' + (authState.tab === t[0] ? ' active' : ''), t[1]);
        b.type = 'button';
        b.addEventListener('click', function () {
          authState.tab = t[0];
          renderCloud();
        });
        tabs.appendChild(b);
      });
      cloudBox.appendChild(tabs);
      cloudBox.appendChild(panes);

      if (authState.tab === 'phone') panes.appendChild(phonePane());
      else if (authState.tab === 'email') panes.appendChild(emailPane());
      else panes.appendChild(passkeyPane());
    }

    function phonePane() {
      var wrap = el('div', 'sm-pane');
      var phone = mkInput('手机号（11 位，如 13800138000）', 'tel');
      phone.value = authState.phone.value || '';
      phone.autocomplete = 'tel';
      wrap.appendChild(phone);

      var row = codeRow('短信验证码', async function (code, btn) {
        var v = (phone.value || '').replace(/\s/g, '');
        if (!/^1\d{10}$/.test(v)) { toast('请填写 11 位大陆手机号'); return; }
        btn.disabled = true; btn.textContent = '发送中…';
        try {
          var sent = await cloudClient.auth.sendOtp({ phone: v });
          if (sent.error) { toast('发送失败：' + sent.error.message); btn.disabled = false; btn.textContent = '获取验证码'; return; }
          authState.phone = { value: v, verificationId: sent.data.verificationId, isExistingUser: !!sent.data.isExistingUser };
          toast(sent.data.isExistingUser ? '验证码已发送，注意短信' : '验证码已发送，该号码将注册新账号');
          countdown(btn);
        } catch (e) { toast('发送失败：' + e.message); btn.disabled = false; btn.textContent = '获取验证码'; }
      });
      wrap.appendChild(row);

      var go = el('button', 'sm-btn', '登录 / 注册');
      go.style.marginTop = '10px';
      go.addEventListener('click', async function () {
        var v = (phone.value || '').replace(/\s/g, '');
        var code = (row.querySelector('.sm-input').value || '').trim();
        if (!authState.phone.verificationId || authState.phone.value !== v) { toast('请先获取短信验证码'); return; }
        if (!/^\d{4,8}$/.test(code)) { toast('请填写收到的验证码'); return; }
        go.disabled = true; go.textContent = '验证中…';
        try {
          var done = await cloudClient.auth.verifyOtp({
            phone: v, verificationId: authState.phone.verificationId,
            isExistingUser: authState.phone.isExistingUser, token: code
          });
          if (done.error) { toast('验证失败：' + done.error.message); }
          else {
            cloudUser = (done.data && done.data.user) || { phone: v };
            toast('登录成功，正在同步…');
            renderCloud();
            afterSignIn(authState.phone.isExistingUser ? '' : '', v);
          }
        } catch (e) { toast('验证失败：' + e.message); }
        go.disabled = false; go.textContent = '登录 / 注册';
      });
      wrap.appendChild(go);
      wrap.appendChild(el('div', 'sm-note',
        '未注册的手机号会直接创建账号。收藏记录按账号隔离；想跨设备找回，可在登录后绑定邮箱。'));
      return wrap;
    }

    function emailPane() {
      var wrap = el('div', 'sm-pane');
      var email = mkInput('邮箱，如 me@example.com', 'email');
      email.value = authState.email.value || '';
      email.autocomplete = 'email';
      wrap.appendChild(email);

      var row = codeRow('邮件验证码', async function (code, btn) {
        var v = (email.value || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast('请填写正确的邮箱'); return; }
        btn.disabled = true; btn.textContent = '发送中…';
        try {
          var sent = await cloudClient.auth.sendOtp({ email: v });
          if (sent.error) { toast('发送失败：' + sent.error.message); btn.disabled = false; btn.textContent = '获取验证码'; return; }
          authState.email = { value: v, verificationId: sent.data.verificationId, isExistingUser: !!sent.data.isExistingUser, token: null };
          toast(sent.data.isExistingUser ? '验证码已发送到邮箱' : '验证码已发送；新邮箱注册还需绑定手机号');
          countdown(btn);
        } catch (e) { toast('发送失败：' + e.message); btn.disabled = false; btn.textContent = '获取验证码'; }
      });
      wrap.appendChild(row);

      var go = el('button', 'sm-btn', '登录 / 注册');
      go.style.marginTop = '10px';
      wrap.appendChild(go);

      /* 新邮箱注册的第二步：绑定手机 */
      var step2 = el('div', 'sm-pane');
      step2.style.display = 'none';
      step2.innerHTML = '<div class="sm-label">绑定手机号（邮箱注册必填）</div>';
      var phone = mkInput('手机号（11 位）', 'tel');
      phone.autocomplete = 'tel';
      step2.appendChild(phone);
      var s2state = { verificationId: '' };
      var row2 = codeRow('短信验证码', async function (code, btn) {
        var v = (phone.value || '').replace(/\s/g, '');
        if (!/^1\d{10}$/.test(v)) { toast('请填写 11 位大陆手机号'); return; }
        btn.disabled = true; btn.textContent = '发送中…';
        try {
          var sent = await cloudClient.auth.sendOtp({ phone: v });
          if (sent.error) { toast('发送失败：' + sent.error.message); btn.disabled = false; btn.textContent = '获取验证码'; return; }
          s2state.verificationId = sent.data.verificationId;
          s2state.phone = v;
          toast('验证码已发送到手机');
          countdown(btn);
        } catch (e) { toast('发送失败：' + e.message); btn.disabled = false; btn.textContent = '获取验证码'; }
      });
      step2.appendChild(row2);
      var finish = el('button', 'sm-btn', '完成注册');
      finish.style.marginTop = '10px';
      step2.appendChild(finish);
      wrap.appendChild(step2);

      go.addEventListener('click', async function () {
        var v = (email.value || '').trim();
        var code = (row.querySelector('.sm-input').value || '').trim();
        if (!authState.email.verificationId || authState.email.value !== v) { toast('请先获取邮件验证码'); return; }
        if (!/^\d{4,8}$/.test(code)) { toast('请填写邮箱收到的验证码'); return; }

        if (authState.email.isExistingUser) {
          go.disabled = true; go.textContent = '登录中…';
          try {
            var done = await cloudClient.auth.verifyOtp({
              email: v, verificationId: authState.email.verificationId,
              isExistingUser: true, token: code
            });
            if (done.error) toast('登录失败：' + done.error.message);
            else {
              cloudUser = (done.data && done.data.user) || { email: v };
              toast('登录成功，正在同步…');
              renderCloud();
              afterSignIn(v, '');
            }
          } catch (e) { toast('登录失败：' + e.message); }
          go.disabled = false; go.textContent = '登录 / 注册';
          return;
        }

        /* 新邮箱：先只校验验证码（不建号），再要求绑定手机 */
        go.disabled = true; go.textContent = '校验中…';
        try {
          authState.email.token = await verifyOnly(authState.email.verificationId, code);
          toast('邮箱已验证，请继续绑定手机号');
          step2.style.display = '';
          go.textContent = '邮箱已验证 ✓';
          go.disabled = true;
        } catch (e) {
          toast('邮箱验证失败：' + e.message);
          go.disabled = false; go.textContent = '登录 / 注册';
        }
      });

      finish.addEventListener('click', async function () {
        var v = (email.value || '').trim();
        var phoneVal = (phone.value || '').replace(/\s/g, '');
        var code2 = (row2.querySelector('.sm-input').value || '').trim();
        if (!s2state.verificationId || s2state.phone !== phoneVal) { toast('请先获取短信验证码'); return; }
        if (!/^\d{4,8}$/.test(code2)) { toast('请填写短信验证码'); return; }
        finish.disabled = true; finish.textContent = '校验手机号…';
        try {
          await verifyOnly(s2state.verificationId, code2);
        } catch (e) {
          toast('手机验证失败：' + e.message);
          finish.disabled = false; finish.textContent = '完成注册';
          return;
        }
        finish.textContent = '创建账号…';
        try {
          var up = await cloudClient.auth.signUp({ email: v, verificationToken: authState.email.token });
          if (up.error) { toast('注册失败：' + up.error.message); finish.disabled = false; finish.textContent = '完成注册'; return; }
          cloudUser = (up.data && up.data.user) || { email: v };
          toast('注册成功，已绑定手机号');
          renderCloud();
          afterSignIn(v, phoneVal);
        } catch (e) {
          toast('注册失败：' + e.message);
          finish.disabled = false; finish.textContent = '完成注册';
        }
      });

      wrap.appendChild(el('div', 'sm-note',
        '邮箱注册必须绑定并验证手机号：邮箱验证码 + 短信验证码都通过，才会创建账号。' +
        '之后可在此设备绑定通行密钥，实现免验证码登录。'));
      return wrap;
    }

    function passkeyPane() {
      var wrap = el('div', 'sm-pane');
      if (!passkeySupported()) {
        wrap.innerHTML = '<div class="sm-empty">当前浏览器不支持通行密钥（需要 HTTPS 与较新的浏览器）。</div>';
        return wrap;
      }
      var go = el('button', 'sm-btn', '用通行密钥登录');
      go.addEventListener('click', async function () {
        go.disabled = true; go.textContent = '等待系统验证…';
        try {
          await loginWithPasskey();
          toast('已通过通行密钥登录');
          renderCloud();
        } catch (e) {
          var msg = String(e.message || e);
          if (/NotAllowed|abort/i.test(msg)) msg = '已取消或验证超时';
          toast('登录失败：' + msg);
        }
        go.disabled = false; go.textContent = '用通行密钥登录';
      });
      wrap.appendChild(go);
      wrap.appendChild(el('div', 'sm-note',
        '点击后系统会弹出触控 ID / Windows Hello / 手机指纹。' +
        '通行密钥需先在已登录状态下绑定；若提示没有可恢复的凭据，请先用验证码登录一次。'));
      return wrap;
    }

    /* 登录/注册成功后的收尾：写档案、同步收藏、刷新通行密钥会话 */
    async function afterSignIn(email, phone) {
      try {
        if (email || phone) {
          await cloudClient.database.from('sweb_profiles').insert([{
            email: email || null, phone: phone || null,
            email_verified: !!email, phone_verified: !!phone
          }]);
        }
      } catch (e) { /* 已存在档案或网络抖动，忽略 */ }
      if (phone) {
        try { await cloudClient.database.from('sweb_phone_claims').insert([{ phone: phone }]); }
        catch (e) { toast('提示：该手机号已被其他账号绑定过'); }
      }
      syncNow(null);
      refreshPasskeySession();
    }

    function onCloudSignedIn() {
      renderCloud();
      syncNow(null);
      refreshPasskeySession();
    }
    window.__smCloudStatus = setCloudStatus;

    function renderState() {
      var v = captureView();
      if (!v) { state.innerHTML = '星图还在加载，稍等一下…'; return; }
      state.innerHTML = '<b>' + Number(v.alt).toFixed(1) + '°</b> 高度 · ' +
        '<b>' + Number(v.az).toFixed(1) + '°</b> 方位 · 视场 <b>' + Number(v.fov).toFixed(1) + '°</b><br>' +
        '纬度 ' + v.lat + ' · 经度 ' + v.lng + ' · 海拔 ' + v.elev + ' 米';
    }

    function renderList() {
      listRefresher = renderList;
      var list = loadPlaces();
      listWrap.innerHTML = '';
      if (!list.length) {
        listWrap.appendChild(el('div', 'sm-empty', '还没有记录。调好视角后点上面的「保存当前视角」。'));
        return;
      }
      var box = el('div', 'sm-list');
      list.slice().reverse().forEach(function (p) {
        var it = el('div', 'sm-item');
        var t = new Date(p.ts);
        it.innerHTML = '<div class="t">' + escapeHtml(p.name) + '</div>' +
          '<div class="m">' + (p.alt != null ? Number(p.alt).toFixed(1) + '° 高度 · ' : '') +
          '视场 ' + Number(p.fov).toFixed(1) + '° · ' + fmtTime(t) + '</div>';
        it.addEventListener('click', function () { location.href = p.url; });
        var del = el('button', 'sm-del', '×');
        del.title = '删除';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          var rest = loadPlaces().filter(function (x) { return x.id !== p.id; });
          savePlaces(rest);
          renderList();
          cloudRemovePlace(p.id);
          toast('已删除');
        });
        it.appendChild(del);
        box.appendChild(it);
      });
      listWrap.appendChild(box);
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function fmtTime(d) {
      function p(n) { return n < 10 ? '0' + n : n; }
      return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    btnSave.addEventListener('click', function () {
      var v = captureView();
      if (!v) { toast('星图尚未就绪'); return; }
      var name = prompt('给这个视角起个名字（例如：猎户座 · 阳台）', '观测点 ' +
        (new Date().getMonth() + 1) + '/' + new Date().getDate() + ' ' + fmtTime(new Date()));
      if (name === null) return;
      var list = loadPlaces();
      list.push({
        id: 'p' + Date.now().toString(36),
        name: (name || '').trim() || '未命名视角',
        url: viewToUrl(v), fov: v.fov, lat: v.lat, lng: v.lng, elev: v.elev,
        az: v.az, alt: v.alt, date: v.date, ts: Date.now()
      });
      savePlaces(list);
      renderList();
      cloudPushPlace(list[list.length - 1]);
      toast('已保存' + (cloudUser ? '，已同步到云端' : ''));
    });

    btnCopy.addEventListener('click', function () {
      var v = captureView();
      if (!v) { toast('星图尚未就绪'); return; }
      copyText(viewToUrl(v), function (ok) { toast(ok ? '分享链接已复制' : '复制失败，请手动复制'); });
    });

    btnExport.addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(loadPlaces(), null, 2)], { type: 'application/json' });
      var a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'stellarium-web-places.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      toast('已导出 JSON');
    });

    btnImport.addEventListener('click', function () {
      var inp = el('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var incoming = JSON.parse(fr.result);
            if (!Array.isArray(incoming)) throw new Error('bad');
            var list = loadPlaces();
            var have = {};
            list.forEach(function (x) { have[x.id] = 1; });
            var n = 0;
            incoming.forEach(function (p) {
              if (!p || !p.url) return;
              if (!p.id) p.id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
              if (have[p.id]) return;
              list.push(p); n++;
            });
            savePlaces(list);
            renderList();
            toast('已导入 ' + n + ' 条');
          } catch (e) { toast('文件格式不对'); }
        };
        fr.readAsText(f);
      });
      inp.click();
    });

    function open() {
      panel.classList.add('open');
      renderState();
      renderList();
      renderCloud();
    }
    function close() { panel.classList.remove('open'); }

    fab.addEventListener('click', function () {
      if (panel.classList.contains('open')) close(); else open();
    });
    panel.querySelector('#sm-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    setInterval(function () {
      if (panel.classList.contains('open')) renderState();
    }, 1500);
  }

  /* --------------------------------------------------------------- 语言开关 */
  function buildLangToggle() {
    var b = document.getElementById('mirror-badge');
    if (!b) return;
    var btn = el('button', '', wantZh ? 'EN' : '中文');
    btn.id = 'mirror-lang';
    btn.title = wantZh ? 'Switch to English' : '切换为中文';
    btn.style.cssText = 'position:absolute;left:8px;top:1px;background:none;border:0;' +
      'color:#8fc0ff;font:11px/1 inherit;cursor:pointer;padding:4px;';
    btn.addEventListener('click', function () {
      var v = captureView();
      if (wantZh) {
        // 切回英文：中文文案已直接写进 DOM，最干净的办法是原视角重载
        localStorage.setItem(LANG_KEY, 'en');
        location.href = v ? viewToUrl(v) : location.href;
        return;
      }
      wantZh = true;
      localStorage.setItem(LANG_KEY, 'zh-CN');
      installZh(false);
      var i18n = i18nInstance();
      if (i18n) setLocale(i18n, 'zh-CN');
      document.documentElement.lang = 'zh-CN';
      btn.textContent = 'EN';
      translateDom(document.getElementById('app'));
      toast('已切换为中文');
    });
    b.appendChild(btn);
  }

  /* ------------------------------------------------------------------ 启动 */
  function boot() {
    bootstrapLang();
    buildLangToggle();
    buildPanel();
    watchDom();
    restoreSession();
    console.log('%c星象仪网页版增强层已载入 %c中文界面 · 视角分享 · 通行密钥 · 云同步',
      'color:#8fc0ff;font-weight:bold', 'color:#8899aa');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
