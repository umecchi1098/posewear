"""Windows の Chrome から試着スタジオを開くための LAN 内テストサーバー。"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PreviewServer(ThreadingHTTPServer):
    # ギャラリーは多数の画像を同時に取得するため、接続待ちの枠を広げます。
    request_queue_size = 128


class PreviewHandler(SimpleHTTPRequestHandler):
    # 複数の画像を同じ接続で取得できるようにします。
    protocol_version = "HTTP/1.1"


if __name__ == "__main__":
    # Mac のソースコードや設定ではなく、ビルド済みの公開ファイルだけを配信します。
    dist = Path(__file__).resolve().parents[1] / "dist"
    if not (dist / "workflows" / "try-on-qwen-2509-api.json").is_file():
        raise SystemExit("先に実験用ブランチで build.py を実行してください。")
    with PreviewServer(("0.0.0.0", 8787), partial(PreviewHandler, directory=dist)) as server:
        print("Windows の Chrome で http://<Mac の LAN 内 IP>:8787/#studio を開いてください。", flush=True)
        server.serve_forever()
