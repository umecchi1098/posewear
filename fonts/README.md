# Noto Sans JP

`noto-sans-jp.woff2` は [Google Fonts の Noto Sans JP](https://github.com/google/fonts/tree/66a36c8c94b1a5d992ee4e7f392fccfe4945767c/ofl/notosansjp) を PoseWear 向けにサブセット化した可変フォント。ウェイトは 100〜900 に対応し、通常のサイトビルドにはフォント変換ツールを必要としない。配布条件は同梱の [SIL Open Font License 1.1](OFL.txt) に従う。

原本 `NotoSansJP[wght].ttf` の SHA-256 は `c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f`。FontTools 4.58.5 と Brotli 1.2.1 で `pyftsubset --layout-features='*' --flavor=woff2` を使用した。

JIS X 0208 を含む Python の `iso2022_jp` で符号化できる文字に、次の範囲を加えている。フォントに収録されている対象文字は7,326字。範囲外の文字には端末の日本語フォントを使用する。

- `U+0020–00FF`、`U+2000–206F`、`U+2190–21FF`、`U+2600–26FF`
- `U+3000–30FF`、`U+9ED1`、`U+FF00–FFEF`
