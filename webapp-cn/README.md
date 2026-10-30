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
| 界面中文化 | 向 vue-i18n 注入 zh-CN 词表（114 条）+ DOM 兜底，官方无中文语言包 |
| 视角分享 | 把当前视场/坐标/方位/时间编码进 URL，打开即还原同一片天空 |
| 观测点收藏 | 本地 localStorage 保存，登录后与云端数据库双向合并同步 |
| 手机号 / 邮箱注册 | 验证码注册登录；**邮箱注册强制先验证手机号**（邮箱码 + 短信码都通过才建号） |
| 通行密钥（WebAuthn） | 绑定后免验证码登录；服务端用 `node:crypto` 验签，零第三方依赖 |

## 目录结构

```
webapp-cn/
├── server.js          # 静态服务（wasm MIME + gzip）+ /api/passkey/* 通行密钥后端
├── webauthn.js        # 极简 WebAuthn 验签（CBOR 解码、COSE→JWK、注册/断言校验）
├── crawl.js           # 抓取前端与 libswe 数据（星表/星座文化/地景/行星贴图…）
├── crawl-dss.js       # 抓取 DSS 深空巡天瓦片（可指定层级）
├── crawl-sso.js       # 抓取太阳系天体（行星/卫星）表面贴图
├── postprocess.js     # 把前端里写死的官方 CDN 地址改写为本地相对路径
├── schema.sql         # 云数据库建表 + RLS 策略
├── NOTICE.txt         # AGPL-3.0 来源与修改声明
└── frontend/          # 注入到镜像站点的增强层文件
    ├── index.html     # 改写后的入口页
    ├── mirror-ui.js   # 中文界面 / 分享 / 收藏 / 账号 / 通行密钥
    ├── mirror.css / mirror-cloud.css / mirror.js
    └── NOTICE.txt
```

## 快速开始

```bash
# 1) 抓取官方资源（约 167MB；不含 TB 级 Gaia 深空星表与 DSS 高层级瓦片）
node crawl.js ./public
node crawl-sso.js
node crawl-dss.js 4

# 2) 地址改写 + 去统计脚本
node postprocess.js

# 3) 把 frontend/ 下的文件拷进 public/，然后启动
node server.js        # 默认 0.0.0.0:3000，可用 PORT / BIND_IP 覆盖
```

## 账号与通行密钥的实现说明

- 会话由 WorkBuddy 云服务（`/.cloud/auth`）签发，SDK 把登录态存于
  `localStorage["workbuddy-cloud.session.<appId>"]`。
- 绑定通行密钥时，前端把当前会话提交给 `/api/passkey/register/finish`，服务端验签后
  用 AES-256-GCM 加密存档（密钥在 `data/broker.key`，首次运行自动生成）。
- 之后「用通行密钥登录」：服务端校验断言签名（challenge / origin / rpIdHash / 签名 / 计数器）
  → 解密并下发会话 → 前端写回 localStorage → SDK `getSession()` 自动续期，完成免验证码登录。
- 环境变量：`PORT`、`BIND_IP`、`WB_PUBLISHABLE_KEY`；
  `ALLOW_ANON_PASSKEY=1` 仅用于本机自测（允许未登录绑定），生产环境不要打开。

### 已知限制

- 云服务后端不提供"向已有账号追加手机号"的 API，因此手机号与邮箱是两个独立的登录身份：
  手机号注册的账号用短信码登录，邮箱注册的账号用邮件码或通行密钥登录，两者通过
  `sweb_phone_claims` 表保证一个手机号只绑定一个账号。
- 通行密钥的可恢复会话存放在服务端 `data/` 目录；若部署环境重建，需要先用验证码登录一次
  再重新刷新（前端会自动在每次登录后刷新存档）。

## 许可证

AGPL-3.0。星表、星座文化与巡天图像数据的版权与许可遵循上游及其数据源声明，
详见 [NOTICE.txt](./NOTICE.txt)。
