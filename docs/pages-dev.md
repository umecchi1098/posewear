# フォークの dev を Cloudflare Pages で公開する

`umecchi1098/posewear` の `dev` にpushすると、GitHub ActionsのLinuxランナーが素材を取得し、アプリと画像を別々のPagesプロジェクトに公開します。公開後にMacを起動し続ける必要はありません。

## 初回のCloudflare設定

1. Cloudflareで **Direct Upload** のPagesプロジェクトを2つ用意します。本番ブランチはどちらも `dev`。例はアプリが `posewear-umecchi1098`、画像が `posewear-umecchi1098-assets` です。Wranglerで作る場合は以下を実行します。
2. 対象アカウントのAccount IDと、そのアカウントだけに **Account → Cloudflare Pages → Edit** を許可したAPIトークンを用意します。
3. GitHub CLIで自分のフォークにログイン済みのMacから、以下の初期設定を一度実行します。トークンはターミナルの非表示入力へ入力します。

```bash
# Cloudflare側でプロジェクトを作成する場合
npx wrangler login
npx wrangler pages project create posewear-umecchi1098 --production-branch dev
npx wrangler pages project create posewear-umecchi1098-assets --production-branch dev

# フォークの最新のdevで、Cloudflare設定をGitHubへ登録して初回公開を起動
python3 scripts/setup-pages.py
```

初期設定は両方のプロジェクト名・本番ブランチ・実際の公開URLをCloudflare APIで照合し、フォークにActions SecretsとVariablesを登録します。サブドメインはCloudflareの割り当てを使います。別のプロジェクト名を使った場合は入力時に指定してください。初回の準備待ち実行を再実行し、そのURLを表示します。再実行できる履歴がない場合は、手元のdevがフォークの最新と一致しているときだけ、ファイル変更を含まない起動用コミットをpushします。

非対話実行では `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` を環境変数から渡せます。プロジェクト名も初期値を使う場合を含めて `PAGES_APP_PROJECT` と `PAGES_ASSET_PROJECT` を指定します。

## 通常の公開

- `git push origin dev` で公開を開始します。初回は上流4サイトから数GBの素材を取得します。次回以降はカタログを更新し、GitHub Actionsの画像キャッシュを再利用します。既存URLの画像差し替えを反映したい場合は、その素材ライブラリの `pages-images-` キャッシュを削除して再実行してください。
- 素材を同梱する前に、各素材元の公開・再配信条件を確認してください。元画像はActionsが取得し、Gitには追加しません。出典はアプリ内に表示されます。
- アップロード前に両サイトのファイル数・サイズ、実画像の配置、フォント、サイトマップ、共有URLを検証します。画像、本体の順で公開し、本番の両URLで内容とPages Functionの応答を確認します。画像生成APIのキーは不要です。
- [Actionsの実行履歴](https://github.com/umecchi1098/posewear/actions)で `Publish dev to Cloudflare Pages` を開き、サマリーの「公開確認済み」と公開URLを確認します。「Cloudflare 準備待ち」の場合は未公開です。失敗した場合は対象ステップのログで原因を確認し、最新のdevの実行を再実行できます。
