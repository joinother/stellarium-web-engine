#!/usr/bin/env python3
"""把前端与 wasm 中所有境外服务地址改写为本地/自托管（可重复执行）"""
import io, os, sys

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

JS_PATCHES = [
    # 地图瓦片 → 本站代理（高德国内源）
    ('url:"https://{s}.tile.osm.org/{z}/{x}/{y}.png"',
     'url:"/api/map/tile/{z}/{x}/{y}.png"'),
    # 地理编码 → 本站自托管（中国区划数据集，服务端兜底）
    ('serviceUrl:"https://nominatim.openstreetmap.org/"',
     'serviceUrl:"/api/nominatim/"'),
    # IP 定位 → 本站
    ('https://freegeoip.stellarium.org/json/', '/api/geoip/json'),
    # 瓦片署名
    ("'© <a target=\"_blank\" rel=\"noopener\" href=\"http://osm.org/copyright\">OpenStreetMap</a> contributors'",
     "'© 高德地图'"),
    # 官方账号后端 → 本站桩（未登录态）
    ('api_base:"https://api.stellarium.com/api/v2"', 'api_base:"./api-v2"'),
]

WASM_PATCHES = [
    # wasm 内硬编码的官方 API 根（同长度替换，余量补 NUL）
    (b'https://api.stellarium.com/api/v2', b'./api-v2'),
    # 引擎内置的 Nominatim / freegeoip → 本站
    (b'https://nominatim.openstreetmap.org', b'./api/nominatim'),
    (b'https://freegeoip.stellarium.org/json/', b'/api/geoip/json'),
]

count = 0
for rel in ['assets/index-Dhk2oPcR.js']:
    p = os.path.join(BASE, rel)
    s = io.open(p, encoding='utf-8').read()
    for old, new in JS_PATCHES:
        n = s.count(old)
        if n:
            s = s.replace(old, new)
            count += n
            print(f'[js] {rel}: {old[:52]}… -> {n} 处')
        else:
            print(f'[js] {rel}: 未找到 {old[:52]}…（可能已改过）')
    io.open(p, 'w', encoding='utf-8').write(s)

p = os.path.join(BASE, 'assets/swe-C40wx6-2.wasm')
data = open(p, 'rb').read()
for old, new in WASM_PATCHES:
    idx = data.find(old)
    if idx >= 0:
        pad = new + b'\x00' * (len(old) - len(new))
        data = data[:idx] + pad + data[idx + len(old):]
        open(p, 'wb').write(data)
        count += 1
        print(f'[wasm] {old.decode()} -> 已改写（idx {idx}）')
    elif new in data:
        print('[wasm] 已改过，跳过')
    else:
        print('[wasm] 未找到目标串！', file=sys.stderr)
        sys.exit(1)

print('done, 共', count, '处')
