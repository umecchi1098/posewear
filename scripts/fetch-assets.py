#!/usr/bin/env python3
"""从原作者的公开图库下载构建所需的数据与图片到 ./assets-raw（或 POSEWEAR_RAW）。

图片与原始数据版权归各自作者所有，本仓库不包含任何素材。
请只用于本地构建与学习，遵守原站的使用条款；下载时请保持低并发，不要反复全量抓取。

用法：
  python3 scripts/fetch-assets.py              # 全部
  python3 scripts/fetch-assets.py pose costume # 只下载部分素材库
  python3 scripts/fetch-assets.py --meta-only  # 只下载数据，不下载图片
  python3 scripts/fetch-assets.py --images-only  # 使用已保存的数据，只补齐图片
"""
import argparse, json, os, re, time, urllib.parse, urllib.request, concurrent.futures as cf
from pathlib import Path

SRC = {
    'pose': 'https://ai-pose-gallery.pages.dev/',
    'costume': 'https://ai-costume-gallery.pages.dev/',
    'anime': 'https://ai-costume-anime-gallery.pages.dev/',
    'portrait': 'https://ai-portrait-gallery.pages.dev/',
}
OUT = os.environ.get('POSEWEAR_RAW', 'assets-raw')
UA = {'User-Agent': 'Mozilla/5.0 (PoseWear local build)'}
WORKERS = 4


def image_header(data):
    # 配信元が画像の代わりにエラーページを200で返しても、素材として保存しない。
    return (data.startswith(b'\x89PNG\r\n\x1a\n') or data.startswith(b'\xff\xd8\xff')
            or (data.startswith(b'RIFF') and data[8:12] == b'WEBP'))


def _curl(url, path):
    """urllib 经代理时偶发 IncompleteRead 中断，curl 更稳，作为兜底。"""
    import subprocess
    if path is None:
        r = subprocess.run(['curl', '-sS', '-f', '-A', UA['User-Agent'], '--max-time', '90', url],
                           capture_output=True, timeout=120)
        return r.stdout if r.returncode == 0 and r.stdout else None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    r = subprocess.run(['curl', '-sS', '-f', '-A', UA['User-Agent'], '--max-time', '90', '-o', path + '.part', url],
                       capture_output=True, timeout=120)
    if r.returncode == 0:
        with open(path + '.part', 'rb') as image:
            valid = image_header(image.read(12))
        if valid:
            os.replace(path + '.part', path)
            return os.path.getsize(path)
    return 0


def get(url, path=None, tries=4):
    if path and os.path.isfile(path):
        with open(path, 'rb') as image:
            if image_header(image.read(12)):
                return 0
    for i in range(tries):
        try:
            b = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
            if not b:
                raise OSError('Empty response')
            if path is None:
                return b
            if not image_header(b):
                raise ValueError('Expected a PNG, JPEG or WebP image')
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path + '.part', 'wb').write(b)
            os.replace(path + '.part', path)
            return len(b)
        except Exception as e:
            err = e
            time.sleep(2 + i * 3)
    r = _curl(url, path)
    if r:
        return r
    # キャッシュの再利用だけを 0 とする。取得失敗は公開前にビルドを停止させる。
    raise RuntimeError(f'ダウンロードに失敗しました: {url}') from err


def inline_data(html):
    """原站把数据写在页面里的 const X=...; 中。"""
    out = {}
    for name in ['META', 'D', 'ANG', 'POSES', 'PMAP', 'JA']:
        m = re.search(r'const ' + name + r'=(.*?);\n', html)
        if m:
            try:
                out[name] = json.loads(m.group(1))
            except ValueError:
                if name == 'D':
                    print('解析失败', name)
    return out


def image_paths(lib, refresh):
    base, directory = SRC[lib], Path(OUT) / lib
    directory.mkdir(parents=True, exist_ok=True)
    if lib in ('pose', 'costume', 'anime'):
        # CI では一覧を更新してから画像キャッシュを復元する。画像取得中は同じ一覧を使う。
        catalog = directory / 'data.json'
        if refresh:
            html = get(base).decode('utf-8')
            data = inline_data(html)
            if not data.get('D'):
                raise ValueError(f'{lib}: 素材一覧が空か、取得元のページ構造が変わりました')
            catalog.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
            (directory / 'index.html').write_text(html, encoding='utf-8')
        rows = json.loads(catalog.read_text(encoding='utf-8'))['D']
        keys = {'pose': ['サムネ', '原寸'], 'costume': ['サムネ', '画像', '原寸'], 'anime': ['サムネ', '画像', '原寸']}[lib]
    else:
        if refresh:
            for name in ('images.js', 'ranking.js'):
                (directory / name).write_bytes(get(base + 'data/' + name))
        t = (directory / 'images.js').read_text(encoding='utf-8')
        rows = json.loads(t[t.index('['):t.rindex(']') + 1])
        keys = ['thumb', 'full']

    if not rows:
        raise ValueError(f'{lib}: 素材一覧が空です')
    paths = []
    for row in rows:
        # ID は公開ファイル名にもなる。外部の一覧からディレクトリを指定させない。
        if not re.fullmatch(r'[\w-]+', row['id']):
            raise ValueError(f"{lib}: 不正な素材ID: {row['id']!r}")
        for key in keys:
            path = row[key]
            # 素材元にある画像ディレクトリの相対パスだけを、保存と取得の両方に使う。
            if not re.fullmatch(r'(?:img|png|thumbs)/(?:[\w-]+/)*[\w.-]+\.(?:png|jpe?g|webp)', path, re.I):
                raise ValueError(f'{lib}: 不正な画像パス: {path!r}')
            paths.append(path)
    return list(dict.fromkeys(paths))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('libraries', nargs='*', metavar='LIB')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--meta-only', action='store_true', help='カタログだけを取得する')
    mode.add_argument('--images-only', action='store_true', help='保存済みのカタログに従って不足画像を取得する')
    args = parser.parse_args()
    for lib in args.libraries or SRC:
        if lib not in SRC:
            parser.error(f'Unknown library: {lib}')
        files = image_paths(lib, refresh=not args.images_only)
        print(f'{lib}: {len(files)} 个文件', flush=True)
        if args.meta_only:
            continue
        jobs = [(SRC[lib] + urllib.parse.quote(f), os.path.join(OUT, lib, f)) for f in files]
        n = 0
        with cf.ThreadPoolExecutor(WORKERS) as ex:
            for i, s in enumerate(ex.map(lambda j: get(*j), jobs)):
                n += s or 0
                if i % 200 == 0:
                    print(f'  {i}/{len(jobs)}  {n / 1e6:.0f} MB', flush=True)
    print('完成。接下来运行：python3 build.py')


if __name__ == '__main__':
    main()
