"""公開済み素材の版を選び、同じカタログからアプリを繰り返しビルドする。"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

FILES = ('pose/data.json', 'costume/data.json', 'anime/data.json', 'portrait/images.js', 'portrait/ranking.js')
RAW = Path('assets-raw')
RELEASE = Path('dist-assets/release')
# 初回移行前の公開済みカタログ。上流が先に変わっていた場合は古い画像と組み合わせない。
LEGACY = dict(zip(FILES, [
    '60051d52ecdfc5655c29cae88d2b92a4880e65a0dd90042dde461b8bbdc33677',
    'bb05a2c3d4a117e25d065a328d60ab7d4d912f01de07599169d6ad69d976378d',
    'dff221de58ac2235e66860cf502b77eec2febd5889aa89eec423adf6e951878b',
    '1e99bce2a37f9edf24c4683db9251698d588ad9d4026ee3e1b80b8f0fcbc9405',
    '28dad6975b142c5f00b07911da8e79fcd75d02af48d6e09e3be352f817eab5f7',
]))


def read_url(url):
    # Pages側が配信元を判別できるよう、検証ツール名を明示する。
    with urlopen(Request(url, headers={'User-Agent': 'PoseWear-Deploy-Check/1.0'}), timeout=60) as response:
        return response.read()


def restore(host, manifest):
    # 全5ファイルを照合する。途中で版が切り替わっても壊れた組み合わせを公開しない。
    for name in FILES:
        path = RAW / name
        if host:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(read_url(f'{host}/release/{name}'))
        if hashlib.sha256(path.read_bytes()).hexdigest() != manifest[name]:
            raise SystemExit(f'公開済みの素材一覧とチェックサムが一致しません: {name}')


def prepare(version):
    branch = os.environ['PAGES_BRANCH']
    production = os.environ['POSEWEAR_PRODUCTION_ASSET_HOST']
    manifest = None
    try:
        manifest = json.loads(read_url(production + '/release/manifest.json'))
    except HTTPError as error:
        if error.code != 404:
            raise
    full = branch != 'dev' and (manifest is None or manifest['version'] != version)
    host = production
    media = production
    if full and branch.startswith('pr-'):
        host = production.replace('https://', f'https://{branch}.', 1)
        media = host
    elif full:
        # マージ済みPRで検証したメタデータを使用する。画像の実体も公開直前に比較する。
        number = os.environ.get('MERGED_PR', '')
        if not re.fullmatch('[1-9][0-9]*', number):
            raise SystemExit('素材を本番に反映するには、main向けPRのプレビューが必要です。')
        preview = production.replace('https://', f'https://pr-{number}.', 1)
        candidate = json.loads(read_url(preview + '/release/manifest.json'))
        if candidate['version'] != version:
            raise SystemExit('素材の版がPRプレビューと一致しません。')
        restore(preview, candidate['catalogs'])
        Path('expected-assets.sha256').write_text(candidate['content'])
    elif manifest:
        restore(production, manifest['catalogs'])
    else:
        # 初回だけ従来版のメタデータを取得。以後の開発ビルドは前回配信した5ファイルを使う。
        seed = os.environ['POSEWEAR_SITE']
        try:
            restore(seed, LEGACY)
        except HTTPError as error:
            if error.code != 404:
                raise
            subprocess.run(['python3', 'scripts/fetch-assets.py', '--meta-only'], check=True)
            restore(None, LEGACY)
        media = os.environ['POSEWEAR_PRODUCTION_SITE']
    with open(os.environ['GITHUB_ENV'], 'a') as output:
        print(f'POSEWEAR_MEDIA_HOST={media}', f'POSEWEAR_ASSET_HOST={host}',
              f'POSEWEAR_BUILD_ASSETS={int(full)}', f'ASSET_VERSION={version}', sep='\n', file=output)
    print(f'{branch}: ' + ('素材とアプリを更新' if full else '公開済み素材でアプリだけ更新'))


def snapshot(version):
    # 固定したカタログを次回も配信できるよう、画像と同じデプロイに保存する。
    catalogs = {}
    for name in FILES:
        target = RELEASE / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(RAW / name, target)
        catalogs[name] = hashlib.sha256(target.read_bytes()).hexdigest()
    # パスと中身を照合するので、上流が同じURLの画像を差し替えても検出できる。
    root = RELEASE.parent
    digest = hashlib.sha256()
    for path in sorted(p for p in root.rglob('*') if p.is_file() and p != RELEASE / 'manifest.json'):
        digest.update(path.relative_to(root).as_posix().encode() + b'\0')
        with path.open('rb') as stream:
            digest.update(hashlib.file_digest(stream, 'sha256').digest())
    content = digest.hexdigest()
    if os.environ['PAGES_BRANCH'] == 'main' and Path('expected-assets.sha256').read_text() != content:
        raise SystemExit('素材がPRで検証した内容と一致しないため、公開を停止しました。')
    (RELEASE / 'manifest.json').write_text(json.dumps(dict(version=version, catalogs=catalogs, content=content)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['prepare', 'snapshot'])
    args = parser.parse_args()
    version = Path('pages-assets-version.txt').read_text().strip()
    if not re.fullmatch(r'v[1-9][0-9]*', version):
        raise SystemExit('素材版は v1、v2 の形式で指定してください。')
    (prepare if args.operation == 'prepare' else snapshot)(version)
