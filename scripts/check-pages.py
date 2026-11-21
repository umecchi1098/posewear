"""分割ビルドの配布先とファイルを検証し、--live 指定時には実際の公開先にもアクセスする。"""
import argparse
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from xml.etree import ElementTree


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='公開済みの2つのサイトも検証する')
    args = parser.parse_args()
    site = os.environ['POSEWEAR_SITE'].rstrip('/')
    assets = os.environ['POSEWEAR_ASSET_HOST'].rstrip('/')
    if not site or not assets or site == assets:
        raise SystemExit('アプリ本体と素材には異なる公開URLを指定してください。')

    app_dir = Path('dist')
    asset_dir = Path('dist-assets')
    # 無料プランの上限をアップロード前に確認する。空ファイルは素材照合時にも区別する。
    files = {}
    for folder in (app_dir, asset_dir):
        sizes = {p.relative_to(folder).as_posix(): p.stat().st_size
                 for p in folder.rglob('*') if p.is_file()}
        if not 0 < len(sizes) <= 20_000:
            raise SystemExit(f'{folder}: ファイル数が範囲外です ({len(sizes)})')
        for path, size in sizes.items():
            if size > 25 * 1024 * 1024:
                raise SystemExit(f'{folder / path}: 1ファイルあたり25 MiBを超えています')
        files[folder] = sizes
        print(f'{folder}: {len(sizes):,} files')

    app_script, = (app_dir / 'assets').glob('app.*.js')
    font, = (app_dir / 'assets').glob('noto-sans-jp.*.woff2')
    script_path = app_script.relative_to(app_dir).as_posix()
    index = (app_dir / 'index.html').read_text()
    for tag in (f'<link rel="canonical" href="{site}/">', f'property="og:url" content="{site}/"',
                f'property="og:image" content="{site}/og.png"'):
        if tag not in index:
            raise SystemExit('トップページの検索・共有用URLが公開先と一致しません')
    if f'/{script_path}' not in index:
        raise SystemExit('index.html がビルド済みスクリプトを参照していません')
    if assets + '/' not in app_script.read_text():
        raise SystemExit('アプリに指定した素材配信先が含まれていません')
    maps = ElementTree.parse(app_dir / 'sitemap.xml').findall('.//{*}loc')
    if not maps or not all(loc.text and loc.text.startswith(site + '/') for loc in maps):
        raise SystemExit('サイトマップの公開先が POSEWEAR_SITE と一致しません')

    # サムネイルと原寸は素材サイト、画面で拡大する画像はアプリ本体に配置される。
    # 深度ポーズは提供元への外部リンクなので、コピーする4つのカタログだけを照合する。
    samples = [(site, app_script), (site, font), (site, app_dir / 'sitemap.xml')]
    for name in ('poses', 'costumes', 'anime', 'portraits'):
        catalog, = (app_dir / 'assets').glob(f'{name}.*.json')
        items = json.loads(catalog.read_text())
        if not items:
            raise SystemExit(f'{catalog}: カタログに素材がありません')
        for index, item in enumerate(items):
            for angle, row in enumerate(item.get('angles', [item])):
                for key in ('t', 'o', 'i', 'm'):
                    if key == 'm' and name == 'poses':
                        continue
                    folder = asset_dir if key in ('t', 'o') else app_dir
                    path = row[key]
                    if not files[folder].get(path):
                        raise SystemExit(f'{catalog.name}: 対応する素材がありません: {folder / path}')
                    if index == 0 and angle == 0:
                        samples.append((assets if folder == asset_dir else site, folder / path))
        print(f'{name}: {len(items):,} items')

    if not args.live:
        return
    # 成功コードだけを返す404フォールバックや古いデプロイを取り違えないよう、実体も照合する。
    with urlopen(site + '/', timeout=30) as response:
        if f'/{script_path}' not in response.read().decode():
            raise SystemExit('公開トップページに今回のスクリプトが含まれていません')
    for origin, path in dict.fromkeys(samples):
        url = origin + '/' + path.relative_to(asset_dir if origin == assets else app_dir).as_posix()
        with urlopen(url, timeout=30) as response:
            if response.read() != path.read_bytes():
                raise SystemExit(f'配信内容がビルド結果と一致しません: {url}')

    # 転送先を指定しない同一サイトからのリクエストは、このFunction内で400のJSONを返す。
    # 画像生成APIの呼び出しが発生しない状態で、Functionsも公開されたことを確かめる。
    request = Request(site + '/api/proxy', headers={'Origin': site})
    try:
        with urlopen(request, timeout=30):
            raise SystemExit('APIプロキシが入力チェックのエラーを返しませんでした')
    except HTTPError as err:
        if err.code != 400 or 'x-target-url' not in json.load(err).get('error', {}).get('message', ''):
            raise SystemExit(f'APIプロキシの応答が想定と異なります: HTTP {err.code}') from err
    print('アプリ、素材、サイトマップ、フォント、Pages Function の公開を確認しました。')


if __name__ == '__main__':
    main()
