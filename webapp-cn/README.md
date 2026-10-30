# 星象仪网页版 · webapp-cn

Stellarium Web 的**国内自托管镜像与增强版**。把官方 stellarium-web.org 的前端与全部星表数据
镜像到自己的服务器上，不访问任何境外 CDN，并在其上增加了一层中文界面与账号能力。

- 上游项目：[Stellarium/stellarium-web-engine](https://github.com/Stellarium/stellarium-web-engine)（AGPL-3.0）
- 本目录代码许可证：AGPL-3.0（与上游一致）；来源与修改声明见 [NOTICE.txt](./NOTICE.txt)
- 在线演示：https://stellarium-web-cn.app.workbuddy.host/?sharecode=ZRF4MO7BGX

> 本项目与 Stellarium 官方无隶属关系，仅为自托管部署 + 本地化增强。

## 新增能力

| 能力 | 说明 |
| --- | --- |
| 界面中文化 | vue-i18n 注入 zh-CN 词表（约 230 条）+ DOM 兜底 + 组合短语翻译（月相 / 行星冲日 / 流星雨 / 日期）；UI 巡检后残留英文仅剩语言切换项自身 |
| 全原生 UI | 增强层全部使用 Vuetify 原生 class 结构（`v-btn` / `v-field` / `v-tabs` / `v-list-item` / `v-dialog` / `v-snackbar`），入口做进原版左侧菜单与「显示设置」分组，不自绘任何控件 |
| 国内地图 | 底图换为高德瓦片（经服务器缓存代理），地名检索 / 逆地理编码用自托管的中国行政区划 + 世界国家中文数据，IP 定位走国内服务，浏览器对外请求为 0 |
| 账号系统接管 | 官方 `api.stellarium.com` 后端整体替换为本站自建账号后端（JS 与 WASM 内地址都已改写），官方登录页路由一并接管 |
| 手机号 / 邮箱注册 | 验证码注册登录；邮箱注册强制先验证手机号；邮箱登录支持**密码或验证码**两种方式 |
| 通行密钥（WebAuthn） | 绑定后免验证码登录；服务端用 `node:crypto` 验签，零第三方依赖 |
| 个人设置页 | 登录后管理昵称、手机号（换绑）、邮箱、密码、第三方账号、通行密钥，并可手动同步 |
| 强制绑手机 | 未绑定手机的账号，无论以何种方式登录，进入即弹出不可关闭的绑定引导（可先退出登录） |

## 目录结构

```
webapp-cn/
├── server.js          # 静态服务 + 通行密钥/密码登录后端 + 地图与地理编码路由
├── geo.js             # 高德瓦片缓存代理、Nominatim 兼容检索/逆地理、IP 定位
├── patch-urls.js      # 把 JS/WASM 里写死的官方与境外地址改写为本站相对路径
├── webauthn.js        # 极简 WebAuthn 验签（CBOR 解码、COSE→JWK、注册/断言校验）
├── crawl.js           # 抓取前端与 libswe 数据（星表/星座文化/地景/行星贴图…）
├── crawl-dss.js       # 抓取 DSS 深空巡天瓦片（可指定层级）
├── crawl-sso.js       # 抓取太阳系天体（行星/卫星）表面贴图
├── crawl-deep.js      # 按层级断点续传补全 DSS / 暗星表 / Gaia（支持 dry=1 试算）
├── postprocess.js     # 前端资源本地化
├── schema.sql         # 云数据库建表 + RLS 策略
├── NOTICE.txt         # AGPL-3.0 来源与修改声明
└── frontend/          # 注入到镜像站点的增强层文件
    ├── index.html     # 改写后的入口页
    ├── mirror-ui.js   # 中文界面 / 账号 / 设置 / 收藏（全部 Vuetify 原生结构）
    ├── mirror-ui.css  # 仅少量布局辅助规则，视觉全部沿用原版 Vuetify
    ├── vendor/        # 本地化的云服务 SDK（不再走外网 CDN）
    └── data-geo/      # 自托管地名数据（中国行政区划 + 世界国家中文名）
```

## 快速开始

```bash
# 1) 抓取官方资源（约 167MB；不含 TB 级 Gaia 深空星表与 DSS 高层级瓦片）
node crawl.js ./public
node crawl-sso.js
node crawl-dss.js 4

# 2) 地址改写（前端 JS + WASM 内的官方 API / 境外服务地址 → 本站相对路径）
node patch-urls.js

# 3) 把 frontend/ 下的文件拷进 public/，然后启动
node server.js        # 默认 0.0.0.0:3000，可用 PORT / BIND_IP 覆盖
```

## 地图与地理编码说明

- 底图：高德矢量瓦片，经 `/api/map/tile/{z}/{x}/{y}.png` 代理并缓存（内存 + 磁盘双层）。
- 检索：`/api/nominatim/search`，先查自托管地名库（精确 → 前缀 → 包含），
  未命中再回落公网 Nominatim（5s 超时、7 天缓存，可关）。
- 逆地理：`/api/nominatim/reverse`，按 区县(<25km) / 城市(<50km) / 省份(<200km) 三级就近归属，
  直辖市单列处理；海外坐标回落 Nominatim 或返回「未知地点」。
- IP 定位：`/api/geoip/json`，走国内 IP 服务并映射到本地地名库坐标，默认北京。

## 账号与通行密钥的实现说明

- 会话由 WorkBuddy 云服务（`/.cloud/auth`）签发，SDK 已本地化到 `frontend/vendor/`。
- 「仅验证不建号」：邮箱注册先走 verification 接口拿到 `verification_token`，再 `signUp`，
  以此实现「邮箱 + 短信双验证后才建号」。
- 密码登录：`scrypt` 哈希存于服务端 `data/passwords.json`，登录成功后回放存档会话。
- 通行密钥：前端把当前会话提交给 `/api/passkey/register/finish`，服务端验签后用
  AES-256-GCM 加密存档；断言校验覆盖 challenge / origin / rpIdHash / 签名 / 计数器。
- 环境变量：`PORT`、`BIND_IP`、`WB_PUBLISHABLE_KEY`；
  `ALLOW_ANON_PASSKEY=1` 仅用于本机自测（允许未登录绑定），生产环境不要打开。

## 资源完整性与按需补全

首次抓取（`crawl.js` + `crawl-sso.js` + `crawl-dss.js`）约 **167MB**，按体积做了取舍，
因此运行时仍会有少量数据块本地不存在。实测（无头浏览器收集所有响应，
把数据路径返回 `text/html` 的判为缺失——本地服务有 SPA 回退，缺失不会表现为 404）分两类：

**① 漏抓（已修复，属 bug）**

| 缺失 | 原因 | 影响 |
| --- | --- | --- |
| `skysources/v4/tle_satellite.jsonl.gz` | 抓的是 v1，程序实际请求 v4 | 卫星轨道数据加载失败，反复重试 612 次 |
| `surveys/sso/moon/v2`、`moon-normal/v3` 的 `Norder0/Allsky.webp` | 只抓了高清瓦片，漏了最低层级全景图 | 远处看月亮空白/糊，放大才出细节 |

三者合计约 1.4MB，已直接补入镜像。

**② 抓浅（体积权衡，非 bug）**

| 数据 | 已抓到 | 何时会看出缺 | 补一层约需 |
| --- | --- | --- | --- |
| DSS 深空照片 | order 3 | 放大看星云星系超过 order 3 就空白 | order4 ≈ 46MB，order5 ≈ 184MB（官方最大 order9） |
| 暗星表（8–12 等） | order 3 | 中等视野下较暗的星不出现 | order4 ≈ 129MB |
| Gaia 暗星表（12 等以上） | 仅说明文件，无瓦片 | 极度放大时看不到最暗背景星 | order5 ≈ 146MB 起，往上到 TB 级 |
| 银河全景 / 地景 | order 1 / 2 | 基本够用 | 小 |

修复后常规视野下剩余缺失约 32 块（DSS 24 + 暗星表 8），镜头转到其他天区同样会遇到。

**补全方式**（二选一）：

```bash
node crawl-deep.js dry=1 dss=4 stars=4   # 先只算账不下载
node crawl-deep.js dss=4 stars=4         # 约 +175MB，日常放大基本够用
node crawl-deep.js dss=5                 # 再加约 184MB，深空更耐放大
```

或在服务端开启缺块回源缓存（本地没有的块去上游取一次后存本地）：

```bash
OFFICIAL_FALLBACK=1 node server.js
```

该开关**默认关闭**，因为开启后服务器会访问境外 CDN，与「零境外请求」的部署目标冲突。

**建议**：补到 `dss=4 stars=4`（总计约 340MB）；Gaia 的 TB 级数据集不建议全量镜像，
确有需求时开启回源缓存按需兜底。

### 已知限制

- 云服务后端不提供「向已有账号追加手机号」的 API，因此手机号与邮箱是两个独立的登录身份，
  通过 `sweb_phone_claims` 表保证一个手机号只绑定一个账号。
- 通行密钥的可恢复会话存放在服务端 `data/` 目录；部署环境重建后需先用验证码登录一次
  重新刷新（前端会在每次登录后自动刷新存档）。

## 许可证

AGPL-3.0。星表、星座文化与巡天图像数据的版权与许可遵循上游及其数据源声明，
详见 [NOTICE.txt](./NOTICE.txt)。
