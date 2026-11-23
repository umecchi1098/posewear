#!/usr/bin/env python3
"""Cloudflareの準備後、一度だけ実行してフォークに接続情報を登録し、dev プレビューを開始する。"""
import getpass
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

REPO = 'umecchi1098/posewear'
WORKFLOW = '.github/workflows/pages-dev.yml'


def gh(*args, input_text=None, capture=False):
    # トークンをコマンドの引数や履歴に残さず、gh の標準入力へ渡す。
    result = subprocess.run(['gh', *args], input=input_text, text=True,
                            stdout=subprocess.PIPE if capture else None, check=True)
    return result.stdout


def main():
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)
    gh('auth', 'status', '--active', '--hostname', 'github.com', capture=True)
    head = gh('api', f'repos/{REPO}/git/ref/heads/dev', '--jq', '.object.sha', capture=True).strip()
    config = dict(os.environ)
    for name, label, default in [
        ('CLOUDFLARE_ACCOUNT_ID', 'Cloudflare Account ID', ''),
        ('PAGES_APP_PROJECT', 'アプリ用Pagesプロジェクト名', 'posewear-umecchi1098'),
        ('PAGES_ASSET_PROJECT', '画像用Pagesプロジェクト名', 'posewear-umecchi1098-assets'),
    ]:
        if not config.get(name):
            config[name] = input(label + (f' [{default}]' if default else '') + ': ').strip() or default
    if not config.get('CLOUDFLARE_API_TOKEN'):
        config['CLOUDFLARE_API_TOKEN'] = getpass.getpass('Cloudflare API Token（入力は非表示）: ').strip()

    # 2つの実在する公開先と本番ブランチを照合してから、GitHubの設定を書き換える。
    with tempfile.NamedTemporaryFile() as output:
        subprocess.run([sys.executable, 'scripts/pages-config.py'], check=True,
                       env={**config, 'GITHUB_ENV': output.name})
    for key in ('PAGES_APP_PROJECT', 'PAGES_ASSET_PROJECT'):
        gh('variable', 'set', key, '--repo', REPO, '--body', config[key])
    for key in ('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'):
        gh('secret', 'set', key, '--repo', REPO, input_text=config[key])

    # dev にだけ置いたワークフローでも動くよう、既定ブランチに依存する手動起動は使わない。
    runs = json.loads(gh('api', f'repos/{REPO}/actions/runs?branch=dev&head_sha={head}&per_page=100',
                         capture=True))['workflow_runs']
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    for run in runs:
        if run['path'] != WORKFLOW or run['event'] != 'push':
            continue
        if run['status'] != 'completed':
            # 並行している初回実行は認証情報の登録前に開始した可能性がある。
            gh('run', 'watch', str(run['id']), '--repo', REPO, '--interval', '10')
        if datetime.fromisoformat(run['created_at'].replace('Z', '+00:00')) > cutoff:
            gh('run', 'rerun', str(run['id']), '--repo', REPO)
            print(f"dev プレビューを開始しました。進捗: {run['html_url']}")
            return

    # 初回の準備から30日以上経って再実行できないときは、ファイルを変えないコミットで起動する。
    branch = subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip()
    local = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    remote = subprocess.check_output(['git', 'remote', 'get-url', '--push', 'origin'], text=True).strip()
    if branch != 'dev' or local != head or remote.removesuffix('.git') not in (
        'https://github.com/' + REPO, 'git@github.com:' + REPO
    ):
        sys.exit('接続情報は登録済みです。最新の dev を次にpushするとプレビューが更新されます。')
    subprocess.run(['git', 'commit', '--allow-empty', '--only', '-m', 'Cloudflare Pagesの初回公開を開始'], check=True)
    subprocess.run(['git', 'push', 'origin', 'HEAD:dev'], check=True)
    print(f'dev プレビューを開始しました。進捗: https://github.com/{REPO}/actions')


if __name__ == '__main__':
    main()
