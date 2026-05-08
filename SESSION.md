# Session Notes - 2024-05-08

## Current State
- The tool successfully clones sites with a robust Playwright crawler.
- Network requests are intercepted to capture assets.
- Visual verification tests the original against the clone via screenshot comparison.

## Progress
- Milestone 2 (Reliability & Speed) is complete.
- Implemented **Parallel Downloads** using `p-limit`. Assets are downloaded concurrently up to 10 at a time.
- Integrated **Progress Indicators** via `cli-progress` to show download progress in real-time.
- Enhanced **Robust Lazy-Loading** by improving regex parsing for `srcset`, handling spacing, and ignoring descriptors (e.g., 2x).
- Added **Absolute Path Normalization**: The crawler now correctly handles `<base href="...">` and normalizes links/assets relative to it.
- Improved HTML rewriting to completely strip `<base>` tags from clones so that local serving works seamlessly without external redirects.
- Download Resume functionality confirmed robust (skips pre-existing files without force flag).

## Next Session Goals (Milestone 3: Advanced Features)
1. **Script Stripping**: Optional flag to remove tracking pixels (Google Analytics, Facebook Pixel) automatically.
2. **Iframe Support**: Deep-clone content inside iframes.
3. **Form Mocking**: Replace real forms with local mock endpoints.
4. **Asset Minification**: Optimize the clone size by minifying JS/CSS/Images.
5. **Auth Support**: Allow passing cookies or headers for cloning password-protected sites.

## Remaining Questions/Issues
- Large video files can hang the sequential downloader (needs parallelization and better handling) -> *Partially mitigated by parallel downloads.*
- Complex font loaders might still be tricky.
- Dynamic paths in JS files are not yet handled.