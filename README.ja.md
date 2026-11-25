<div align="center">

<img src="docs/banner.jpg" alt="人物 + ポーズ + 服装 = 成果物" width="900">

<sub>成果物は、ギャラリーの人物・ポーズ・服装を参考に AI が生成した例です。素材画像の著作権は各作者に帰属します。謝辞を参照してください。</sub>

<img src="docs/logo.svg" width="72" alt="PoseWear">

# PoseWear 衣姿

プロンプト付きのポーズ・服装・人物の参考ギャラリーと、ブラウザ上で動作する BYOK（自分の API キーを使う）AI 試着スタジオ。

[![License: MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-f38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![Live demo](https://img.shields.io/badge/demo-posewear.pages.dev-ff2442)](https://posewear.pages.dev)
[![GitHub stars](https://img.shields.io/github/stars/atuizz/posewear?style=flat&color=black)](https://github.com/atuizz/posewear/stargazers)

[ライブデモ](https://posewear.pages.dev) · [機能](#機能) · [クイックスタート](#クイックスタート) · [デプロイ](#デプロイ) · [FAQ](#faq) · [中文](README.md) · [English](README.en.md)

<img src="docs/home.jpg" alt="ホーム" width="900">

</div>

## 機能

- **12 のギャラリー**：ポーズ（多角度の線画）、深度ポーズ、服装（季節と種類で分類）、アニメ服（アニメ風の着こなし、CharaDB 統合分を含む）、人物（顔のリファレンス、CC0）に加え、表情・ヘアスタイル・歴史服装・シーン・ライティング・小道具・家具の 7 つの拡張ライブラリ。すべての画像に中国語の説明と、コピーできる英語のプロンプトが付いています。
- **検索とフィルター**：中国語・英語・日本語の素材名で検索、カテゴリーで絞り込み、並べ替え、ランダムな画像の選択ができます。各アイテムには共有用の静的ページがあります。
- **試着スタジオ**：写真をアップロードし、服装とポーズを選んで生成します。写真なしで生成することもできます。1 回の実行で複数の出力、ビフォーアフターのスライダー、単体または zip でのダウンロードに対応しています。
- **チャット用コピー**では、参照画像と最終プロンプトを個別にコピーできます。
- **生成履歴**：IndexedDB に保存される専用ページ（上限 200 件）。全選択して一括 zip ダウンロード、プロンプトとパラメータのメタデータ付きエクスポート、1 件ごとの再生成、元写真とのビフォーアフター比較ができます。生成後の履歴が40件を超える場合は、送信前にZIPを保存できます。
- **わかりやすいエラー**：無効なキー、レート制限、タイムアウト、セーフティブロックのそれぞれに専用のメッセージと、次に取るべき手順の提案が表示されます。
- **誤ったセーフティブロックの低減**：既定でオン。スタジオは、服装やポーズを変えずに、プロンプトを中立的な EC 試着の説明に書き換えます。オフにすると、プロンプトをそのまま送信します。
- お気に入り、最近のアイテム、プロンプトの組み合わせはすべてローカルに保存。年齢確認付きの 18+ トグル、PWA とオフライン対応、ダークモード、日本語・英語・簡体字中国語の UI。

### プロバイダー

| プロバイダー | 必要なもの | 既定のモデル | 備考 |
|---|---|---|---|
| OpenAI | API キー（gpt-image には認証済みの組織が必要） | gpt-image-1 | 複数のリファレンスを使う images/edits。モデレーションが最も厳格 |
| Gemini | Google AI Studio のキー | gemini-2.5-flash-image | 別名 Nano Banana |
| Doubao Seedream | Volcengine Ark のキー | doubao-seedream-5-5-261028 | CORS のため既定でサイトのプロキシ経由 |
| Custom relay | ベース URL、キー、モデル | 任意 | OpenAI 互換（edits / generations）または Gemini プロトコル（`models/:generateContent`）。プロキシのトグルはリレーにも適用され、オフの場合は直接接続、リレーのエンドポイントは任意のポートを使用可能 |

## 変更履歴

### 2026-11-23 · v1.2.1

- コンボトレイが常駐の「画像生成ワークベンチ」に：右下のフローティングボタン（選択数のバッジ付き）からいつでも開け、パネル内で素材（衣装・アニメ衣装・ポーズ・ポートレート・表情）を直接追加できます。空のときは空状態の案内が表示されます。
- 開発引き継ぎマニュアル [`AGENTS.md`](https://github.com/atuizz/posewear/blob/0c97ab4b7e68e6212a5839d8320957f90627e629/AGENTS.md) と R2 画像同期スクリプト `scripts/sync-r2.py` を追加し、リポジトリ全体を引き継げるようにしました。

### 2026-11-23 · v1.2.0

- コンボトレイで直接画像生成が可能に：ギャラリーで服・ポーズ・ポートレート・表情を選ぶと、トレイの中でそのまま生成できます（プロンプト編集、枚数と比率の選択に対応）。結果は拡大表示とダウンロードができ、生成履歴にも自動保存されます。
- 試着台の調整：右カラムの空白スペーサーを除去し、生成結果が自動で表示位置までスクロールするようになりました。
- サイト全体の文案とデータを修正：アニメ服の点数を 1320 → 1760 に統一（統計・meta・お知らせ・フッター）、フッターに CharaDB のクレジットを追加、プライバシー説明の深度ポーズ配信方式を修正。トレイに高さ上限を追加し、モバイルのお知らせを 2 行に制限。
- トレイ生成フロー全体をカバーする `tests/v18-quick.js` を追加。

### 2026-11-23 · v1.1.0

- ヘアスタイルの全画像（およびアニメ服の CharaDB 分）が読み込めなかった問題を修正：サイトの CSP の `img-src` 許可リストにホットリンク先のオリジンが欠けており、ブラウザがすべてブロックしていました。ビルド時にデータからホットリンクのオリジンを自動収集して許可リストへ書き込むようになり、`tests/check_csp.py` がビルド後に検証します。
- README（中国語／英語／日本語）を現在の機能に合わせて更新。

### 2026-11-22 · 生成履歴ページ、プロキシ修正、リレーの Gemini プロトコル

- 新しい **生成履歴** ページ（@OrangeSAM によるコントリビュート）：全選択の一括ダウンロード、プロンプト／パラメータのメタデータ付き ZIP エクスポート、1 件ごとの再生成、元写真とのビフォーアフター比較。上限 200 件。
- カスタムリレーでプロキシのトグルが効かなかった問題を修正：オフの場合は直接接続に。プロキシはリレーの任意ポートを許可（公式ドメインは HTTPS のみ、プライベートアドレスは引き続きブロック）。
- カスタムリレーに Gemini プロトコル（`models/:generateContent`、認証ヘッダーは自動切替）を追加。
- ワイド画面でヘッダーが重なる問題を修正（@yansiao1227 によるコントリビュート）。

### 2026-11-21 · 7 つの拡張ライブラリ、画像を R2 へ移行

- 新しいタブ 7 つ：表情 95、ヘアスタイル 122（CharaDB、画像はホットリンク）、歴史服装 57、シーン 64、ライティング 50、小道具 32、家具 41。アニメ服に CharaDB の 440 点が加わり、合計 **1,760 点**に。
- 全画像の配信を Cloudflare R2（`pwimg.0vo.pro`）に移行。深度ポーズ画像はホットリンクをやめて自前ホスティングにし、読み込みが安定しました。
- Seedream 5.x で生成が失敗する問題を修正（@COBEZE によるコントリビュート）：5.x 向けパラメータは 4.x モデルにのみ送るようになりました。

### 2026-11-19 · アニメ服ライブラリ

- 新しい **アニメ服** タブ：[@giaaibusi](https://x.com/giaaibusi) による COSTUME-ANIME-DB から 1,320 点のアニメ風の服装を、服装ライブラリと同じ 8 カテゴリー（春 197 / 夏 237 / 秋 230 / 冬 232 / ランジェリー 197 / パーティー 36 / 水着 52 / セクシー 139）で収録。それぞれ中国語と英語のプロンプト付き。
- ランジェリーとセクシーのカテゴリー（336 点）はアダルトコンテンツとして扱われ、既定では 18+ トグルの背後に隠されています（公開アイテムは 984 点）。
- アニメ服は服装の全機能に対応：カテゴリー／色／アイテムのフィルター、検索候補、お気に入り、最近の閲覧、プロンプトの組み合わせ、バイリンガルの詳細ページとサイトマップ。試着スタジオでは、衣装のステップからアニメ服を直接選べます。
- ホームページのお知らせバーとアニメの点数を追加。`scripts/fetch-assets.py` に `anime` ソースを追加（これまで取得できていなかった服装のサムネイルも取得するようになりました）。

### 2026-10-31 · 深度ポーズ

- 新しい **深度ポーズ** タブ：288 セット / 1,439 点のホットリンクされた深度ポーズ画像。2 人の画像は 18+ トグルの背後にあります。

## スクリーンショット

| スタジオ | ダークモード | モバイル |
|:---:|:---:|:---:|
| <img src="docs/studio.jpg" width="420" alt="スタジオ"> | <img src="docs/dark.jpg" width="420" alt="ダークモード"> | <img src="docs/mobile.jpg" width="180" alt="モバイル"> |

## クイックスタート

Pillow を備えた Python 3.9+ が必要です。テストとデプロイには Node.js 18+ も必要です。

```bash
git clone https://github.com/atuizz/posewear.git && cd posewear
pip install pillow
python3 scripts/fetch-assets.py   # downloads data and images from the original galleries (several GB)
python3 build.py                  # outputs dist/
python3 -m http.server 8787 -d dist
```

既存の素材フォルダに追加7ライブラリのカタログだけを取得するには、`python3 scripts/fetch-assets.py --modules-only` を実行します。

別の素材フォルダを使うには `POSEWEAR_RAW` を、サイトマップや共有リンク用に独自のサイト URL を設定するには `POSEWEAR_SITE` を設定します。`POSEWEAR_ASSET_HOST` を設定すると、サムネイルと原画像は別の `dist-assets/` フォルダーに出力されます（単独でデプロイするか R2 にアップロード可能）。メインサイトにはページとデータだけが残ります。

## デプロイ

このリポジトリは素材を含まずに配布されるため、まずローカルでビルドし、`dist/` を Cloudflare Pages にアップロードします：

```bash
npm install && npx wrangler login
POSEWEAR_SITE=https://<project>.pages.dev python3 build.py
npx wrangler pages deploy dist --project-name <project>
```

`functions/api/proxy.js` は、API リクエストを転送するだけの Pages Function としてデプロイされます。`/api/proxy` にレート制限ルールを追加することを推奨します。

## テスト

Playwright のテストはすべてのプロバイダーのエンドポイントをモックするため、実際のキーは不要です。成功、不正なキー、レート制限、5xx エラー、タイムアウト、キャンセル、セーフティブロック、複数出力をカバーします。

```bash
npm install && npx playwright install chromium
python3 -m http.server 8787 -d dist &
node tests/v12.js && node tests/v13.js
node tests/v16-proxy.mjs && node tests/v17-history.js   # プロキシ規則 / 履歴ページ
python3 tests/check_csp.py dist   # すべての画像オリジンが CSP の許可リストにあるか検証
```

## FAQ

**API キーは安全ですか？** キーはブラウザの localStorage に保存されます。リクエストはプロバイダーへ直接送られます。プロキシ転送をオンにするか、カスタムリレーを使う場合にのみ `/api/proxy` を経由します。プロキシはリクエストをそのまま転送し、キーや画像を保存することはありません。

**なぜ画像がブロックされたのですか？** プロバイダーは入力写真と出力の両方をモデレーションします。露出の多い服装の実写は最もブロックされやすく、OpenAI が最も厳格です。書き換えオプションは通常の服装での誤検出を減らします。禁止コンテンツのモデレーションを回避するものではありません。

**画像を使えますか？** このリポジトリには画像は含まれていません。すべての素材は各作者に帰属するため、各ソースサイトの規約を確認してください。人物ギャラリーは CC0 です。

## コントリビュート

Issue と PR を歓迎します。PR を出す前に `python3 build.py` と両方のテストファイルを実行し、UI の変更にはスクリーンショットを添えてください。素材やキーはコミットしないでください。

## 謝辞

[AI Pose Gallery](https://ai-pose-gallery.pages.dev/) · [AI Costume Gallery](https://ai-costume-gallery.pages.dev/) · [AI Costume Anime Gallery](https://ai-costume-anime-gallery.pages.dev/) by [@giaaibusi](https://x.com/giaaibusi) · [AI Pose Depth Gallery](https://ai-pose-depth-gallery.pages.dev/) by [ギア / @giaaibusi](https://x.com/giaaibusi)（非公式の中国語インデックス。画像は本サイトで自前ホスティング、著作権は作者に帰属） · CharaDB by たき AI（ヘアスタイルとアニメ服の一部。タグデータは CC0、画像は元のサイトからホットリンクし、ここには保存しません） · [AI Portrait Gallery](https://ai-portrait-gallery.pages.dev/) by [@agi_aibusi](https://x.com/agi_aibusi)（CC0） · [wzc520pyfm/gen-ai-pose-image](https://github.com/wzc520pyfm/gen-ai-pose-image) · [paipiange/nvzhuang](https://github.com/paipiange/nvzhuang)

## ライセンスと素材の扱い

| 対象 | このリポジトリに含まれる？ | ライセンス |
|---|---|---|
| コード、UI コピー、ビルドスクリプト | はい | [MIT](LICENSE) |
| ポーズと服装の画像・データ | いいえ — `fetch-assets.py` でダウンロード | [@giaaibusi](https://x.com/giaaibusi)（[AI Pose Gallery](https://ai-pose-gallery.pages.dev/) / [AI Costume Gallery](https://ai-costume-gallery.pages.dev/) / [AI Costume Anime Gallery](https://ai-costume-anime-gallery.pages.dev/)）に帰属。オープンライセンスの明示はなし |
| 人物画像 | いいえ — 上と同じ | [@agi_aibusi](https://x.com/agi_aibusi)（[AI Portrait Gallery](https://ai-portrait-gallery.pages.dev/)）による [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| 深度ポーズ画像 | いいえ — 本サイトの CDN で自前ホスティング（出典は [AI Pose Depth Gallery](https://ai-pose-depth-gallery.pages.dev/)） | [ギア / @giaaibusi](https://x.com/giaaibusi) に帰属。このリポジトリにはテキストのメタデータと中国語名のみ |
| ヘアスタイルと CharaDB のアニメ服画像 | いいえ — CharaDB から `<img>` でホットリンク | タグデータは CC0。画像の著作権は CharaDB の作者 たき AI に帰属し、ここでは保存も再配布もしない |
| 深度ポーズのテキストメタデータ | はい、`depth/packs/` | 日本語テキストは原作者に帰属。中国語名は本プロジェクトのもの |
| README のスクリーンショット | はい | 表示されている画像は上記のとおり各作者に帰属 |

- MIT が対象とするのはコードのみで、画像やデータは対象外です。
- ポーズ／服装の画像を転載、商用利用、再配布する場合は、まず作者 @giaaibusi に確認し、ソースサイトの規約に従ってください。
- 人物画像は CC0 です：クレジット表示なしで自由に使用、改変、販売できます。これらは AI が生成した架空の人物です。実在の人物になりすますために使わないでください。作者は、これらをそのまま大量に転載しないよう求めています。
- 自分でコピーをデプロイする場合は、ページ上のソースと作者のクレジットを残してください。
