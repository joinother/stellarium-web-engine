/*
 * 星象仪网页版（Stellarium Web 国内镜像）· 增强层
 *
 * 原则：所有界面一律复用原版 Vuetify 的组件结构与样式类（v-dialog / v-card /
 * v-btn / v-list-item / v-tabs / v-snackbar / v-field），入口做进原版左侧菜单与
 * 显示设置对话框里，不另画一套自绘 UI。
 *
 * 功能：
 *   1) 界面中文化（向 vue-i18n 注入 zh-CN 词表 + DOM 兜底）
 *   2) 当前视角 → 可分享链接
 *   3) 我的星图：观测点收藏（本机 + 登录云同步）
 *   4) 自家账号：手机号 / 邮箱（验证码或密码）/ 通行密钥 / 第三方；未绑手机强制绑定
 *   5) 账号设置：手机号 / 邮箱 / 密码 / 通行密钥 / 第三方 / 昵称
 */
(function () {
  'use strict';

  var STORE_KEY = 'sweb-mirror-places-v1';
  var LANG_KEY = 'sweb-mirror-lang';

  var CLOUD = {
    endpoint: 'https://stellarium-web-cn.app.workbuddy.host',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_9t6FrPA3X0La8ej8Er0qOS_JbUC6UgrcfVY1TbJJnI8wfeSqynu0OQW',
    table: 'sky_places'
  };
  var cloudClient = null;
  var cloudUser = null;
  var acctProfile = null;
  var acctHasPassword = false;
  var listRefresher = null;

  /* ================================================================ 中文词表 */
  var ZH = {
    'About': '关于', 'Privacy': '隐私', 'Data Credits': '数据来源',
    'Search...': '搜索天体…', 'Observe': '观测', 'Constellations': '星座',
    'Constellations Art': '星座图绘', 'Atmosphere': '大气', 'Landscape': '地景',
    'Azimuthal Grid': '地平网格', 'Equatorial Grid': '赤道网格',
    'Deep Sky Objects': '深空天体', 'Night Mode': '夜间模式', 'Fullscreen': '全屏',
    'Could not show the Online Star Map': '无法显示在线星图',
    'It seems that your browser cannot load Web Assembly!': '你的浏览器似乎无法加载 WebAssembly！',
    'Web assembly is necessary for Stellarium Web to display the star map. Please upgrade your web browser and try again!':
      'Stellarium Web 需要 WebAssembly 才能绘制星图，请升级浏览器后重试。',
    'desktop version': '桌面版', 'Use Autolocation': '自动定位', 'My Locations': '我的地点',
    'Use this location': '使用此位置', 'Unknown Address': '未知地点',
    'Lat {0}° Lon {1}°': '纬度 {0}° 经度 {1}°', 'Unknown': '未知', 'Near {0}': '靠近 {0}',
    'Magnitude': '星等', 'Distance': '距离', 'Radius': '半径', 'Spectral Type': '光谱型',
    'Size': '大小', 'Ra/Dec': '赤经/赤纬', 'Az/Alt': '方位/高度', 'Phase': '相位',
    'Not visible tonight': '今夜不可见', 'Always visible tonight': '今夜整夜可见',
    'Rise: {0}&nbsp;&nbsp;&nbsp; Set: {1}': '升起：{0}&nbsp;&nbsp;&nbsp; 落下：{1}',
    'Visibility': '可见性', 'Meridian Line': '子午线', 'Ecliptic Line': '黄道线',
    'Dark night': '天文暗夜', 'Moonlight': '月光', 'Dawn': '曙光', 'Daylight': '白昼',
    'Sign in to your Stellarium account': '登录星象仪账号',
    'No account yet?': '还没有账号？', 'Create a Stellarium account': '注册星象仪账号',
    'Thanks for signing up!': '注册成功，感谢支持！',
    'Deleting your Stellarium account is permanent and cannot be undone.': '注销账号不可恢复，请谨慎操作。',
    'Use your Stellarium account to': '使用星象仪账号可以',
    'Sign in': '登录', 'Sign out': '退出登录', 'Tonight': '今晚', 'Sunset': '日落',
    'Sunrise': '日出', 'Solar System': '太阳系', 'current location': '当前位置',
    'No planet is visible tonight': '今晚没有可见行星', 'No night': '无极夜', 'Delete': '删除',
    'Observing setup': '观测器材', 'Instrument': '主镜', 'Accessories': '附件',
    'New instrument': '新建器材', 'None': '无', 'New {0}...': '新建 {0}…', 'Manufacturer': '厂商',
    'Model': '型号', 'Back': '返回', 'Cancel': '取消', 'Edit': '编辑', 'The unaided eye': '肉眼',
    'Generic': '通用', 'Focal Length': '焦距', 'Apparent Field of View': '表观视场',
    'Diameter': '口径', 'Barlow / Reducer': '巴洛镜 / 减焦镜', 'Rotation': '旋转',
    'Equatorial Mount': '赤道仪', 'Camera Body': '相机机身', 'Multiplier': '倍率',
    'Magnification': '放大倍数', 'Real Field of View': '实际视场',
    'or Meters @ 1000m': '或米 @ 1000 米', 'Width': '宽', 'Height': '高', 'Resolution': '分辨率',
    'Pixel Size': '像元大小', 'Sensor Size': '传感器尺寸',
    'From the camera database': '取自相机数据库', 'Search a camera': '搜索相机',
    'No camera found': '未找到相机', 'FOV': '视场', 'Shape': '形状', 'Telrad': 'Telrad 寻星环',
    'Cross Reticle': '十字分划', 'Archive': '归档', 'Could not save the equipment': '无法保存器材',
    'Could not delete the equipment': '无法删除器材', 'Field of View': '视场',
    'Exit Pupil': '出瞳直径', 'Focal Ratio': '焦比', 'pixel': '像素', 'mm': '毫米', 'px': '像素',
    'Naked Eye': '肉眼', 'Binoculars': '双筒镜', 'Telescope': '望远镜', 'Camera': '相机',
    'Finder': '寻星镜', 'Circle': '圆形', 'Rectangle': '矩形', 'Eyepiece': '目镜',
    'Barlow': '巴洛镜', 'Sensor': '传感器', 'View Settings': '显示设置',
    'My Observations': '我的观测', 'Calendar': '日历', 'Stellarium App': '星象仪 App',
    'I Agree': '我同意', 'My equipment': '我的器材', 'Reset view': '重置视角',
    'Web': '网页版', 'Stellarium': '星象仪', 'Stars': '恒星', 'Menu': '菜单',
    'Privacy Policy': '隐私政策',

    /* ---- 上一轮巡检补译 ---- */
    'App': '网页版', 'Back to the menu': '返回菜单', 'milkyway': '银河',
    'Calendar of events': '天象日历',
    'Observation Log Book': '观测日志本',
    'Record and browse your observations': '记录并浏览你的观测记录',
    'Keep your lists of objects on all your devices': '在所有设备上保存你的天体清单',
    'More feature coming soon (sharing, downloading your data, etc..)': '更多功能即将上线（分享、导出数据等）',
    'You need to be signed in to use these features': '登录后才能使用这些功能',
    'Sign In': '登录', 'Sign Up': '注册', 'Create an account': '创建账号',
    'Email': '邮箱', 'Email address': '邮箱地址', 'Password': '密码',
    'Confirm Password': '确认密码', 'Forgot password?': '忘记密码？',
    'Remember me': '记住我', 'Submit': '提交', 'Save': '保存', 'Close': '关闭',
    'Loading...': '加载中…', 'Loading': '加载中', 'Error': '出错', 'Retry': '重试',
    'Username': '用户名', 'Nickname': '昵称', 'First Name': '名', 'Last Name': '姓',
    'Send': '发送', 'Verify': '验证', 'Verification code': '验证码',
    'Resend': '重新发送', 'Continue': '继续', 'Next': '下一步', 'Previous': '上一步',
    'Yes': '是', 'No': '否', 'OK': '好', 'Done': '完成', 'Add': '添加', 'Remove': '移除',
    'Not now': '以后再说', 'Later': '稍后', 'Help': '帮助', 'Language': '语言',
    'Location': '地点', 'Date': '日期', 'Time': '时间', 'More': '更多', 'Less': '收起',
    'Share': '分享', 'Copy': '复制', 'Copied': '已复制', 'Download': '下载',
    'Terms of Service': '服务条款', 'Sign in with': '使用以下方式登录',
    'This site uses cookies. By continuing to browse the site you are agreeing to our use of cookies. Check our ':
      '本网站使用 Cookie。继续使用本网站即表示你同意我们使用 Cookie。详见',

    /* ---- 天体名 ---- */
    'Sun': '太阳', 'Moon': '月球', 'Mercury': '水星', 'Venus': '金星', 'Earth': '地球',
    'Mars': '火星', 'Jupiter': '木星', 'Saturn': '土星', 'Uranus': '天王星', 'Neptune': '海王星',
    'Pluto': '冥王星', 'Ceres': '谷神星', 'Pallas': '智神星', 'Juno': '婚神星', 'Vesta': '灶神星',
    'Antares': '心宿二', 'Regulus': '轩辕十四', 'Pollux': '北河三', 'Castor': '北河二',
    'Aldebaran': '毕宿五', 'Spica': '角宿一', 'Sirius': '天狼星', 'Vega': '织女星',
    'Arcturus': '大角星', 'Rigel': '参宿七', 'Betelgeuse': '参宿四', 'Polaris': '北极星',
    'Andromeda Galaxy': '仙女座星系', 'Orion Nebula': '猎户座大星云',

    /* ---- 月相与流星雨 ---- */
    'New Moon': '新月', 'Full Moon': '满月',
    'First Quarter Moon': '上弦月', 'Last Quarter Moon': '下弦月',
    'Waxing Crescent': '蛾眉月', 'Waning Crescent': '残月',
    'Waxing Gibbous': '盈凸月', 'Waning Gibbous': '亏凸月',
    'Draconids': '天龙座流星雨', 'Orionids': '猎户座流星雨',
    'Southern Taurids': '南金牛座流星雨', 'Northern Taurids': '北金牛座流星雨',
    'Perseids': '英仙座流星雨', 'Geminids': '双子座流星雨',
    'Quadrantids': '象限仪座流星雨', 'Lyrids': '天琴座流星雨',
    'Leonids': '狮子座流星雨', 'Eta Aquariids': '宝瓶座η流星雨',
    'Solar Eclipse': '日食', 'Lunar Eclipse': '月食',
    'Moon Occultation': '月掩星', 'Planetary Conjunction': '行星相合',

    /* ---- 月份 ---- */
    'January': '1 月', 'February': '2 月', 'March': '3 月', 'April': '4 月',
    'May': '5 月', 'June': '6 月', 'July': '7 月', 'August': '8 月',
    'September': '9 月', 'October': '10 月', 'November': '11 月', 'December': '12 月'
  };

  /* 组合式短语：'The Moon and Mars' / 'Saturn at Opposition' 之类 */
  var TOKENS = {};
  (function () {
    ['Sun', 'Moon', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune',
      'Pluto', 'Ceres', 'Pallas', 'Juno', 'Vesta', 'Antares', 'Regulus', 'Pollux', 'Castor',
      'Aldebaran', 'Spica', 'Sirius', 'Vega', 'Arcturus', 'Rigel', 'Betelgeuse', 'Polaris'
    ].forEach(function (k) { TOKENS[k] = ZH[k]; });
  })();

  var MONTHS = {
    January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
    July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
  };

  function tokName(s) { return TOKENS[s] || s; }

  // 组合短语翻译，返回 null 表示无法处理
  function translatePhrase(s) {
    var m;
    // 'October 03, 21:25' → '10 月 03 日 21:25'
    if ((m = /^([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{1,2}:\d{2})$/.exec(s)) && MONTHS[m[1]]) {
      return MONTHS[m[1]] + ' 月 ' + m[2] + ' 日 ' + m[3];
    }
    if ((m = /^([A-Z][a-z]+)\s+(\d{1,2})$/.exec(s)) && MONTHS[m[1]]) {
      return MONTHS[m[1]] + ' 月 ' + m[2] + ' 日';
    }
    // 'The Moon and Mars' / 'Moon and Venus'
    if ((m = /^(?:The\s+)?(.+?)\s+and\s+(.+)$/.exec(s))) {
      var a = tokName(m[1]), b2 = tokName(m[2]);
      if (a !== m[1] || b2 !== m[2]) return a + '与' + b2;
    }
    // 'Saturn at Opposition'
    if ((m = /^(.+?)\s+at\s+Opposition$/.exec(s))) return tokName(m[1]) + '冲日';
    if ((m = /^(.+?)\s+at\s+Conjunction$/.exec(s))) return tokName(m[1]) + '合日';
    if ((m = /^(.+?)\s+Greatest\s+Elongation$/.exec(s))) return tokName(m[1]) + '大距';
    if ((m = /^(.+?)\s+at\s+Perihelion$/.exec(s))) return tokName(m[1]) + '近日点';
    if ((m = /^(.+?)\s+at\s+Aphelion$/.exec(s))) return tokName(m[1]) + '远日点';
    if ((m = /^(.+?)\s+Meteor\s+Shower$/.exec(s))) return tokName(m[1]) + '流星雨';
    return null;
  }

  /* ============================================================ 翻译注入 */
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
    return 'en';
  }

  function setLocale(i18n, lang) {
    var g = i18n.global || i18n;
    if (g.locale && typeof g.locale === 'object' && 'value' in g.locale) { g.locale.value = lang; return; }
    if (typeof g.locale === 'string') g.locale = lang;
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
        var cur = currentLocale(i18n);
        if (cur !== 'zh-CN' && cur !== 'zh') setLocale(i18n, 'zh-CN');
      }
    } catch (e) { return false; }
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
    setInterval(function () { if (wantZh) installZh(true); }, 2000);
  }

  /* ------------------------------------------------ DOM 兜底翻译（静态文案） */
  var SKIP_SEL = '.sm-overlay, .sm-snack';
  // 原文里有些静态文案带首尾空格（例如 Cookie 提示条），统一按 trim 后的文本匹配
  var REV = (function () { var m = {}; for (var k in ZH) { var t = k.trim(); if (t) m[t] = ZH[k]; } return m; })();

  function inSkip(node) {
    var e = node.nodeType === 1 ? node : node.parentNode;
    try { return !!(e && e.closest && e.closest(SKIP_SEL)); } catch (err) { return false; }
  }

  function translateText(t) {
    var s = t.nodeValue;
    if (!s) return;
    var trimmed = s.trim();
    if (!trimmed || trimmed.length > 260) return;
    if (/[\u4e00-\u9fff]/.test(trimmed)) return;
    if (REV[trimmed]) { t.nodeValue = s.replace(trimmed, REV[trimmed]); return; }
    var m = /^FOV\s+([\d.]+)\s*°$/.exec(trimmed);
    if (m) { t.nodeValue = s.replace(trimmed, '视场 ' + m[1] + '°'); return; }
    // 组合短语（月相、行星冲日、流星雨、日期…）
    var ph = translatePhrase(trimmed);
    if (ph) t.nodeValue = s.replace(trimmed, ph);
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
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    [600, 1600, 3200, 5500, 9000].forEach(function (d) {
      setTimeout(function () { translateDom(document.body); }, d);
    });
  }

  /* ============================================================ Vuetify 部件 */
  function m(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 按钮：v-btn 结构 */
  function vBtn(text, variant, onClick) {
    var cls = 'v-btn v-theme--dark v-btn--density-default v-btn--size-default ';
    if (variant === 'text') cls += 'v-btn--variant-text';
    else if (variant === 'tonal') cls += 'v-btn--variant-tonal v-btn--elevated';
    else if (variant === 'plain') cls += 'v-btn--variant-plain';
    else cls += 'v-btn--variant-elevated v-btn--elevated';
    var b = m('button', cls,
      '<span class="v-btn__overlay"></span><span class="v-btn__underlay"></span>' +
      '<span class="v-btn__content">' + esc(text) + '</span>');
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function vIconBtn(icon, onClick) {
    var b = m('button', 'v-btn v-theme--dark v-btn--icon v-btn--density-default v-btn--size-default v-btn--variant-plain',
      '<span class="v-btn__overlay"></span><span class="v-btn__underlay"></span>' +
      '<span class="v-btn__content"><i class="' + icon + ' mdi v-icon notranslate v-theme--dark v-icon--size-default"></i></span>');
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  /** 输入框：v-input / v-field / v-field__input（原版文本框结构） */
  function vField(placeholder, type, autocomplete) {
    var w = m('div', 'v-input v-input--horizontal v-input--density-default v-text-field v-theme--dark');
    w.innerHTML =
      '<div class="v-input__control">' +
      '<div class="v-field v-theme--dark v-field--variant-filled v-field--single-line">' +
      '<div class="v-field__overlay"></div>' +
      '<div class="v-field__field">' +
      '<input class="v-field__input" type="' + (type || 'text') + '" placeholder="' + esc(placeholder) + '">' +
      '</div>' +
      '<div class="v-field__outline"></div>' +
      '</div></div>';
    var inp = w.querySelector('input');
    if (autocomplete) inp.setAttribute('autocomplete', autocomplete);
    if (type === 'tel') inp.inputMode = 'tel';
    w.getValue = function () { return inp.value || ''; };
    return w;
  }

  /** 分段选择（v-tabs 结构） */
  function vTabs(items, active, onSelect) {
    var wrap = m('div', 'v-tabs v-theme--dark v-tabs--horizontal sm-tabs');
    var container = m('div', 'v-slide-group__container');
    var content = m('div', 'v-slide-group__content');
    items.forEach(function (it) {
      var b = m('button', 'v-btn v-tab v-theme--dark v-btn--density-default v-btn--size-default v-btn--variant-text' +
        (it[0] === active ? ' v-tab--selected' : ''),
        '<span class="v-btn__overlay"></span><span class="v-btn__content">' + esc(it[1]) + '</span>' +
        (it[0] === active ? '<span class="v-tab__slider"></span>' : ''));
      b.type = 'button';
      b.addEventListener('click', function () { onSelect(it[0]); });
      content.appendChild(b);
    });
    container.appendChild(content);
    wrap.appendChild(container);
    return wrap;
  }

  /** 列表项（v-list-item 结构） */
  function vListItem(opts) {
    // asDiv：用于塞进原版 v-list-group 的分组（那里的条目是 div，不是 a）
    var a = opts.asDiv
      ? m('div', 'v-list-item v-list-item--link v-theme--dark v-list-item--density-compact ' +
        (opts.sub ? 'v-list-item--two-line' : 'v-list-item--one-line') + ' rounded-0 v-list-item--variant-text')
      : m('a', 'v-list-item v-list-item--link v-theme--dark v-list-item--density-default ' +
        (opts.sub ? 'v-list-item--two-line' : 'v-list-item--one-line') + ' rounded-0 v-list-item--variant-text');
    if (!opts.asDiv) a.href = 'javascript:void 0';
    if (opts.asDiv) a.setAttribute('role', 'listitem');
    var html = '<span class="v-list-item__overlay"></span><span class="v-list-item__underlay"></span>';
    if (opts.icon) {
      html += '<div class="v-list-item__prepend"><i class="' + opts.icon + ' mdi v-icon notranslate v-theme--dark v-icon--size-default"></i></div>';
    }
    html += '<div class="v-list-item__content"><div class="v-list-item-title">' + esc(opts.title) + '</div>' +
      (opts.sub ? '<div class="v-list-item-subtitle">' + esc(opts.sub) + '</div>' : '') + '</div>';
    if (opts.action) html += '<div class="v-list-item__append sm-append"></div>';
    a.innerHTML = html;
    if (opts.action) a.querySelector('.sm-append').appendChild(opts.action);
    if (opts.onClick) a.addEventListener('click', function (e) { e.preventDefault(); opts.onClick(); });
    return a;
  }

  function vList() { return m('div', 'v-list v-theme--dark bg-transparent v-list--density-default'); }

  /** 对话框（v-dialog + v-card 结构） */
  function vDialog(id, opts) {
    opts = opts || {};
    closeDialog(id);
    var ov = m('div', 'v-overlay v-overlay--active v-theme--dark v-locale--is-ltr v-dialog sm-overlay');
    ov.id = id;
    ov.style.zIndex = 2400;
    var scrim = m('div', 'v-overlay__scrim');
    var content = m('div', 'v-overlay__content');
    content.tabIndex = -1;
    content.style.maxWidth = opts.width || '420px';
    var card = m('div', 'v-card v-theme--dark bg-secondary v-card--density-default v-card--variant-flat');

    var titleRow = m('div', 'v-card-title text-h6 d-flex align-center justify-space-between ga-2');
    titleRow.appendChild(m('span', '', esc(opts.title || '')));
    if (!opts.blocking) titleRow.appendChild(vIconBtn('mdi-close', function () { closeDialog(id); }));
    card.appendChild(titleRow);

    var body = m('div', 'v-card-text');
    card.appendChild(body);

    content.appendChild(card);
    ov.appendChild(scrim);
    ov.appendChild(content);
    if (!opts.blocking) scrim.addEventListener('click', function () { closeDialog(id); });
    document.body.appendChild(ov);

    return {
      ov: ov, card: card, body: body,
      close: function () { closeDialog(id); },
      actions: function () {
        var act = m('div', 'v-card-actions');
        card.appendChild(act);
        return act;
      }
    };
  }

  function closeDialog(id) {
    var n = document.getElementById(id);
    if (n) n.remove();
  }

  /** 提示条（v-snackbar 结构） */
  function toast(msg) {
    var wrap = document.querySelector('.sm-snack');
    if (!wrap) {
      wrap = m('div', 'v-overlay v-overlay--active v-theme--dark v-locale--is-ltr v-snackbar v-snackbar--active v-snackbar--bottom sm-snack');
      wrap.style.zIndex = 2600;
      document.body.appendChild(wrap);
    }
    wrap.innerHTML = '<div class="v-overlay__content v-snackbar__wrapper v-theme--dark bg-secondary v-snackbar--variant-elevated">' +
      esc(msg) + '</div>';
    clearTimeout(wrap.__t);
    wrap.__t = setTimeout(function () { wrap.remove(); }, 2400);
  }

  function fmtErr(e, fallback) {
    var msg = String((e && e.message) || e || fallback);
    if (/NotAllowed|abort/i.test(msg)) msg = '已取消或验证超时';
    return msg;
  }

  /* ============================================================== 视角与链接 */
  function stelCore() {
    var s = window._stel;
    return s && (s.core || (s.$stel && s.$stel.core));
  }

  function mjdToDate(mjd) { return new Date((mjd + 2400000.5 - 2440587.5) * 86400000); }
  function isoUtc(d) { return d.toISOString().replace(/\.\d{3}Z$/, '+00:00'); }

  function captureView() {
    var c = stelCore();
    if (!c) return null;
    var r = Math.PI / 180;
    var view = {
      fov: (c.fov / r).toFixed(2), lat: (c.latitude / r).toFixed(2), lng: (c.longitude / r).toFixed(2),
      elev: Math.round(c.elevation || 0), az: (c.yaw / r).toFixed(2), alt: (c.pitch / r).toFixed(2), date: null
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
    var q = ['fov=' + v.fov, 'lat=' + v.lat, 'lng=' + v.lng, 'elev=' + v.elev,
      'az=' + v.az, 'alt=' + v.alt, 'date=' + encodeURIComponent(v.date)];
    return u.origin + u.pathname + '?' + q.join('&');
  }

  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else done(fallbackCopy(text));
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

  /* ================================================================= 本地收藏 */
  function loadPlaces() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
  }
  function savePlaces(list) { localStorage.setItem(STORE_KEY, JSON.stringify(list)); }

  /* =================================================================== 云同步 */
  function cloudReady() { return !!(window.WorkBuddyCloud && CLOUD.endpoint); }

  function initCloud() {
    if (!cloudReady() || cloudClient) return;
    try {
      cloudClient = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: CLOUD.endpoint,
        oauthRelayBaseUrl: CLOUD.oauthRelayBaseUrl,
        publishableKey: CLOUD.publishableKey
      });
    } catch (e) { cloudClient = null; }
  }

  function rowToPlace(r) {
    return {
      id: r.client_id, name: r.name, url: r.url, fov: r.fov, lat: r.lat, lng: r.lng,
      elev: r.elev, az: r.az, alt: r.alt, date: r.observed_at,
      ts: r.created_at ? new Date(r.created_at).getTime() : 0
    };
  }

  function placeToRow(p) {
    return {
      client_id: p.id, name: p.name, url: p.url, fov: p.fov, lat: p.lat, lng: p.lng,
      elev: p.elev || null, az: p.az, alt: p.alt, observed_at: p.date || null,
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

  async function cloudMerge() {
    var remote = await cloudPull();
    var local = loadPlaces();
    var byId = {};
    local.forEach(function (p) { byId[p.id] = p; });
    var merged = local.slice();
    var pushed = 0, pulled = 0;
    remote.forEach(function (r) {
      var l = byId[r.id];
      if (!l) { merged.push(r); pulled++; }
      else if ((r.ts || 0) > (l.ts || 0)) {
        for (var j = 0; j < merged.length; j++) if (merged[j].id === r.id) merged[j] = r;
        pulled++;
      }
    });
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
    if (btn) btn.disabled = true;
    try {
      var r = await cloudMerge();
      if (listRefresher) listRefresher();
      toast('云同步完成：上传 ' + r.pushed + ' 条，下载 ' + r.pulled + ' 条');
    } catch (e) {
      toast('云同步失败：' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function cloudPushPlace(place) {
    if (!cloudUser) return;
    try { await cloudInsert(place); } catch (e) { /* 静默 */ }
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
      if (/[?&](code|state|oauth|relay)=/.test(location.search) && cloudClient.auth.handleOAuthCallback) {
        try { await cloudClient.auth.handleOAuthCallback(); } catch (e) { /* 非 OAuth 回调 */ }
        try {
          var sc = location.search.match(/sharecode=[^&]+/);
          history.replaceState(null, '', location.pathname + (sc ? '?' + sc[0] : ''));
        } catch (e2) { /* ignore */ }
      }
      var s = await cloudClient.auth.getSession();
      if (s && s.data && s.data.session) {
        cloudUser = s.data.session.user || { email: '已登录' };
        await onCloudSignedIn();
      }
    } catch (e) { /* 未登录 */ }
  }

  /* ============================================== 通行密钥 / 账号底层工具 */
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

  /* 只校验验证码、不建号 */
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
        timeout: 60000, attestation: 'none',
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
      }
    });
    if (!cred) throw new Error('未创建通行密钥');
    var res = await apiPost('/api/passkey/register/finish', {
      challengeId: begin.challengeId, label: label || '本机通行密钥',
      account: currentAccount(), session: blob, credential: serializeAttestation(cred)
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
      publicKey: { challenge: b64uToBuf(begin.challenge), rpId: begin.rpId, userVerification: 'preferred', timeout: 60000 }
    });
    if (!cred) throw new Error('未选择通行密钥');
    var res = await apiPost('/api/passkey/login/finish', {
      challengeId: begin.challengeId, credential: serializeAssertion(cred)
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

  async function renderPasskeyList(wrap) {
    wrap.innerHTML = '<div class="v-list-item-subtitle pa-2">读取中…</div>';
    var items = [];
    try {
      var r = await apiPost('/api/passkey/list', {});
      items = r.items || [];
    } catch (e) {
      wrap.innerHTML = '<div class="v-list-item-subtitle pa-2">通行密钥列表读取失败（可稍后重试）</div>';
      return;
    }
    wrap.innerHTML = '';
    if (!items.length) {
      wrap.appendChild(m('div', 'v-list-item-subtitle pa-2', '还没有绑定通行密钥。'));
      return;
    }
    var list = vList();
    items.forEach(function (it) {
      var del = vBtn('删除', 'text', async function () {
        try {
          await apiPost('/api/passkey/delete', { id: it.id });
          try { await cloudClient.database.from('sweb_passkeys').delete().eq('credential_id', it.id); } catch (e2) { /* ignore */ }
          toast('已删除该通行密钥');
          renderPasskeyList(wrap);
        } catch (e3) { toast('删除失败：' + e3.message); }
      });
      del.style.minWidth = 'auto';
      list.appendChild(vListItem({
        icon: 'mdi-key', title: it.label || '通行密钥',
        sub: (it.hasSession ? '可免验证码登录' : '需先用验证码登录一次') + ' · ' + new Date(it.createdAt).toLocaleDateString(),
        action: del
      }));
    });
    wrap.appendChild(list);
  }

  /* ============================================================ 账号资料/档案 */
  async function dbSelectProfile() {
    if (!cloudClient) return null;
    try {
      var r = await cloudClient.database.from('sweb_profiles').select('*').limit(1);
      if (r.error) return null;
      return (r.data && r.data[0]) || null;
    } catch (e) { return null; }
  }

  async function dbSaveProfile(patch) {
    try {
      await cloudClient.database.from('sweb_profiles').upsert([patch], { onConflict: 'owner_id' });
    } catch (e) { /* 静默 */ }
    acctProfile = Object.assign({}, acctProfile || {}, patch);
  }

  async function refreshAcctState() {
    acctProfile = await dbSelectProfile();
    try {
      var r = await apiPost('/api/auth/password/status', {});
      acctHasPassword = !!r.hasPassword;
    } catch (e) { acctHasPassword = false; }
    return acctProfile;
  }

  function phoneBound() { return !!(acctProfile && acctProfile.phone_verified && acctProfile.phone); }

  /* ================================================== 短信验证码行（通用） */
  /* 绑定/换绑手机：只校验验证码不建号，绝不能走 verifyOtp(isExistingUser:false) */
  function codeRow(placeholder, onSend) {
    var row = m('div', 'd-flex align-center ga-2');
    var code = vField(placeholder || '验证码', 'text', 'one-time-code');
    code.style.flex = '1 1 auto';
    var btn = vBtn('获取验证码', 'tonal', function () { onSend(code, btn); });
    btn.style.flex = '0 0 auto';
    row.appendChild(code);
    row.appendChild(btn);
    row.getCode = function () { return code.getValue().trim(); };
    return row;
  }

  function setBtn(btn, text) { btn.querySelector('.v-btn__content').textContent = text; }

  function countdown(btn) {
    var n = 60, old = btn.querySelector('.v-btn__content').textContent;
    btn.disabled = true;
    var timer = setInterval(function () {
      btn.querySelector('.v-btn__content').textContent = n + 's';
      if (--n < 0) {
        clearInterval(timer);
        btn.querySelector('.v-btn__content').textContent = old;
        btn.disabled = false;
      }
    }, 1000);
  }

  /* ============================================================== 绑定手机号 */
  function openBindPhone(opts) {
    opts = opts || {};
    var d = vDialog('sm-bind', { title: opts.title || '绑定手机号', blocking: !!opts.blocking });
    if (opts.desc) d.body.appendChild(m('div', 'text-body-2 text-medium-emphasis mb-4', esc(opts.desc)));
    var phone = vField('手机号（11 位，如 13800138000）', 'tel', 'tel');
    d.body.appendChild(phone);
    var st = { vid: '', sent: '' };
    var row = codeRow('短信验证码', async function (code, btn) {
      var v = phone.getValue().replace(/\s/g, '');
      if (!/^1\d{10}$/.test(v)) { toast('请填写 11 位大陆手机号'); return; }
      btn.disabled = true; setBtn(btn, '发送中…');
      try {
        var sent = await cloudClient.auth.sendOtp({ phone: v });
        if (sent.error) { toast('发送失败：' + sent.error.message); btn.disabled = false; setBtn(btn, '获取验证码'); return; }
        st.vid = sent.data.verificationId; st.sent = v;
        toast('验证码已发送');
        countdown(btn);
      } catch (e) { toast('发送失败：' + fmtErr(e)); btn.disabled = false; setBtn(btn, '获取验证码'); }
    });
    d.body.appendChild(row);

    var act = d.actions();
    var go = vBtn('确认绑定', undefined, async function () {
      var v = phone.getValue().replace(/\s/g, '');
      if (!st.vid || st.sent !== v) { toast('请先获取短信验证码'); return; }
      if (!/^\d{4,8}$/.test(row.getCode())) { toast('请填写短信验证码'); return; }
      go.disabled = true; setBtn(go, '校验中…');
      try {
        await verifyOnly(st.vid, row.getCode());
        try { await cloudClient.database.from('sweb_phone_claims').insert([{ phone: v }]); }
        catch (e2) { toast('该手机号已被其他账号绑定'); go.disabled = false; setBtn(go, '确认绑定'); return; }
        await dbSaveProfile({ phone: v, phone_verified: true });
        toast('手机号绑定成功');
        d.close();
        if (opts.onDone) opts.onDone();
        else checkGate();
      } catch (e) {
        toast('绑定失败：' + fmtErr(e));
        go.disabled = false; setBtn(go, '确认绑定');
      }
    });
    act.appendChild(go);
    if (opts.blocking) {
      act.appendChild(vBtn('先退出登录', 'text', async function () {
        try { await cloudClient.auth.signOut(); } catch (e) { /* ignore */ }
        cloudUser = null; acctProfile = null;
        d.close();
        toast('已退出登录');
      }));
    }
    d.body.appendChild(m('div', 'text-caption text-medium-emphasis mt-2',
      '绑定手机号用于找回账号与安全校验；一个号码只能绑定一个账号。'));
  }

  async function checkGate() {
    if (!cloudUser) return;
    await refreshAcctState();
    if (!phoneBound()) {
      openBindPhone({
        title: '请先绑定手机号', blocking: true,
        desc: '你的账号还没有绑定手机号。为了账号安全和方便找回，绑定后才能继续使用。'
      });
    }
  }

  /* ================================================================ 登录/注册 */
  var acctTab = 'phone';
  var emailMode = 'code';

  function openAcct() {
    var d = vDialog('sm-acct', { title: '登录 星象仪网页版', width: '440px' });
    d.body.appendChild(m('div', 'text-body-2 text-medium-emphasis mb-2',
      '手机号 / 邮箱 / 通行密钥 / 第三方账号，登录后收藏云端同步、跨设备找回。'));
    d.body.appendChild(vTabs([['phone', '手机号'], ['email', '邮箱'], ['passkey', '通行密钥'], ['third', '第三方']],
      acctTab, function (t) { acctTab = t; openAcct(); }));

    var pane = m('div', 'mt-4');
    d.body.appendChild(pane);

    if (acctTab === 'phone') panePhone(pane, d);
    else if (acctTab === 'email') paneEmail(pane, d);
    else if (acctTab === 'passkey') panePasskey(pane, d);
    else paneThird(pane, d);
  }

  function panePhone(wrap, d) {
    var phone = vField('手机号（11 位，如 13800138000）', 'tel', 'tel');
    wrap.appendChild(phone);
    var st = { vid: '', sent: '', existing: false };
    var row = codeRow('短信验证码', async function (code, btn) {
      var v = phone.getValue().replace(/\s/g, '');
      if (!/^1\d{10}$/.test(v)) { toast('请填写 11 位大陆手机号'); return; }
      btn.disabled = true; setBtn(btn, '发送中…');
      try {
        var sent = await cloudClient.auth.sendOtp({ phone: v });
        if (sent.error) { toast('发送失败：' + sent.error.message); btn.disabled = false; setBtn(btn, '获取验证码'); return; }
        st.vid = sent.data.verificationId; st.sent = v; st.existing = !!sent.data.isExistingUser;
        toast(st.existing ? '验证码已发送，注意短信' : '验证码已发送，该号码将注册新账号');
        countdown(btn);
      } catch (e) { toast('发送失败：' + fmtErr(e)); btn.disabled = false; setBtn(btn, '获取验证码'); }
    });
    wrap.appendChild(row);

    var act = m('div', 'd-flex ga-2 mt-2');
    var go = vBtn('登录 / 注册', undefined, async function () {
      var v = phone.getValue().replace(/\s/g, '');
      if (!st.vid || st.sent !== v) { toast('请先获取短信验证码'); return; }
      if (!/^\d{4,8}$/.test(row.getCode())) { toast('请填写收到的验证码'); return; }
      go.disabled = true; setBtn(go, '验证中…');
      try {
        var done = await cloudClient.auth.verifyOtp({
          phone: v, verificationId: st.vid, isExistingUser: st.existing, token: row.getCode()
        });
        if (done.error) { toast('验证失败：' + done.error.message); }
        else {
          cloudUser = (done.data && done.data.user) || { phone: v };
          d.close();
          await afterSignIn('', v);
        }
      } catch (e) { toast('验证失败：' + fmtErr(e)); }
      go.disabled = false; setBtn(go, '登录 / 注册');
    });
    act.appendChild(go);
    wrap.appendChild(act);
  }

  function paneEmail(wrap, d) {
    wrap.appendChild(vTabs([['code', '验证码登录'], ['password', '密码登录']], emailMode,
      function (t) { emailMode = t; openAcct(); }));

    var email = vField('邮箱，如 me@example.com', 'email', 'email');
    wrap.appendChild(email);

    if (emailMode === 'password') {
      var pw = vField('密码', 'password', 'current-password');
      wrap.appendChild(pw);
      var act = m('div', 'd-flex ga-2 mt-2');
      var go = vBtn('登录', undefined, async function () {
        var v = email.getValue().trim();
        if (!v || !pw.getValue()) { toast('请填写邮箱与密码'); return; }
        go.disabled = true; setBtn(go, '登录中…');
        try {
          var r = await apiPost('/api/auth/password/login', { identifier: v, password: pw.getValue() });
          localStorage.setItem(r.session.key, r.session.value);
          d.close();
          await restoreSession();
          toast('登录成功');
        } catch (e) { toast('登录失败：' + fmtErr(e)); }
        go.disabled = false; setBtn(go, '登录');
      });
      act.appendChild(go);
      wrap.appendChild(act);
      wrap.appendChild(m('div', 'text-caption text-medium-emphasis mt-2',
        '密码需在「账号设置 → 密码」里设置（设置前请先用验证码登录一次）。忘记密码可改用验证码登录。'));
      return;
    }

    var st = { vid: '', sent: '', existing: false, token: null };
    var row = codeRow('邮件验证码', async function (code, btn) {
      var v = email.getValue().trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast('请填写正确的邮箱'); return; }
      btn.disabled = true; setBtn(btn, '发送中…');
      try {
        var sent = await cloudClient.auth.sendOtp({ email: v });
        if (sent.error) { toast('发送失败：' + sent.error.message); btn.disabled = false; setBtn(btn, '获取验证码'); return; }
        st.vid = sent.data.verificationId; st.sent = v; st.existing = !!sent.data.isExistingUser;
        toast(st.existing ? '验证码已发送到邮箱' : '验证码已发送；新邮箱注册还需绑定手机号');
        countdown(btn);
      } catch (e) { toast('发送失败：' + fmtErr(e)); btn.disabled = false; setBtn(btn, '获取验证码'); }
    });
    wrap.appendChild(row);

    var go = vBtn('登录 / 注册', undefined, async function () { verifyEmail(); });
    var act = m('div', 'd-flex ga-2 mt-2');
    act.appendChild(go);
    wrap.appendChild(act);

    /* 新邮箱注册第二步：绑定手机 */
    var step2 = m('div', 'mt-2', '<div class="text-body-2 mb-2">绑定手机号（邮箱注册必填）</div>');
    step2.style.display = 'none';
    var phone2 = vField('手机号（11 位）', 'tel', 'tel');
    step2.appendChild(phone2);
    var s2 = { vid: '', sent: '' };
    var row2 = codeRow('短信验证码', async function (code, btn) {
      var v = phone2.getValue().replace(/\s/g, '');
      if (!/^1\d{10}$/.test(v)) { toast('请填写 11 位大陆手机号'); return; }
      btn.disabled = true; setBtn(btn, '发送中…');
      try {
        var sent = await cloudClient.auth.sendOtp({ phone: v });
        if (sent.error) { toast('发送失败：' + sent.error.message); btn.disabled = false; setBtn(btn, '获取验证码'); return; }
        s2.vid = sent.data.verificationId; s2.sent = v;
        toast('验证码已发送到手机');
        countdown(btn);
      } catch (e) { toast('发送失败：' + fmtErr(e)); btn.disabled = false; setBtn(btn, '获取验证码'); }
    });
    step2.appendChild(row2);
    var finish = vBtn('完成注册', undefined, async function () {
      var v = email.getValue().trim();
      var phoneVal = phone2.getValue().replace(/\s/g, '');
      if (!s2.vid || s2.sent !== phoneVal) { toast('请先获取短信验证码'); return; }
      if (!/^\d{4,8}$/.test(row2.getCode())) { toast('请填写短信验证码'); return; }
      finish.disabled = true; setBtn(finish, '校验手机号…');
      try {
        await verifyOnly(s2.vid, row2.getCode());
      } catch (e) {
        toast('手机验证失败：' + fmtErr(e));
        finish.disabled = false; setBtn(finish, '完成注册');
        return;
      }
      setBtn(finish, '创建账号…');
      try {
        var up = await cloudClient.auth.signUp({ email: v, verificationToken: st.token });
        if (up.error) { toast('注册失败：' + up.error.message); finish.disabled = false; setBtn(finish, '完成注册'); return; }
        cloudUser = (up.data && up.data.user) || { email: v };
        d.close();
        await afterSignIn(v, phoneVal);
      } catch (e) {
        toast('注册失败：' + fmtErr(e));
        finish.disabled = false; setBtn(finish, '完成注册');
      }
    });
    step2.appendChild(finish);
    wrap.appendChild(step2);

    async function verifyEmail() {
      var v = email.getValue().trim();
      if (!st.vid || st.sent !== v) { toast('请先获取邮件验证码'); return; }
      if (!/^\d{4,8}$/.test(row.getCode())) { toast('请填写邮箱收到的验证码'); return; }
      if (st.existing) {
        go.disabled = true; setBtn(go, '登录中…');
        try {
          var done = await cloudClient.auth.verifyOtp({
            email: v, verificationId: st.vid, isExistingUser: true, token: row.getCode()
          });
          if (done.error) toast('登录失败：' + done.error.message);
          else {
            cloudUser = (done.data && done.data.user) || { email: v };
            d.close();
            await afterSignIn(v, '');
          }
        } catch (e) { toast('登录失败：' + fmtErr(e)); }
        go.disabled = false; setBtn(go, '登录 / 注册');
        return;
      }
      go.disabled = true; setBtn(go, '校验中…');
      try {
        st.token = await verifyOnly(st.vid, row.getCode());
        toast('邮箱已验证，请继续绑定手机号');
        step2.style.display = '';
        setBtn(go, '邮箱已验证 ✓');
      } catch (e) {
        toast('邮箱验证失败：' + fmtErr(e));
        go.disabled = false; setBtn(go, '登录 / 注册');
      }
    }

    wrap.appendChild(m('div', 'text-caption text-medium-emphasis mt-2',
      '邮箱注册必须绑定并验证手机号：邮件验证码 + 短信验证码都通过后才会创建账号。'));
  }

  function panePasskey(wrap, d) {
    if (!passkeySupported()) {
      wrap.appendChild(m('div', 'text-body-2 text-medium-emphasis', '当前浏览器不支持通行密钥（需要 HTTPS 与较新的浏览器）。'));
      return;
    }
    var go = vBtn('用通行密钥登录', undefined, async function () {
      go.disabled = true; setBtn(go, '等待系统验证…');
      try {
        await loginWithPasskey();
        d.close();
        toast('已通过通行密钥登录');
      } catch (e) { toast('登录失败：' + fmtErr(e)); }
      go.disabled = false; setBtn(go, '用通行密钥登录');
    });
    wrap.appendChild(go);
    wrap.appendChild(m('div', 'text-caption text-medium-emphasis mt-2',
      '点击后系统会弹出触控 ID / Windows Hello / 手机指纹。通行密钥需先在「账号设置 → 通行密钥」绑定。'));
  }

  function paneThird(wrap, d) {
    var wx = vBtn('微信登录', undefined, async function () {
      wx.disabled = true; setBtn(wx, '跳转中…');
      try {
        await cloudClient.auth.signInWithOAuth({ provider: 'wechat', redirectTo: location.origin + location.pathname });
      } catch (e) { toast('微信登录暂不可用：' + fmtErr(e)); wx.disabled = false; setBtn(wx, '微信登录'); }
    });
    var wb = vBtn('WorkBuddy 账号登录', 'tonal', async function () {
      wb.disabled = true; setBtn(wb, '跳转中…');
      try {
        await cloudClient.auth.signInWithOAuth({ provider: 'workbuddy', redirectTo: location.origin + location.pathname });
      } catch (e) { toast('跳转失败：' + fmtErr(e)); wb.disabled = false; setBtn(wb, 'WorkBuddy 账号登录'); }
    });
    wrap.appendChild(wx);
    wrap.appendChild(m('div', 'mt-2'));
    wrap.appendChild(wb);
    wrap.appendChild(m('div', 'text-caption text-medium-emphasis mt-2',
      '第三方登录后同样需要绑定手机号；绑定关系可在「账号设置」中查看。'));
  }

  /* =============================================================== 账号设置 */
  async function openSettings() {
    if (!cloudUser) { openAcct(); return; }
    var d = vDialog('sm-settings', { title: '账号设置', width: '440px' });
    d.body.appendChild(m('div', 'text-body-2 text-medium-emphasis mb-2',
      '管理绑定的手机号 / 邮箱 / 密码 / 通行密钥 / 第三方账号'));
    await refreshAcctState();

    var secProfile = vList();
    var nameField = vField('昵称（可选）');
    nameField.querySelector('input').value = (acctProfile && acctProfile.display_name) || '';
    var saveName = vBtn('保存', 'tonal', async function () {
      await dbSaveProfile({ display_name: (nameField.getValue() || '').trim().slice(0, 24) || null });
      toast('昵称已保存');
    });
    saveName.style.minWidth = 'auto';
    secProfile.appendChild(vListItem({
      icon: 'mdi-account', title: cloudUser.email || cloudUser.phone || '已登录',
      sub: '账号 ID ' + String(cloudUser.id || '').slice(0, 8)
    }));
    var nameItem = vListItem({ title: '昵称', action: saveName });
    var nameWrap = m('div', 'd-flex align-center ga-2 px-4 pb-2');
    var nf = nameField;
    nf.style.flex = '1 1 auto';
    nameWrap.appendChild(nf);
    nameWrap.appendChild(saveName);
    secProfile.appendChild(nameItem);
    secProfile.appendChild(nameWrap);
    d.body.appendChild(secProfile);

    var secBind = vList();
    var phoneBtn = vBtn((acctProfile && acctProfile.phone) ? '换绑' : '绑定', 'tonal', function () {
      d.close();
      openBindPhone({ title: (acctProfile && acctProfile.phone) ? '换绑手机号' : '绑定手机号' });
    });
    phoneBtn.style.minWidth = 'auto';
    secBind.appendChild(vListItem({
      icon: 'mdi-cellphone', title: '手机号',
      sub: (acctProfile && acctProfile.phone)
        ? acctProfile.phone + (acctProfile.phone_verified ? ' · 已验证' : ' · 未验证')
        : '未绑定 · 建议立即绑定',
      action: phoneBtn
    }));
    secBind.appendChild(vListItem({
      icon: 'mdi-email', title: '邮箱',
      sub: cloudUser.email ? cloudUser.email : '未绑定（当前账号为手机号注册）'
    }));
    var pwBtn = vBtn(acctHasPassword ? '修改' : '设置', 'tonal', function () { d.close(); openPasswordCard(); });
    pwBtn.style.minWidth = 'auto';
    secBind.appendChild(vListItem({
      icon: 'mdi-lock', title: '密码',
      sub: acctHasPassword ? '已设置 · 可用于邮箱密码登录' : '未设置（先用验证码登录，再设置密码）',
      action: pwBtn
    }));
    secBind.appendChild(vListItem({
      icon: 'mdi-link-variant', title: '第三方账号',
      sub: '微信 / WorkBuddy · 登录一次后自动关联到当前账号'
    }));
    d.body.appendChild(secBind);

    d.body.appendChild(m('div', 'text-body-2 mt-4 mb-2', '通行密钥'));
    var pkWrap = m('div', '');
    d.body.appendChild(pkWrap);
    var add = vBtn('添加通行密钥', 'tonal', async function () {
      if (!passkeySupported()) { toast('当前浏览器不支持通行密钥'); return; }
      var label = window.prompt('给这个通行密钥起个名字（例如：MacBook 触控 ID）', '本机通行密钥');
      if (label === null) return;
      add.disabled = true; setBtn(add, '等待系统验证…');
      try {
        await addPasskey((label || '').trim() || '本机通行密钥');
        toast('通行密钥已绑定，下次可免验证码登录');
        renderPasskeyList(pkWrap);
      } catch (e) { toast('绑定失败：' + fmtErr(e)); }
      add.disabled = false; setBtn(add, '添加通行密钥');
    });
    d.body.appendChild(add);
    renderPasskeyList(pkWrap);

    var act = d.actions();
    var sync = vBtn('立即同步', 'text', function () { syncNow(sync); });
    var out = vBtn('退出登录', 'text', async function () {
      try { await cloudClient.auth.signOut(); } catch (e) { /* ignore */ }
      cloudUser = null; acctProfile = null;
      d.close();
      toast('已退出登录（收藏保留在本机）');
    });
    act.appendChild(sync);
    act.appendChild(out);
  }

  function openPasswordCard() {
    var d = vDialog('sm-pw', { title: acctHasPassword ? '修改密码' : '设置密码', width: '400px' });
    d.body.appendChild(m('div', 'text-body-2 text-medium-emphasis mb-2',
      '设置后可在登录页用「邮箱 + 密码」直接登录，不必等验证码。'));
    var old = null;
    if (acctHasPassword) {
      old = vField('当前密码', 'password', 'current-password');
      d.body.appendChild(old);
    }
    var pw1 = vField('新密码（至少 8 位）', 'password', 'new-password');
    var pw2 = vField('再输一遍新密码', 'password', 'new-password');
    d.body.appendChild(pw1);
    d.body.appendChild(pw2);
    var act = d.actions();
    var go = vBtn('保存', undefined, async function () {
      if (pw1.getValue().length < 8) { toast('密码至少 8 位'); return; }
      if (pw1.getValue() !== pw2.getValue()) { toast('两次输入的密码不一致'); return; }
      go.disabled = true; setBtn(go, '保存中…');
      try {
        await apiPost('/api/auth/password/set', {
          password: pw1.getValue(),
          oldPassword: old ? old.getValue() : undefined,
          identifier: (cloudUser.email || '').toLowerCase()
        });
        acctHasPassword = true;
        toast('密码已保存');
        d.close();
      } catch (e) { toast('保存失败：' + fmtErr(e)); }
      go.disabled = false; setBtn(go, '保存');
    });
    act.appendChild(go);
  }

  /* ================================================================= 我的星图 */
  function openPlaces() {
    var d = vDialog('sm-places', { title: '我的星图', width: '460px' });
    var state = m('div', 'text-body-2 text-medium-emphasis mb-2', '');
    d.body.appendChild(state);

    function renderState() {
      var v = captureView();
      if (!v) { state.textContent = '星图还在加载，稍等一下…'; return; }
      state.textContent = '高度 ' + Number(v.alt).toFixed(1) + '° · 方位 ' + Number(v.az).toFixed(1) +
        '° · 视场 ' + Number(v.fov).toFixed(1) + '° · 纬度 ' + v.lat + ' · 经度 ' + v.lng;
    }
    renderState();
    var timer = setInterval(function () {
      if (document.getElementById('sm-places')) renderState();
      else clearInterval(timer);
    }, 1500);

    var row = m('div', 'd-flex ga-2 mt-2');
    row.appendChild(vBtn('保存当前视角', undefined, function () {
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
    }));
    row.appendChild(vBtn('复制分享链接', 'tonal', function () {
      var v = captureView();
      if (!v) { toast('星图尚未就绪'); return; }
      copyText(viewToUrl(v), function (ok) { toast(ok ? '分享链接已复制' : '复制失败，请手动复制'); });
    }));
    d.body.appendChild(row);

    var acctBox = m('div', 'mt-4');
    d.body.appendChild(acctBox);
    renderAccountBox(acctBox, d);

    d.body.appendChild(m('div', 'text-body-2 mt-4 mb-2', '已保存的观测点'));
    var listWrap = m('div', '');
    d.body.appendChild(listWrap);

    function renderList() {
      listRefresher = renderList;
      var list = loadPlaces();
      listWrap.innerHTML = '';
      if (!list.length) {
        listWrap.appendChild(m('div', 'text-caption text-medium-emphasis pa-2', '还没有记录。调好视角后点上面的「保存当前视角」。'));
        return;
      }
      var ul = vList();
      list.slice().reverse().forEach(function (p) {
        var del = vIconBtn('mdi-delete', function () {
          var rest = loadPlaces().filter(function (x) { return x.id !== p.id; });
          savePlaces(rest);
          renderList();
          cloudRemovePlace(p.id);
          toast('已删除');
        });
        ul.appendChild(vListItem({
          icon: 'mdi-map-marker', title: p.name,
          sub: (p.alt != null ? Number(p.alt).toFixed(1) + '° 高度 · ' : '') +
            '视场 ' + Number(p.fov).toFixed(1) + '° · ' + fmtTime(new Date(p.ts)),
          action: del,
          onClick: function () { location.href = p.url; }
        }));
      });
      listWrap.appendChild(ul);
    }
    renderList();

    var tools = m('div', 'd-flex ga-2 mt-2');
    tools.appendChild(vBtn('导出备份', 'text', exportPlaces));
    tools.appendChild(vBtn('导入备份', 'text', importPlaces));
    d.body.appendChild(tools);
    d.body.appendChild(m('div', 'text-caption text-medium-emphasis mt-2',
      '链接里已包含视场、坐标与时间，发给别人打开即可还原同一片天空。'));
  }

  function exportPlaces() {
    var blob = new Blob([JSON.stringify(loadPlaces(), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stellarium-web-places.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    toast('已导出 JSON');
  }

  function importPlaces() {
    var inp = document.createElement('input');
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
          if (listRefresher) listRefresher();
          toast('已导入 ' + n + ' 条');
        } catch (e) { toast('文件格式不对'); }
      };
      fr.readAsText(f);
    });
    inp.click();
  }

  function renderAccountBox(box, d) {
    box.innerHTML = '';
    if (!cloudReady()) {
      box.appendChild(m('div', 'text-caption text-medium-emphasis', '云同步未就绪（SDK 未加载），收藏仍保存在本机。'));
      return;
    }
    if (cloudUser) {
      var who = (acctProfile && acctProfile.display_name) || cloudUser.email || cloudUser.phone || '已登录';
      var list = vList();
      var setting = vBtn('账号设置', 'tonal', function () { d.close(); openSettings(); });
      setting.style.minWidth = 'auto';
      list.appendChild(vListItem({
        icon: 'mdi-cloud-check', title: who,
        sub: phoneBound() ? '已登录 · 收藏自动云端同步' : '已登录 · 尚未绑定手机号',
        action: setting
      }));
      box.appendChild(list);
      if (!acctProfile) refreshAcctState().then(function () { renderAccountBox(box, d); });
    } else {
      var list2 = vList();
      var go = vBtn('登录 / 注册', 'tonal', function () { d.close(); openAcct(); });
      go.style.minWidth = 'auto';
      list2.appendChild(vListItem({
        icon: 'mdi-cloud-off-outline', title: '未登录',
        sub: '登录后收藏云端同步、跨设备找回', action: go
      }));
      box.appendChild(list2);
    }
  }

  function fmtTime(d) {
    function p(n) { return n < 10 ? '0' + n : n; }
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ============================================================ 原版入口接管 */
  function buildAuthBridge() {
    // 官方登录链接 → 自家登录框
    document.addEventListener('click', function (e) {
      var t = e.target;
      var a = t && t.closest && t.closest('a[href*="/p/users/"]');
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      openAcct();
    }, true);
    if (/^\/p\/users\/(signin|signup|login|register)/.test(location.pathname)) {
      try { history.replaceState(null, '', '/' + location.search); } catch (e) { /* ignore */ }
      setTimeout(function () { openAcct(); }, 1500);
    }
  }

  /* 把入口做进原版左侧菜单（v-list-item 结构，与 今晚/我的观测/日历 同源） */
  var menuItems = [
    { icon: 'mdi-star-box', text: '我的星图', run: function () { openPlaces(); } },
    { icon: 'mdi-account-circle', text: '账号', run: function () { cloudUser ? openSettings() : openAcct(); } }
  ];

  function injectMenu() {
    var list = document.querySelector('.v-navigation-drawer .v-list');
    if (!list) return false;
    // 清掉可能被 Vue 复用 DOM 保留下来的旧条目，避免重复
    var stale = document.querySelectorAll('.v-navigation-drawer .sm-menu-item');
    for (var k = 0; k < stale.length; k++) { if (stale[k].parentNode) stale[k].parentNode.removeChild(stale[k]); }
    if (list.querySelector('.sm-menu-item')) return true;
    menuItems.forEach(function (it) {
      var a = m('a', 'v-list-item v-list-item--link v-theme--dark v-list-item--density-compact ' +
        'v-list-item--one-line rounded-0 v-list-item--variant-text sm-menu-item');
      a.href = 'javascript:void 0';
      a.innerHTML = '<span class="v-list-item__overlay"></span><span class="v-list-item__underlay"></span>' +
        '<div class="v-list-item__prepend"><i class="' + it.icon + ' mdi v-icon notranslate v-theme--dark v-icon--size-default"></i></div>' +
        '<div class="v-list-item__content"><div class="v-list-item-title">' + esc(it.text) + '</div></div>';
      a.addEventListener('click', function (e) { e.preventDefault(); it.run(); });
      list.appendChild(a);
    });
    return true;
  }

  /* 把「界面语言 / 镜像信息」做进原版显示设置（左侧菜单里的 v-list-group 分组，
     少数窄屏布局会渲染成对话框，两种都覆盖） */
  function langRow(zh) {
    var active = zh ? !!wantZh : !wantZh;
    var r = vListItem({
      icon: active ? 'mdi-check' : 'mdi-translate',
      title: zh ? '中文（简体）' : 'English',
      onClick: function () { setLang(zh); },
      asDiv: true
    });
    if (active) r.classList.add('v-list-item--active');
    return r;
  }

  function injectViewSettings() {
    // 先清掉可能被 Vue 保留下来的旧注入节点，避免重复
    var stale = document.querySelectorAll('.v-navigation-drawer .sm-extra');
    for (var s = 0; s < stale.length; s++) stale[s].remove();

    // ① 左侧菜单里的「显示设置」分组（v-list-group）
    var groups = document.querySelectorAll('.v-navigation-drawer .v-list-group');
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var head = g.querySelector('.v-list-group__header .v-list-item-title');
      if (!head || !/显示设置|View Settings/.test(head.textContent)) continue;
      var items = g.querySelector('.v-list-group__items');
      if (!items || items.querySelector('.sm-extra')) continue;
      var wrap = m('div', 'sm-extra');
      var label = m('div', 'text-caption text-medium-emphasis pl-10 pt-2 pb-1', '界面语言');
      wrap.appendChild(label);
      wrap.appendChild(langRow(true));
      wrap.appendChild(langRow(false));
      var info = vListItem({
        icon: 'mdi-information-outline', title: '星象仪网页版',
        onClick: function () { openMirrorInfo(); }, asDiv: true
      });
      wrap.appendChild(info);
      items.appendChild(wrap);
    }

    // ② 对话框形态（窄屏）
    var cards = document.querySelectorAll('.v-dialog .v-card');
    for (var j = 0; j < cards.length; j++) {
      var card = cards[j];
      if (card.querySelector('.sm-extra')) continue;
      var t = card.querySelector('.v-card-title');
      if (!t || !/显示设置|View Settings/.test(t.textContent)) continue;
      var body = card.querySelector('.v-card-text');
      if (!body) continue;
      var list = card.querySelector('.v-list');
      if (!list) { list = vList(); body.appendChild(list); }
      list.appendChild(vListItem({ icon: 'mdi-translate', title: '界面语言：中文（简体）', onClick: function () { setLang(true); } }));
      list.appendChild(vListItem({ icon: 'mdi-translate', title: '界面语言：English', onClick: function () { setLang(false); } }));
      list.appendChild(vListItem({
        icon: 'mdi-information-outline', title: '星象仪网页版',
        onClick: function () { openMirrorInfo(); }
      }));
      card.classList.add('sm-injected');
    }
  }

  function setLang(zh) {
    if (zh === wantZh) return;
    if (!zh) {
      var v = captureView();
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
    translateDom(document.body);
    toast('已切换为中文');
  }

  function openMirrorInfo() {
    var d = vDialog('sm-info', { title: '关于本镜像', width: '440px' });
    var list = vList();
    list.appendChild(vListItem({ icon: 'mdi-earth', title: '星象仪网页版', sub: '基于 Stellarium Web Engine 的国内自托管镜像' }));
    list.appendChild(vListItem({ icon: 'mdi-map', title: '地图与地理编码', sub: '高德瓦片经本站缓存；中国行政区划数据自托管' }));
    list.appendChild(vListItem({ icon: 'mdi-account-lock', title: '账号系统', sub: '手机号 / 邮箱（验证码或密码）/ 通行密钥 / 第三方，自建' }));
    list.appendChild(vListItem({ icon: 'mdi-license', title: '许可', sub: '上游 Stellarium Web Engine · AGPL-3.0（见 NOTICE.txt）' }));
    d.body.appendChild(list);
    d.actions().appendChild(vBtn('查看许可声明', 'text', function () { window.open('./NOTICE.txt', '_blank'); }));
  }

  /* ============================================================= 登录收尾 */
  async function afterSignIn(email, phone) {
    try {
      if (email || phone) {
        await cloudClient.database.from('sweb_profiles').insert([{
          email: email || null, phone: phone || null,
          email_verified: !!email, phone_verified: !!phone
        }]);
      }
    } catch (e) { /* 档案已存在或网络抖动 */ }
    if (phone) {
      try { await cloudClient.database.from('sweb_phone_claims').insert([{ phone: phone }]); }
      catch (e) { toast('提示：该手机号已被其他账号绑定过'); }
    }
    syncNow(null);
    refreshPasskeySession();
    checkGate();
  }

  async function onCloudSignedIn() {
    syncNow(null);
    refreshPasskeySession();
    await checkGate();
  }

  /* ================================================================== 启动 */
  function boot() {
    bootstrapLang();
    buildAuthBridge();
    watchDom();
    injectMenu();
    setInterval(injectMenu, 2000);
    setInterval(injectViewSettings, 1200);

    /* ?__preview=1：仅本地预览账号相关界面（不产生真实登录态） */
    if (/[?&]__preview=/.test(location.search)) {
      cloudUser = { email: 'preview@example.com', id: 'preview' };
      window.__smPreview = {
        places: openPlaces, acct: openAcct, settings: openSettings,
        gate: checkGate, info: openMirrorInfo, bindPhone: openBindPhone
      };
      setTimeout(function () {
        openBindPhone({ title: '请先绑定手机号', blocking: true, desc: '预览：未绑定手机号时的强制绑定界面。' });
      }, 2500);
    }

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
