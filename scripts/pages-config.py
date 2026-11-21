#!/usr/bin/env python3
"""Cloudflare に登録された本番 URL を調べ、後続の GitHub Actions ステップに渡す。"""
import json
import os
import re
import sys
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


def main():
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
    token = os.environ.get('CLOUDFLARE_API_TOKEN')
    if not account or not token:
        sys.exit('CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN を設定してください。')

    app = os.environ.get('PAGES_APP_PROJECT') or 'posewear-umecchi1098'
    assets = os.environ.get('PAGES_ASSET_PROJECT') or 'posewear-umecchi1098-assets'
    if app == assets:
        sys.exit('アプリと画像には別々の Pages プロジェクトを指定してください。')
    values = {'PAGES_APP_PROJECT': app, 'PAGES_ASSET_PROJECT': assets}

    # 実際に割り当てられたホスト名を使う。プロジェクト名と同じとは限らない。
    label = r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
    for key, project in [('POSEWEAR_SITE', app), ('POSEWEAR_ASSET_HOST', assets)]:
        if not re.fullmatch(label, project):
            sys.exit('Pages プロジェクト名には小文字の英数字とハイフンを指定してください。')
        url = f'https://api.cloudflare.com/client/v4/accounts/{quote(account, safe="")}/pages/projects/{project}'
        request = Request(url, headers={'Authorization': f'Bearer {token}'})
        try:
            with urlopen(request, timeout=30) as response:
                data = json.load(response)
        except HTTPError as error:
            sys.exit(f'Cloudflare が {project} の照会に HTTP {error.code} を返しました。'
                     'アカウント、プロジェクト名、トークンの Pages 権限を確認してください。')
        if not data.get('success'):
            sys.exit(f'Cloudflare から {project} の情報を取得できませんでした。')
        result = data['result']
        if result.get('production_branch') != 'dev':
            sys.exit(f'{project} の Production branch を dev に設定してください。')
        domain = result.get('subdomain', '')
        if not isinstance(domain, str) or not re.fullmatch(label + r'\.pages\.dev', domain):
            sys.exit(f'{project} の pages.dev ドメインを確認できませんでした。')
        values[key] = f'https://{domain}'

    # 両方が有効になってから公開情報だけをまとめて保存する。トークンは書き込まない。
    with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as output:
        for key, value in values.items():
            print(f'{key}={value}', file=output)
    print(f"アプリ {values['POSEWEAR_SITE']} / 画像 {values['POSEWEAR_ASSET_HOST']}")


if __name__ == '__main__':
    main()
