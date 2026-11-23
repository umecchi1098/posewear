# Cloudflare Pages のプレビューと本番公開

このフォークはアプリと画像を別々の Direct Upload プロジェクトで公開します。両方の本番ブランチは `main` です。アプリの `dev` プレビューには同じプロジェクト内のブランチURLを使います。

| 操作 | 公開先 | 素材 |
| --- | --- | --- |
| `dev` に push | `dev.<アプリ>.pages.dev` | 公開済みの画像を参照 |
| `main` 向けの同一リポジトリ内PRを作成・更新 | PR用アプリプレビュー | 素材を更新するPRでは素材もプレビューで確認 |
| `main` にマージ | `<アプリ>.pages.dev` | 素材更新を含む場合は画像を先に公開 |

## 既存環境の切り替え

移行版ワークフローの最初の `dev` または `main` への push で、以前の本番ブランチ `dev` を Cloudflare API で `main` に切り替えます。アプリ・画像とも、設定の読み戻しに成功してから公開に進みます。両方のプロジェクト名と本番URLは引き続き同じです。

初回の `main` 向けPRでは、拡大画像を含む全画像を画像プロジェクトにまとめ、素材カタログの生成に使うメタデータも保存します。PRではアプリと素材の両方を `pr-番号` のURLで検証し、マージすると本番の2プロジェクトに反映します。この初回移行が完了するまでは、`dev` は移行前に公開済みの素材と画像を使います。

## 素材を更新する場合

`pages-assets-version.txt` の版番号を更新して `main` 向けのPRを作成します。初期値は `v1` です。PRのプレビューで画像・カタログ・アプリを確認してからマージします。通常のアプリ変更では版番号を維持します。素材提供元の一覧が変わっても、普段の `dev` プレビューでは公開済みのカタログを使います。

## 新しい環境を用意する場合

対象のCloudflareアカウントにDirect Uploadプロジェクトを2つ作り、対象アカウントの **Account → Cloudflare Pages → Edit** を許可したAPIトークンを用意します。

```bash
# アプリと画像の両プロジェクトで本番ブランチを揃える。
npx wrangler login
npx wrangler pages project create posewear-umecchi1098 --production-branch main
npx wrangler pages project create posewear-umecchi1098-assets --production-branch main
```

このフォークにログイン済みのGitHub CLIで、最新の `dev` から `python3 scripts/setup-pages.py` を実行します。プロジェクト名・本番ブランチ・公開URLの照合後に Actions の Secrets と Variables を登録します。トークンは非表示入力です。非対話実行では `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`PAGES_APP_PROJECT`、`PAGES_ASSET_PROJECT` を環境変数で指定します。

セットアップは最新の `dev` の push ワークフローを再実行します。再実行できる履歴がない場合は、ローカルの `dev` がリモートの最新と一致する場合に限り、空のコミットをpushします。

## 公開後の確認

[GitHub Actionsの実行履歴](https://github.com/umecchi1098/posewear/actions)で対象コミットの実行を開きます。サマリーに表示された公開URLでアプリを開き、素材のサムネイル、拡大画像、原寸画像のダウンロードを確認できます。素材を更新するときは、提供元の公開・再配信条件を確認してください。

CloudflareのブランチURLと本番ブランチ変更については [Direct Upload の公式ドキュメント](https://developers.cloudflare.com/pages/get-started/direct-upload/) を参照してください。
