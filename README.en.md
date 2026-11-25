<div align="center">

<img src="docs/banner.jpg" alt="Portrait + pose + outfit = result" width="900">

<sub>The result is an AI-generated example using a portrait, pose and outfit from the galleries as references. Source images belong to their authors; see Acknowledgements.</sub>

<img src="docs/logo.svg" width="72" alt="PoseWear">

# PoseWear 衣姿

Pose, outfit and portrait reference galleries with prompts in English, Japanese and Chinese, plus a bring-your-own-key AI try-on studio that runs in your browser.

[![License: MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-f38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![Live demo](https://img.shields.io/badge/demo-posewear.pages.dev-ff2442)](https://posewear.pages.dev)
[![GitHub stars](https://img.shields.io/github/stars/atuizz/posewear?style=flat&color=black)](https://github.com/atuizz/posewear/stargazers)

[Live demo](https://posewear.pages.dev) · [Features](#features) · [Quick start](#quick-start) · [Deploy](#deploy) · [FAQ](#faq) · [中文](README.md) · [日本語](README.ja.md)

<img src="docs/home.jpg" alt="Home" width="900">

</div>

## Features

- **Twelve galleries**: poses (multi-angle line sketches), depth poses, outfits (by season and type), anime outfits (anime-style looks, including the CharaDB merge), portraits (face references, CC0), plus seven extension libraries: expressions, hairstyles, historical outfits, scenes, lighting, props and furniture. Every image has a Chinese description and an English prompt you can copy.
- **Search and filters**: search by Chinese, English or Japanese titles, filter by category, sort, or pick a random image. Each item has its own static page for sharing.
- **Try-on studio**: upload a photo, pick an outfit and a pose, then generate. You can also generate without a photo. It supports several outputs per run, a before/after slider, and single or zip download.
- **Copy for chat**: copy each numbered reference image and the final prompt from one screen. You can also download each image. Copying and downloading work without an API key.
- **Generation history**: a dedicated page backed by IndexedDB (up to 200 entries): select-all batch zip download, export with prompt and parameter metadata, regenerate a single result, and a before/after comparison against the source photo. If a run would take the history above 40 images, you can save the ZIP, continue, or cancel before generation starts. You can also view, delete or clear saved items and undo deletions.
- **Clear errors**: an invalid key, a rate limit, a timeout or a safety block each get their own message and a suggested next step.
- **Reduce false safety blocks**: on by default. The studio rewrites its prompt into a neutral e-commerce try-on description without changing the outfit or pose. Turn it off to send the prompt as is.
- Favorites, recent items and prompt combos, all stored locally; an 18+ toggle with age confirmation; PWA and offline support; dark mode; a Simplified Chinese, English and Japanese interface. Choose the display language in the header. Prompts default to English. In the studio, open the Japanese preview to check the wording while keeping English selected for generation.

### Providers

| Provider | You need | Default model | Notes |
|---|---|---|---|
| OpenAI | API key (gpt-image requires a verified org) | gpt-image-1 | images/edits with multiple references; strictest moderation |
| Gemini | Google AI Studio key | gemini-2.5-flash-image | a.k.a. Nano Banana |
| Doubao Seedream | Volcengine Ark key | doubao-seedream-4-0-250828 | routed through the site proxy by default for CORS |
| Custom relay | Base URL, key and model | any | OpenAI-compatible (edits / generations) or the Gemini protocol (`models/:generateContent`); the proxy toggle applies to relays too — unticked means direct connections, and relay endpoints may use any port |

## Changelog

### 2026-11-23 · v1.2.1

- The combo tray is now a persistent floating "Image Workbench": a bottom-right button (with a selected-count badge) opens it from anywhere; you can add materials (outfits, anime outfits, poses, portraits, expressions) right inside the panel via the picker, with a clear empty state to get started.
- Added [`AGENTS.md`](https://github.com/atuizz/posewear/blob/0c97ab4b7e68e6212a5839d8320957f90627e629/AGENTS.md) (developer handover manual) and `scripts/sync-r2.py` (R2 image sync) so the repo can be handed over wholesale.

### 2026-11-23 · v1.2.0

- The combo tray now generates images directly: pick outfits, poses, portraits and expressions in the galleries, then generate right inside the tray (editable prompt, count and aspect ratio). Results open full-size, download, and are saved to the generation history automatically — no trip to the studio required.
- Studio polish: removed the empty spacer in the right column; results scroll into view when ready.
- Site-wide copy and data corrections: anime outfits 1320 → 1760 (hero stats, meta, announcement, footer), CharaDB credited in the footer, privacy note corrected for depth-pose delivery; tray height capped with internal scrolling, announcement clamped to two lines on mobile.
- New `tests/v18-quick.js` covers the full tray generation flow.

### 2026-11-23 · v1.1.0

- Fixed every hairstyle image (and the CharaDB part of anime outfits) failing to load: the site's CSP `img-src` allowlist was missing the hotlinked origin, so browsers blocked them all. The build now collects hotlink origins from the data automatically, and `tests/check_csp.py` guards the allowlist after each build.
- READMEs (Chinese / English / Japanese) brought up to date with the current feature set.

### 2026-11-22 · History page, proxy fix, Gemini protocol for relays

- New **Generation history** page (contributed by @OrangeSAM): select-all batch download, ZIP export with prompt/parameter metadata, single-item regeneration, before/after comparison; capped at 200 entries.
- Fixed the proxy toggle being ignored for custom relays: unticked now means direct connections; the proxy allows any port for custom relays (official domains stay HTTPS-only, private addresses stay blocked).
- Custom relays gain the Gemini protocol (`models/:generateContent`, auth header switches automatically).
- Wide-screen header overlap fix (contributed by @yansiao1227).

### 2026-11-21 · Seven extension libraries, images move to R2

- Seven new tabs: expressions (95), hairstyles (122, from CharaDB, images hotlinked), historical outfits (57), scenes (64), lighting (50), props (32), furniture (41). Anime outfits absorb 440 CharaDB sets, growing to **1,760**.
- All images are now served from Cloudflare R2 (`pwimg.0vo.pro`); depth-pose images are self-hosted instead of hotlinked, which loads more reliably.
- Fixed Seedream 5.x generation failures (contributed by @COBEZE): 5.x-only parameters are now sent to 4.x models only.

### 2026-11-19 · Anime outfits library

- New **Anime outfits** tab: 1,320 anime-style outfits from COSTUME-ANIME-DB by [@giaaibusi](https://x.com/giaaibusi), in the same 8 categories as the outfit library (spring 197 / summer 237 / autumn 230 / winter 232 / lingerie 197 / party 36 / swimwear 52 / sexy 139), each with English, Japanese and Chinese prompts.
- Lingerie and sexy categories (336 items) are treated as adult content: hidden by default behind the 18+ toggle (984 public items).
- Anime outfits support the full outfit feature set: category / colour / item filters, search suggestions, favourites, recent views, prompt combos, bilingual detail pages and sitemap; the try-on studio can pick anime outfits directly from the garment step.
- Homepage announcement bar and anime counts added; `scripts/fetch-assets.py` gains an `anime` source (and now also fetches the outfit thumbnails it used to miss).

### 2026-10-31 · Depth poses

- New **Depth poses** tab: 288 sets / 1,439 hotlinked depth-pose images; two-person images sit behind the 18+ toggle.

## Screenshots

| Studio | Dark mode | Mobile |
|:---:|:---:|:---:|
| <img src="docs/studio.jpg" width="420" alt="Studio"> | <img src="docs/dark.jpg" width="420" alt="Dark mode"> | <img src="docs/mobile.jpg" width="180" alt="Mobile"> |

## Quick start

You need Python 3.9+ with Pillow. Tests and deploys also need Node.js 18+.

```bash
git clone https://github.com/atuizz/posewear.git && cd posewear
pip install pillow
python3 scripts/fetch-assets.py   # downloads data and images from the original galleries (several GB)
python3 build.py                  # outputs dist/
python3 -m http.server 8787 -d dist
```

Set `POSEWEAR_RAW` to use a different asset folder, and `POSEWEAR_SITE` to set your own site URL for the sitemap and share links. Set `POSEWEAR_ASSET_HOST` to emit thumbnails and full images into a separate `dist-assets/` folder (deploy it on its own or upload it to R2) while the main site ships pages and data only.

To add the seven extension catalogs to an existing asset folder, run `python3 scripts/fetch-assets.py --modules-only`.

## Deploy

This fork uses GitHub Actions for `dev` previews and `main` production deployments. See the [Cloudflare Pages setup guide (Japanese)](docs/pages-dev.md).

The repository ships without assets, so build locally first, then upload `dist/` to Cloudflare Pages:

```bash
npm install && npx wrangler login
POSEWEAR_SITE=https://<project>.pages.dev python3 build.py
npx wrangler pages deploy dist --project-name <project>
```

`functions/api/proxy.js` is deployed as a Pages Function that only forwards API requests. Adding a rate-limit rule for `/api/proxy` is recommended.

## Tests

The Playwright tests mock every provider endpoint, so no real key is needed. They cover success, a bad key, rate limits, 5xx errors, timeouts, cancel, safety blocks and multiple outputs.

```bash
npm install && npx playwright install chromium
python3 -m http.server 8787 -d dist &
node tests/v12.js && node tests/v13.js
node tests/v16-proxy.mjs && node tests/v17-history.js   # proxy rules / history page
python3 tests/check_csp.py dist   # every image origin must be in the CSP allowlist
```

## FAQ

**Is my API key safe?** It stays in your browser's localStorage. Requests go straight to the provider. They only go through `/api/proxy` if you turn on proxy forwarding or use a custom relay; the proxy forwards requests as they are and never stores keys or images.

**Why was my image blocked?** Providers moderate both the input photos and the output. Real photos with revealing outfits are the most likely to be blocked, and OpenAI is the strictest. The rewrite option reduces false positives on normal outfits. It does not bypass moderation of prohibited content.

**Can I use the images?** No images are included in this repo. All assets belong to their original authors, so check each source site's terms. The portrait gallery is CC0.

## Contributing

Issues and PRs are welcome. Run `python3 build.py` and both test files before you open a PR, and add screenshots for UI changes. Please don't commit any assets or keys.

## Acknowledgements

[AI Pose Gallery](https://ai-pose-gallery.pages.dev/) · [AI Costume Gallery](https://ai-costume-gallery.pages.dev/) · [AI Costume Anime Gallery](https://ai-costume-anime-gallery.pages.dev/) by [@giaaibusi](https://x.com/giaaibusi) · [AI Pose Depth Gallery](https://ai-pose-depth-gallery.pages.dev/) by [ギア / @giaaibusi](https://x.com/giaaibusi) (unofficial Chinese index; images are self-hosted by this site, © the author) · CharaDB by たき AI (hairstyles and part of the anime outfits; tag data CC0, images hotlinked from the source site, not stored here) · [AI Portrait Gallery](https://ai-portrait-gallery.pages.dev/) by [@agi_aibusi](https://x.com/agi_aibusi) (CC0) · [wzc520pyfm/gen-ai-pose-image](https://github.com/wzc520pyfm/gen-ai-pose-image) · [paipiange/nvzhuang](https://github.com/paipiange/nvzhuang)

## License and asset boundaries

| What | In this repo? | License |
|---|---|---|
| Code, UI copy, build scripts | Yes | [MIT](LICENSE) |
| Pose and outfit images and data | No — downloaded by `fetch-assets.py` | Owned by [@giaaibusi](https://x.com/giaaibusi) ([AI Pose Gallery](https://ai-pose-gallery.pages.dev/) / [AI Costume Gallery](https://ai-costume-gallery.pages.dev/) / [AI Costume Anime Gallery](https://ai-costume-anime-gallery.pages.dev/)); no open license is stated |
| Portrait images | No — same as above | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) by [@agi_aibusi](https://x.com/agi_aibusi) ([AI Portrait Gallery](https://ai-portrait-gallery.pages.dev/)) |
| Depth-pose images | No — self-hosted on this site's CDN (sourced from [AI Pose Depth Gallery](https://ai-pose-depth-gallery.pages.dev/)) | Owned by [ギア / @giaaibusi](https://x.com/giaaibusi). This repo only has the text metadata and Chinese names |
| Hairstyle and CharaDB anime-outfit images | No — hotlinked with `<img>` from CharaDB | Tag data CC0; images © CharaDB author たき AI, not stored or redistributed here |
| Depth-pose text metadata | Yes, `depth/packs/` | Japanese text belongs to the original author; Chinese names are ours |
| README screenshots | Yes | The pictures shown belong to their authors as above |

- MIT covers the code only, not any image or data.
- To repost, use commercially or redistribute pose/outfit images, ask the author @giaaibusi first and follow the source site's terms.
- Portraits are CC0: free to use, modify and sell without credit. They are AI-generated fictional people — don't use them to impersonate real people. The author asks that they not be bulk-reposted as-is.
- If you deploy your own copy, keep the source and author credits on the pages.
