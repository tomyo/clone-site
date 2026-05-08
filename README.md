# Site Clone

A standalone tool to create a "Perfect Visual Clone" of any website. It downloads all assets (CSS, JS, Fonts, Images) and rewrites HTML to work locally with zero dependencies on the original server.

## Installation

```bash
cd site-clone
npm install
```

## Usage

```bash
node src/index.js <url> [--recursive] [--include-videos=true] [-f|--force] [--out=output_dir]
```

### Options

- `--recursive`: Crawls up to 10 internal pages (default: 1 page).
- `--include-videos=true`: Downloads video/media files (can be heavy).
- `-f`, `--force`: Force redownload of assets even if they already exist locally.
- `--out=dir`: Base directory for output (default: `output`).

## Roadmap

See [PLAN.md](PLAN.md) for the long-term development plan and [SESSION.md](SESSION.md) for current progress and next steps.

## How it works

1. **Crawl**: Uses Playwright to render the page and capture all network requests.
2. **Download**: Fetches all assets and organizes them into a local directory structure. External assets are grouped under `_external/`.
3. **Rewrite**: Updates HTML and CSS to use relative local paths.
4. **Verify**: Automatically starts a local server and takes screenshots to compare the clone with the original.
