"""分割ビルドの配布先とファイルを検証し、--live 指定時には実際の公開先にもアクセスする。"""
import argparse
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from xml.etree import ElementTree


def public_request(url, *, origin=None, method='GET'):
    # 公開確認用のクライアント名を明記し、画像はブラウザーと同じ Origin でも確認する。
    headers = {'User-Agent': 'PoseWear-Deploy-Check/1.0'}
    if origin:
        headers['Origin'] = origin
    return Request(url, method=method, headers=headers)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='公開したアプリと素材の配信内容も検証する')
    args = parser.parse_args()
    site = os.environ['POSEWEAR_SITE'].rstrip('/')
    assets = os.environ['POSEWEAR_ASSET_HOST'].rstrip('/')
    media = os.environ.get('POSEWEAR_MEDIA_HOST', '').rstrip('/')
    build_assets = os.environ.get('POSEWEAR_BUILD_ASSETS') == '1'
    app_only = bool(media) and not build_assets
    if build_assets and media != assets:
        raise SystemExit('素材更新では表示用画像と原寸画像を同じ公開先に配置してください。')
    if not site or not assets or site == assets:
        raise SystemExit('アプリ本体と素材には異なる公開URLを指定してください。')

    app_dir = Path('dist')
    asset_dir = Path('dist-assets')
    # 無料プランの上限をアップロード前に確認する。空ファイルは素材照合時にも区別する。
    files = {}
    # アプリ単独ビルドでは、共有画像は以前の公開先にあるため手元の出力に含まれない。
    for folder in ((app_dir,) if app_only else (app_dir, asset_dir)):
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

    # 素材は新形式ではすべて素材サイトに、旧形式では表示用画像だけアプリ側にある。
    # 深度ポーズは提供元への外部リンクなので、コピーする4つのカタログだけを照合する。
    samples = {site + '/' + p.relative_to(app_dir).as_posix(): p
               for p in (app_script, font, app_dir / 'sitemap.xml')}
    shared_samples = set()
    for name in ('poses', 'costumes', 'anime', 'portraits'):
        catalog, = (app_dir / 'assets').glob(f'{name}.*.json')
        samples[site + '/' + catalog.relative_to(app_dir).as_posix()] = catalog
        items = json.loads(catalog.read_text())
        if not items:
            raise SystemExit(f'{catalog}: カタログに素材がありません')
        for index, item in enumerate(items):
            for angle, row in enumerate(item.get('angles', [item])):
                for key in ('t', 'o', 'i', 'm'):
                    if key == 'm' and name == 'poses':
                        continue
                    # 固定した素材版を使うとき、表示画像のURLはカタログ内に保存される。
                    # サムネイル・原寸の相対パスには、アプリと同じ素材ホストを補う。
                    external_media = media and key in ('i', 'm')
                    path = row[key]
                    if external_media:
                        if not path.startswith(media + '/'):
                            raise SystemExit(f'{catalog.name}: 表示用画像の配信先が違います: {path}')
                        path = path[len(media) + 1:]
                    if not path or path.startswith('/') or '://' in path or '..' in Path(path).parts:
                        raise SystemExit(f'{catalog.name}: 素材の相対パスが不正です: {path}')
                    folder = asset_dir if build_assets or key in ('t', 'o') else app_dir
                    origin = media if external_media else (assets if folder == asset_dir else site)
                    if not app_only and not files[folder].get(path):
                        raise SystemExit(f'{catalog.name}: 対応する素材がありません: {folder / path}')
                    if index == 0 and angle == 0:
                        url = origin + '/' + path
                        if app_only:
                            shared_samples.add(url)
                        else:
                            samples[url] = folder / path
        print(f'{name}: {len(items):,} items')

    # ビルドに含まれない画像は、公開前にも各カタログから代表例を照会する。
    # HEAD なら原寸画像をダウンロードせず、404時のHTML応答とCORS設定も判別できる。
    for url in sorted(shared_samples):
        with urlopen(public_request(url, origin=site, method='HEAD'), timeout=30) as response:
            if not response.headers.get_content_type().startswith('image/'):
                raise SystemExit(f'共有素材から画像が返りません: {url}')
            if response.headers.get('Access-Control-Allow-Origin') not in ('*', site):
                raise SystemExit(f'共有素材のCORS設定でアプリが許可されていません: {url}')

    if not args.live:
        return
    # 成功コードだけを返す404フォールバックや古いデプロイを取り違えないよう、実体も照合する。
    with urlopen(public_request(site + '/'), timeout=30) as response:
        if f'/{script_path}' not in response.read().decode():
            raise SystemExit('公開トップページに今回のスクリプトが含まれていません')
    for url, path in samples.items():
        with urlopen(public_request(url), timeout=30) as response:
            if response.read() != path.read_bytes():
                raise SystemExit(f'配信内容がビルド結果と一致しません: {url}')

    # 転送先を指定しない同一サイトからのリクエストは、このFunction内で400のJSONを返す。
    # 画像生成APIの呼び出しが発生しない状態で、Functionsも公開されたことを確かめる。
    request = public_request(site + '/api/proxy', origin=site)
    try:
        with urlopen(request, timeout=30):
            raise SystemExit('APIプロキシが入力チェックのエラーを返しませんでした')
    except HTTPError as err:
        if err.code != 400 or 'x-target-url' not in json.load(err).get('error', {}).get('message', ''):
            raise SystemExit(f'APIプロキシの応答が想定と異なります: HTTP {err.code}') from err
    print('アプリ、素材、サイトマップ、フォント、Pages Function の公開を確認しました。')


if __name__ == '__main__':
    main()
