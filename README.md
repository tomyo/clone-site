# 🌐 Site Cloner

A tool to create a local clone of any website.

## ✨ Features

- **🚀 Headless Rendering**: Uses Playwright to capture the DOM _after_ JavaScript execution.
- **📦 Smart Asset Discovery**: Automatically finds and downloads images, fonts, scripts, and stylesheets, even those lazy-loaded or hidden in CSS `url()` calls.
- **📂 Deep Crawling**: Specify a `--depth` (e.g. `1`, `2`, or `full`) to clone entire sub-sections of a site.
- **🔍 Visual Fidelity Audit**: Automatically compares the original site against the local clone using pixel-diffing.
- **📊 Detailed Reporting**: Generates a `report.md` with similarity percentages and execution summaries.
- **🐚 Shell Autocomplete**: Full support for `tab` completion for all CLI flags.
- **⚡ Parallel Downloads**: Optimized asset fetching with concurrency limits.

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/youruser/clone-site.git
cd clone-site
npm install
npm link # Makes 'clone-site' command available globally
```

### Setup Autocomplete

```bash
clone-site --setup-completion
# Restart your terminal or source your shell config
```

### Basic Usage

```bash
# Clone a single page
clone-site https://example.com

# Clone with depth (1 level deep) and include videos
clone-site https://example.com --depth=1 --include-videos=true

# Clone an entire site
clone-site https://example.com --depth=full

# Clone raw HTML (pre-hydration) and strip all JavaScript from the output
clone-site https://example.com --raw --exclude-scripts=all

# Strip only external scripts
clone-site https://example.com --exclude-scripts=external

# Probe a site to get recommended flags
clone-site https://example.com --probe

# Custom output directory
clone-site https://example.com --out=my-clones
```

## 🛠 Command Line Options

| Flag                           | Description                                               | Default    |
| ------------------------------ | --------------------------------------------------------- | ---------- |
| `--depth=N\|full`              | How many levels of links to follow (`full` for unlimited) | `0`        |
| `--include-videos=true\|false` | Download heavy media files (.mp4, .webm, etc)             | `false`    |
| `--raw`                        | Save original pre-JS HTML source instead of rendered DOM  | `false`    |
| `--dehydrate-components`       | Revert custom elements to pre-JS Light DOM before saving  | `false`    |
| `--exclude-scripts=all\|external\|internal` | Strip matching `<script>` tags from output | `false`    |
| `--probe`                      | Analyze site and recommend best cloning flags             | `false`    |
| `--out=dir`                    | Root directory for clones                                 | `./output` |
| `-f, --force`                  | Overwrite existing assets                                 | `false`    |
| `--setup-completion`           | Install shell autocomplete scripts                        | -          |

## 🧪 Development & Testing

```bash
# Run the integration tests
make test
# or
npm test
```

## 📁 Output Structure

The tool organizes outputs by domain:

```text
output/example.com/
├── clone/             # The actual static website
│   ├── index.html
│   ├── about/index.html
│   ├── _external/     # Assets from other domains (e.g. Google Fonts)
│   └── wp-content/    # Local asset structure preserved
├── screenshots/       # Original vs Cloned vs Diff snapshots
└── report.md          # Visual fidelity and crawl summary
```
