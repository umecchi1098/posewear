#!/usr/bin/env python3
"""Cloudflareに登録されたプロジェクトを照合し、ビルドと公開確認で使うURLを揃える。"""
import argparse
import json
import os
import re
import sys
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


def project_request(account, project, token, *, migrate=False):
    # PATCHには変更したい項目だけを渡し、既存のドメインや設定を維持する。
    url = f'https://api.cloudflare.com/client/v4/accounts/{quote(account, safe="")}/pages/projects/{project}'
    request = Request(url, headers={'Authorization': f'Bearer {token}'})
    if migrate:
        request.method = 'PATCH'
        request.add_header('Content-Type', 'application/json')
        request.data = b'{"production_branch":"main"}'
    try:
        with urlopen(request, timeout=30) as response:
            data = json.load(response)
    except HTTPError as error:
        sys.exit(f'Cloudflare が {project} の {request.get_method()} に HTTP {error.code} を返しました。'
                 'アカウント、プロジェクト名、トークンの Pages 権限を確認してください。')
    if not data.get('success'):
        sys.exit(f'Cloudflare で {project} の {request.get_method()} が失敗しました。')
    return data['result']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--migrate', action='store_true', help='既存の本番ブランチを dev から main に切り替える')
    args = parser.parse_args()
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
    token = os.environ.get('CLOUDFLARE_API_TOKEN')
    if not account or not token:
        sys.exit('CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN を設定してください。')

    app = os.environ.get('PAGES_APP_PROJECT') or 'posewear-umecchi1098'
    assets = os.environ.get('PAGES_ASSET_PROJECT') or 'posewear-umecchi1098-assets'
    if app == assets:
        sys.exit('アプリと画像には別々の Pages プロジェクトを指定してください。')
    branch = os.environ.get('PAGES_BRANCH', 'dev')
    if not re.fullmatch(r'main|dev|pr-[1-9][0-9]*', branch):
        sys.exit('公開ブランチは main、dev、pr-番号のいずれかを指定してください。')
    if args.migrate and (os.environ.get('GITHUB_REPOSITORY') != 'umecchi1098/posewear'
                         or os.environ.get('GITHUB_EVENT_NAME') != 'push'
                         or branch not in ('main', 'dev')
                         or os.environ.get('GITHUB_REF') != f'refs/heads/{branch}'):
        sys.exit('本番ブランチの移行は、このリポジトリの dev または main の push で実行してください。')
    values = {'PAGES_APP_PROJECT': app, 'PAGES_ASSET_PROJECT': assets}
    label = r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
    # 2件とも事前に照合する。途中で通信に失敗しても、次回はまだdevの分だけを更新する。
    pending = []
    for key, prod_key, project in [('POSEWEAR_SITE', 'POSEWEAR_PRODUCTION_SITE', app),
                                   ('POSEWEAR_ASSET_HOST', 'POSEWEAR_PRODUCTION_ASSET_HOST', assets)]:
        if not re.fullmatch(label, project):
            sys.exit('Pages プロジェクト名には小文字の英数字とハイフンを指定してください。')
        result = project_request(account, project, token)
        current = result.get('production_branch')
        if current == 'dev' and args.migrate:
            pending.append(project)
        elif current != 'main':
            sys.exit(f'{project} の Production branch が main ではありません。現在値: {current}')
        domain = result.get('subdomain', '')
        if not isinstance(domain, str) or not re.fullmatch(label + r'\.pages\.dev', domain):
            sys.exit(f'{project} の pages.dev ドメインを確認できませんでした。')
        values[prod_key] = f'https://{domain}'
        # アプリのプレビューからも通常は本番素材を使い、素材変更の検証時だけ専用URLを使う。
        use_preview = branch != 'main' and (project == app or os.environ.get('PAGES_PREVIEW_ASSETS') == 'true')
        values[key] = f'https://{branch}.{domain}' if use_preview else values[prod_key]

    for project in pending:
        project_request(account, project, token, migrate=True)
        if project_request(account, project, token).get('production_branch') != 'main':
            sys.exit(f'{project} の本番ブランチを main に切り替えられませんでした。')
        print(f'{project}: 本番ブランチを dev から main に変更しました。')

    # URLとプロジェクト名だけを後続ステップへ渡す。トークンは書き込まない。
    with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as output:
        for key, value in values.items():
            print(f'{key}={value}', file=output)
    print(f"アプリ {values['POSEWEAR_SITE']} / 画像 {values['POSEWEAR_ASSET_HOST']}")


if __name__ == '__main__':
    main()
