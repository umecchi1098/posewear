# Windows の ComfyUI で PoseWear の試着を試す

Mac と Windows を同じ LAN に接続します。Mac は PoseWear の画面と素材を配信し、Windows の Chrome が同じ PC の ComfyUI に画像を送ります。生成結果は ComfyUI の出力フォルダーと、PoseWear を開いた Chrome の履歴から確認できます。

## 1. Mac で PoseWear を配信する

今回の実験サーバーが起動中なら、Windows 側の手順から始めてください。再起動する場合は、実験ブランチのリポジトリで、素材と Pillow が揃った Python を使います。この開発 Mac では次のコマンドを実行できます。

```sh
git branch --show-current
raw/build-venv/bin/python build.py
python3 scripts/serve-comfy-experiment.py
```

ブランチ名は `codex/comfyui-local-experiment` です。サーバーを起動したターミナルはそのままにします。別のターミナルで `ipconfig getifaddr en0` を実行すると、この Mac の Wi-Fi 側の IP を確認できます。以下は Mac の IP が `192.168.1.105` の例です。IP やポートが変わったら、Windows のブックマークと次の CORS 設定の両方を更新してください。

## 2. Windows の ComfyUI に PoseWear のアクセスを許可する

1. Windows の Chrome で、普段使っているローカルの ComfyUI を開き、接続先とポートを控えます。以下は `http://127.0.0.1:8188` の例です。Desktop などで別のポートを使っている場合は、そのポートを PoseWear に入力します。
2. ComfyUI の起動引数に `--enable-cors-header http://192.168.1.105:8787` を追加して再起動します。許可元は **Mac の PoseWear のアドレス**です。末尾のスラッシュや `/#studio` は付けません。ComfyUI は Windows のループバックアドレスで待ち受ければ十分です。
   - **Stability Matrix 版**は「Packages」で対象の ComfyUI の「⋯ → Launch Options」を開き、「Extra Launch Arguments」に引数を追加して「Save → Restart」を実行します。
   - **Portable 版**は普段の起動用 `.bat` を実験用にコピーし、`main.py` を起動している行の末尾に引数を足します。GPU やメモリに関する既存の引数はそのまま使えます。
   - **Desktop 版**は対象インスタンスの「Manage」→「Startup Args」→「Startup Arguments」に同じ引数を追加し、「Restart to apply」で再起動します。[Comfy Desktop の起動引数設定](https://docs.comfy.org/installation/desktop/usage/manage)ソースから起動している場合は、普段の `python main.py` のコマンドに同じ引数を追加します。
3. Windows の PowerShell から次のように確認できます。ポートと Origin は自分の環境に合わせます。

```powershell
curl.exe -i -H "Origin: http://192.168.1.105:8787" "http://127.0.0.1:8188/system_stats"
```

`HTTP/1.1 200`、`Access-Control-Allow-Origin: http://192.168.1.105:8787`、本文に `system` と `devices` があれば、サーバー側の準備は完了です。起動方法と引数は [ComfyUI Portable 公式ガイド](https://docs.comfy.org/installation/comfyui_portable_windows) と [ComfyUI の引数一覧](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/cli_args.py) を参照してください。

## 3. Qwen Image 2.1 でポーズごとに生成する

Windows で人物・衣装の生成を確認した Qwen Image 2.1＋Prompt Enhancer を使います。以前の2入力設定から切り替えるときは、同じ Chrome・同じ URL で PoseWear を再読み込みしてください。

1. 「試着 → API設定 → ComfyUI」の「ポーズ参照付きワークフローのサンプルをダウンロード」を押し、保存した `posewear-qwen21-pose-api.json` を「ワークフローの API JSON」に指定します。モデル名が以前の実験用 JSON と同じなので、その Windows 環境では既存モデルを利用できます。
2. 読み込み時に選ばれた下表のノードを確認して「保存」を押します。接続先は Windows 側で動作確認した ComfyUI のアドレスです。
3. 人物写真1枚、服装画像1枚を選びます。ポーズ欄で線画を2種類選び、必要に応じて各ポーズの角度を変更します。最初は生成枚数を「1」にして「生成」を押してください。
4. 人物と衣装を最初に各1回アップロードし、線画だけを切り替えて2ジョブを順番に実行します。2枚の結果を見比べ、人物と服が保たれ、それぞれの姿勢・撮影角度が線画に対応するかを確認します。再読み込み後は履歴から両方の結果を開けます。

| 設定項目 | サンプルのノード ID |
|---|---|
| 人物画像 | `470` |
| 服装画像 | `475` |
| ポーズ画像 | `490` |
| 結果を保存 | `461` |
| プロンプト | `488`（Prompt Enhancer に渡す編集指示） |
| アスペクト比 | `13` |
| シード | `459:458` |

ポーズは最大6件です。スタジオの生成枚数は**ポーズ1件あたり**の枚数です。たとえばポーズ2種類・各2枚なら、シードを変えて合計4ジョブを実行します。生成後は画像ごとの履歴と ZIP ダウンロードを利用できます。プロンプトは選んだ角度やスタイルを反映してジョブごとに組み立てます。手動編集した本文は各ジョブで共通です。ポーズをすべて外した場合、同梱の Qwen Image 2.1 ワークフローは人物と衣装の2入力で実行します。

## 4. 人物と服だけを使う既存ワークフロー

**すでに Windows で動いている試着ワークフローがあれば、そのまま使えます。** 人物と服に別々の標準 `LoadImage` ノードを使い、完成画像を標準 `SaveImage` に接続します。試着の指示文・出力サイズ・シードはワークフロー内で指定し、ComfyUI の「Export (API)」または「Save (API Format)」で JSON を保存します。通常の画面編集用 JSON と API 形式は異なります。追加の画像やマスクが必須のワークフローでは、その入力も事前に Windows 側で設定してください。

**同梱サンプルを使う場合**は、試着スタジオの「API設定」→「ComfyUI」→「試着ワークフローのサンプルをダウンロード」で JSON を取得します。サンプルは Qwen Image Edit 2509 と4ステップの Lightning LoRA を使います。次のモデルが Windows の ComfyUI に必要です。合計ダウンロード量の目安は約29 GBです。接続テストだけならモデルの準備は不要です。

| ComfyUI の models 内のフォルダー | ファイル名 |
|---|---|
| diffusion_models | qwen_image_edit_2509_fp8_e4m3fn.safetensors |
| text_encoders | qwen_2.5_vl_7b_fp8_scaled.safetensors |
| vae | qwen_image_vae.safetensors |
| loras | Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors |

サンプルは人物の縦横比に合わせて約75万画素に調整します。モデル配布先は [画像編集モデル](https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files/diffusion_models)、[テキストエンコーダーと VAE](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files)、[Lightning LoRA](https://huggingface.co/lightx2v/Qwen-Image-Lightning/tree/main/Qwen-Image-Edit-2509) です。モデル構成は [ComfyUI 公式テンプレート](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_edit_2509.json) を参照しています。

### 2入力のサンプルで1枚生成する

1. Chrome で `http://192.168.1.105:8787/#studio` を開き、「API設定」で **ComfyUI** を選びます。
2. 「ComfyUI の接続先」に Windows 自身の ComfyUI のアドレスを入力し、「接続テスト」を押します。Chrome にローカルネットワークへのアクセスを求められたら、この実験サイトに許可します。「ComfyUI に接続できました」と表示されることを確認します。
3. 「ワークフローの API JSON」にファイルを指定します。同梱サンプルの場合、人物画像ノードは **1 · Person**、服装画像ノードは **2 · Garment**、結果を保存するノードは **14 · Try-on result** を選んで保存します。
4. 人物写真1枚と服装画像1枚を選び、「生成」を押します。ComfyUI のキューと PoseWear の結果画面を確認します。サンプルの出力は Windows の ComfyUI の出力フォルダーで `PoseWear_TryOn` から始まる名前で保存されます。
5. **受け入れ確認**として、人物が選んだ服を着た画像が表示されること、元画像と比較できること、同じ URL を再読み込みして履歴をクリックすると同じ結果が開くことを確認します。接続テストの成功だけでは、この確認は完了しません。

## うまくいかない場合

| 症状 | 確認する場所 |
|---|---|
| Windows で PoseWear が開かない | Mac のサーバー、両端末の LAN、Mac のファイアウォールによる受信許可を確認します。Windows の PowerShell で `Test-NetConnection 192.168.1.105 -Port 8787` を実行し、`TcpTestSucceeded` を確認します。 |
| PowerShell は成功するが、画面の接続テストが失敗する | Chrome のアドレスバーにある Mac のオリジンと、ComfyUI の CORS 設定を照合します。開発者ツールのコンソールで CORS・ローカルネットワーク権限のエラーを確認します。ブラウザーの管理ポリシーが安全な配信元を要求する環境では、Mac 側を Windows が信頼する HTTPS で配信し、その HTTPS オリジンを CORS に指定します。 |
| 接続は成功するが、生成できない | ComfyUI のコンソールまたは履歴で失敗したノードを確認します。モデル名・ノードの有無・GPU メモリを確認し、必要なら Windows で動作確認済みの2画像入力ワークフローに切り替えます。 |
| 待機を停止した、または15分でタイムアウトした | Windows の ComfyUI でキューと出力を確認します。PoseWear の待機を止めても、すでに受理されたジョブは Windows 側で続く場合があります。 |
| 以前の履歴が出ない | 履歴はブラウザーの IndexedDB に保存されます。同じ Chrome プロファイル、同じ Mac のホスト名または IP、同じポートから開きます。 |

試験結果を共有するときは、ComfyUI と Chrome のバージョン、使ったワークフロー名、接続・生成・再読み込み後の履歴の各結果があると、どの段階まで動いたか確認できます。
