# 🌐 Site Cloner (Visual Fidelity)

A high-fidelity website cloner that creates a perfect static local version of any website. It doesn't just download files; it uses a headless browser to capture the fully rendered state, downloads all assets (including those Grouped by external domains), and performs an automated visual fidelity audit.

## ✨ Features

- **🚀 Headless Rendering**: Uses Playwright to capture the DOM _after_ JavaScript execution.
- **📦 Smart Asset Discovery**: Automatically finds and downloads images, fonts, scripts, and stylesheets, even those lazy-loaded or hidden in CSS `url()` calls.
- **📂 Deep Crawling**: Specify a `--depth` to clone entire sub-sections of a site.
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

# Custom output directory
clone-site https://example.com --out=my-clones
```

## 🛠 Command Line Options

| Flag                           | Description                                   | Default    |
| ------------------------------ | --------------------------------------------- | ---------- |
| `--depth=N`                    | How many levels of links to follow            | `0`        |
| `--include-videos=true\|false` | Download heavy media files (.mp4, .webm, etc) | `false`    |
| `--out=dir`                    | Root directory for clones                     | `./output` |
| `-f, --force`                  | Overwrite existing assets                     | `false`    |
| `--setup-completion`           | Install shell autocomplete scripts            | -          |

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
