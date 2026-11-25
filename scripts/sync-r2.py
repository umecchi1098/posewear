#!/usr/bin/env python3
"""把本地目录同步到 R2 桶 posewear-assets（图片分发，绑定域名 pwimg.0vo.pro）。

用法：
  python3 scripts/sync-r2.py <本地目录> [--workers 8] [--journal 路径]

- 对象键 = 相对目录路径；带一年 immutable 缓存头上传。
- 断点续传：journal 记录已完成的对象键，重跑自动跳过；失败键记到 <journal>.fail。
- 凭据：环境变量 CLOUDFLARE_API_TOKEN（需 R2 编辑权限），或本机 wrangler 登录态
  （自动读 ~/.config/.wrangler/config/default.toml 的 oauth_token，约 1 小时过期需刷新）。
- 账号：环境变量 CLOUDFLARE_ACCOUNT_ID，缺省用本项目账号。
- 并发别开太高（>8 容易触发 Cloudflare 429）；只补增量时先 diff 再传，别全量重传。

缩略图（t/）与原图（o/）走 R2；中图（m/、i/）是主站同源文件，不进 R2。
"""
import os, re, sys, time, threading, concurrent.futures as cf

try:
    import requests
except ImportError:
    sys.exit("需要 requests：pip install requests")

ACCT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "afe9843ff43f538bb81b8ba44ea7891c")
BUCKET = os.environ.get("POSEWEAR_R2_BUCKET", "posewear-assets")
TOML = os.path.expanduser("~/.config/.wrangler/config/default.toml")
CT = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
      ".json": "application/json", ".txt": "text/plain"}
CC = "public, max-age=31536000, immutable"


def get_token():
    tok = os.environ.get("CLOUDFLARE_API_TOKEN")
    if tok:
        return tok
    txt = open(TOML).read()
    return re.search(r'oauth_token\s*=\s*"([^"]+)"', txt).group(1)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(zip([a for a in sys.argv[1:] if a.startswith("--")][::1],
                    [sys.argv[i + 1] for i, a in enumerate(sys.argv) if a.startswith("--")]))
    if not args:
        sys.exit(__doc__)
    root = args[0]
    workers = int(opts.get("--workers", 8))
    journal_path = opts.get("--journal", os.path.join(root, ".r2-journal"))
    fail_path = journal_path + ".fail"

    done = set()
    if os.path.exists(journal_path):
        done = set(l.strip() for l in open(journal_path) if l.strip())
    keys = []
    for dp, _, fns in os.walk(root):
        for fn in fns:
            rel = os.path.relpath(os.path.join(dp, fn), root).replace(os.sep, "/")
            if rel != os.path.basename(journal_path) and rel not in done:
                keys.append(rel)
    print(f"待上传 {len(keys)} 个（已完成 {len(done)} 跳过），并发 {workers}")
    if not keys:
        return
    token = [get_token(), time.time()]
    tlock = threading.Lock()
    tls = threading.local()

    def tok():
        with tlock:
            if time.time() - token[1] > 600 and not os.environ.get("CLOUDFLARE_API_TOKEN"):
                token[0], token[1] = get_token(), time.time()
            return token[0]

    def sess():
        if not hasattr(tls, "s"):
            tls.s = requests.Session()
        return tls.s

    jf = open(journal_path, "a")
    ff = open(fail_path, "a")
    jlock = threading.Lock()
    stats = {"ok": 0, "fail": 0}

    def put_one(rel):
        url = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/r2/buckets/{BUCKET}/objects/{rel}"
        ext = os.path.splitext(rel)[1].lower()
        headers = {"Content-Type": CT.get(ext, "application/octet-stream"),
                   "Cache-Control": CC, "Authorization": "Bearer " + tok()}
        data = open(os.path.join(root, rel), "rb").read()
        delay, last = 1.0, None
        for _ in range(7):
            try:
                r = sess().put(url, data=data, headers=headers, timeout=120)
                if r.status_code == 200:
                    with jlock:
                        jf.write(rel + "\n"); jf.flush(); stats["ok"] += 1
                    return
                last = f"{r.status_code} {r.text[:120]}"
                if r.status_code == 429:
                    time.sleep(delay * 4)
            except Exception as e:
                last = repr(e)
            time.sleep(delay); delay = min(delay * 2, 30)
        with jlock:
            ff.write(rel + "\t" + str(last) + "\n"); ff.flush(); stats["fail"] += 1

    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(put_one, keys))
    print(f"完成：ok {stats['ok']}，fail {stats['fail']}，用时 {time.time() - t0:.0f}s")
    if stats["fail"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
