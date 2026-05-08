# Site Clone - Development Plan

Standalone tool for creating high-fidelity, dependency-free local clones of websites.

## ✅ Milestone 1: Core Functionality (Current)

- [x] **Playwright Crawler**: Basic engine to render pages and intercept network requests.
- [x] **Asset Downloader**: Recursive downloading of CSS, Scripts, Fonts, and Images.
- [x] **Download Resume/Skip**: Skip already downloaded files unless forced.
- [x] **Retry Logic**: Automatic retries for failed asset downloads.
- [x] **CSS Rewriting**: Parsing CSS to find and download embedded assets (fonts/images).
- [x] **HTML Rewriting**: Path mapping for internal and `_external/` assets.
- [x] **Recursive Crawling**: Basic depth-limited crawling of internal routes.
- [x] **Visual Verification**: Automated "Original vs. Clone" screenshot comparison via local server.

## 🛠 Milestone 2: Reliability & Speed (Current)

- [x] **Parallel Downloads**: Implement a worker pool to download assets faster (currently sequential).
- [x] **Robust Lazy-Loading**: Better extraction of `srcset`, `data-src`, and other JS-driven asset attributes.
- [x] **Progress Indicators**: Add a CLI progress bar for asset downloads.
- [x] **Absolute Path Normalization**: Better handling of complex relative paths and `base` tags.
- [x] **Download Resume**: Cache downloaded assets to avoid re-fetching on interrupted runs.

## 🚀 Milestone 3: Advanced Features

- [ ] **Script Stripping**: Optional flag to remove tracking pixels (Google Analytics, Facebook Pixel) automatically.
- [ ] **Iframe Support**: Deep-clone content inside iframes.
- [ ] **Form Mocking**: Replace real forms with local mock endpoints.
- [ ] **Asset Minification**: Optimize the clone size by minifying JS/CSS/Images.
- [ ] **Auth Support**: Allow passing cookies or headers for cloning password-protected sites.

## 🔍 Backlog / Known Issues

- [ ] Large video files can hang the sequential downloader.
- [ ] Some complex JS-based font loaders (like Typekit) might need specific overrides.
- [ ] Dynamic paths in JS files (harder to rewrite than CSS).
