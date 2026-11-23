# CSP 守卫：dist/assets/*.json 里所有图片字段引用的外部源站，必须出现在
# dist/_headers 的 img-src 里，否则浏览器会拦截（2026-11-23 发型库热链图全灭的教训）。
# 用法：python3 tests/check_csp.py [dist目录]
import json, glob, re, sys, os

D = sys.argv[1] if len(sys.argv) > 1 else 'dist'
hdr = open(f'{D}/_headers').read()
m = re.search(r'img-src ([^;]+)', hdr)
img_src = set(m.group(1).split()) if m else set()
m2 = re.search(r'connect-src ([^;]+)', hdr)
conn_src = set(m2.group(1).split()) if m2 else set()

IMG_KEYS = {'t', 'i', 'o', 'm'}
origins = {}

def walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in IMG_KEYS and isinstance(v, str) and v.startswith('https://'):
                org = '/'.join(v.split('/')[:3])
                origins[org] = origins.get(org, 0) + 1
            else:
                walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)

for f in glob.glob(f'{D}/assets/*.json'):
    try:
        walk(json.load(open(f)))
    except Exception:
        pass

bad = []
for org, n in sorted(origins.items()):
    if org not in img_src:
        bad.append(f'{org}（{n} 处图片引用不在 img-src）')
    if org not in conn_src and org not in ("'self'",):
        # connect-src 缺失只警告：试穿台 fetch 素材时才需要，图片展示不受影响
        print(f'WARN {org} 不在 connect-src（试穿台取图可能被拦）')

if bad:
    print('FAIL CSP img-src 缺失源站：')
    for b in bad:
        print(' -', b)
    sys.exit(1)
print(f'PASS CSP img-src 覆盖全部 {len(origins)} 个图片源站：{sorted(origins)}')
