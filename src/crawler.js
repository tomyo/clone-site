import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs/promises";

/**
 * @typedef {import('../types.js').CrawlOptions} CrawlOptions
 * @typedef {import('../types.js').CrawledPage} CrawledPage
 * @typedef {import('../types.js').CrawlResult} CrawlResult
 * @typedef {import('../types.js').AssetLinks} AssetLinks
 */

export class Crawler {
  /**
   * @param {CrawlOptions} options
   */
  constructor(options) {
    this.options = options;
    this.baseUrl = new URL(options.url).origin;
    this.browser = null;
    this.visited = new Set();
    this.pages = [];
    this.outputDir = options.outputDir || `./output/${new URL(options.url).hostname}`;
  }

  async init() {
    this.browser = await chromium.launch({ headless: true });
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(path.join(this.outputDir, "screenshots"), {
      recursive: true,
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * @param {string} href
   * @param {string} base
   * @returns {string | null}
   */
  normalizeUrl(href, base) {
    try {
      const urlObj = new URL(href, base);
      urlObj.hash = ""; // Remove hash to avoid revisiting the same page
      
      // Ensure we consistently handle trailing slashes
      // e.g. https://domain.com and https://domain.com/ are the same
      if (urlObj.pathname === "/") {
        // Just keeping it as origin + "/" as the canonical form
        urlObj.pathname = "/"; 
      } else if (urlObj.pathname.endsWith("/")) {
        // Strip trailing slash for consistency on other routes if desired, 
        // though typically WordPress prefers trailing slashes.
        // For our deduplication, we just need to ensure standard canonicalization.
      }

      if (urlObj.origin !== this.baseUrl) {
        return null; // external link
      }
      return urlObj.href;
    } catch {
      return null;
    }
  }

  /**
   * @param {import('playwright').Page} page
   * @param {string} currentUrl
   * @param {boolean} useRawSource
   * @returns {Promise<CrawledPage>}
   */
  async extractPageData(page, currentUrl, useRawSource = false) {
    const title = await page.title();

    // 1. Take a screenshot of the fully rendered state BEFORE we mess with the DOM
    const filenameSafeUrl = currentUrl.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const screenshotPath = path.join(this.outputDir, "screenshots", `${filenameSafeUrl}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // 2. Determine effective base URL for resolving relative links
    let baseUrlToUse = currentUrl;
    const baseTagHref = await page.$eval("base", (b) => b.getAttribute("href")).catch(() => null);
    if (baseTagHref) {
      try {
        baseUrlToUse = new URL(baseTagHref, currentUrl).href;
      } catch (e) {}
    }

    // 3. Revert Custom Elements (Web Components) Light DOM to pre-hydration state if requested
    if (this.options.dehydrateComponents && !useRawSource) {
      try {
        await page.evaluate(async (url) => {
          try {
            const res = await fetch(url);
            const rawHtml = await res.text();
            const parser = new DOMParser();
            const rawDoc = parser.parseFromString(rawHtml, "text/html");

            // Find all custom elements (tags with a hyphen)
            const tags = new Set();
            document.querySelectorAll('*').forEach(el => {
              if (el.tagName.includes('-')) tags.add(el.tagName);
            });

            for (const tag of tags) {
              const renderedEls = document.querySelectorAll(tag);
              const originalEls = rawDoc.querySelectorAll(tag);
              
              for (let i = 0; i < renderedEls.length; i++) {
                if (originalEls[i]) {
                  // Revert the innerHTML to remove injected `slot` attributes and generated DOM
                  renderedEls[i].innerHTML = originalEls[i].innerHTML;
                  
                  // Also strip the slot attribute from the host if it was added dynamically
                  const origSlot = originalEls[i].getAttribute('slot');
                  const renderedSlot = renderedEls[i].getAttribute('slot');
                  if (renderedSlot && !origSlot) {
                    renderedEls[i].removeAttribute('slot');
                  }
                }
              }
            }
          } catch (e) {
            console.warn("[Warning] Failed to dehydrate components:", e);
          }
        }, currentUrl);
      } catch (e) {
        console.warn(`      [Warning] Could not execute component dehydration for ${currentUrl}.`);
      }
    }

    // 4. Get rendered DOM (now potentially dehydrated)
    const renderedDom = await page.content();
    let sourceHtml = renderedDom;

    if (useRawSource) {
      try {
        // Fetch the raw HTML from the network to avoid JS-modified state
        const response = await page.evaluate(async (url) => {
          const res = await fetch(url);
          return await res.text();
        }, currentUrl);
        sourceHtml = response;
      } catch (e) {
        console.warn(`      [Warning] Failed to fetch raw source for ${currentUrl}, falling back to rendered DOM.`);
      }
    }

    // Extract links (routes)
    const hrefs = await page.$$eval("a", (anchors) => anchors.map((a) => a.getAttribute("href")));
    const routes = Array.from(
      new Set(hrefs.map((h) => (h ? this.normalizeUrl(h, baseUrlToUse) : null)).filter((h) => h !== null)),
    );

    // Extract assets from DOM explicitly (in case they weren't fetched, e.g. lazy loaded or icons)
    const images = await page.$$eval("img", (imgs) => imgs.map((img) => img.src).filter(Boolean));
    const icons = await page.$$eval('link[rel*="icon"]', (links) => links.map((l) => l.href).filter(Boolean));
    const metaImages = await page.$$eval('meta[property="og:image"], meta[name="twitter:image"]', (metas) =>
      metas.map((m) => m.content).filter(Boolean),
    );
    const stylesheets = await page.$$eval('link[rel="stylesheet"]', (links) =>
      links.map((l) => l.href).filter(Boolean),
    );
    const scripts = await page.$$eval("script[src]", (scripts) =>
      scripts.map((s) => s.getAttribute("src")).filter(Boolean),
    );

    const imageSet = new Set([...images, ...icons, ...metaImages].map((s) => new URL(s, baseUrlToUse).href));
    const cssSet = new Set(stylesheets.map((s) => new URL(s, baseUrlToUse).href));
    const scriptSet = new Set(scripts.map((s) => new URL(s, baseUrlToUse).href));
    const mediaSet = new Set();
    const fontSet = new Set();

    // Fallback: Aggressive regex parsing of the source HTML for ANY other assets (e.g. data-src, srcset)
    const attrRegex = /(?:src|href|srcset|data-[a-zA-Z0-9\-]+)=["']([^"']+)["']/gi;
    let match;
    while ((match = attrRegex.exec(renderedDom)) !== null) {
      const value = match[1];
      // Split by whitespace or commas (to handle srcset gracefully)
      const parts = value.split(/[\s,]+/);
      for (let part of parts) {
        part = part.trim();
        // Remove descriptors from srcset (e.g. 2x, 100w)
        if (part.match(/^[0-9]+[wx]$/)) continue;
        if (!part || part.startsWith("data:") || part.startsWith("#")) continue;

        try {
          const resolvedUrl = new URL(part, baseUrlToUse).href;
          if (!resolvedUrl.startsWith("http")) continue;

          if (resolvedUrl.match(/\.(png|jpe?g|gif|webp|svg|avif|ico)(\?.*)?$/i)) {
            imageSet.add(resolvedUrl);
          } else if (resolvedUrl.match(/\.css(\?.*)?$/i)) {
            cssSet.add(resolvedUrl);
          } else if (resolvedUrl.match(/\.js(\?.*)?$/i)) {
            scriptSet.add(resolvedUrl);
          } else if (resolvedUrl.match(/\.(mp4|webm|ogg|mov|mp3|wav)(\?.*)?$/i)) {
            mediaSet.add(resolvedUrl);
          } else if (resolvedUrl.match(/\.(woff2?|ttf|otf|eot)(\?.*)?$/i)) {
            fontSet.add(resolvedUrl);
          }
        } catch (e) {} // ignore invalid URLs
      }
    }

    // Also look for inline CSS url(...) patterns
    const urlFuncRegex = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    while ((match = urlFuncRegex.exec(renderedDom)) !== null) {
      const part = match[2].trim();
      if (!part || part.startsWith("data:") || part.startsWith("#")) continue;
      try {
        const resolvedUrl = new URL(part, baseUrlToUse).href;
        if (!resolvedUrl.startsWith("http")) continue;

        if (resolvedUrl.match(/\.(woff2?|ttf|otf|eot)(\?.*)?$/i)) {
          fontSet.add(resolvedUrl);
        } else if (resolvedUrl.match(/\.(png|jpe?g|gif|webp|svg|avif|ico)(\?.*)?$/i)) {
          imageSet.add(resolvedUrl);
        } else if (part.includes("/") && !resolvedUrl.match(/\.(html?|php)$/i)) {
          // Fallback for generic url() assets (often images or SVGs without extensions)
          // Only add if it actually looks like a path (contains a slash)
          imageSet.add(resolvedUrl);
        }
      } catch (e) {}
    }

    /** @type {AssetLinks & { media?: string[], fonts?: string[] }} */
    const assets = {
      images: Array.from(imageSet),
      stylesheets: Array.from(cssSet),
      scripts: Array.from(scriptSet),
      media: Array.from(mediaSet),
      fonts: Array.from(fontSet),
    };

    return {
      url: currentUrl,
      title,
      renderedDom: sourceHtml,
      routes,
      assets,
      screenshotPath,
    };
  }

  /**
   * @returns {Promise<CrawlResult>}
   */
  async crawl() {
    if (!this.browser) await this.init();

    // Canonicalize the starting URL to avoid duplicates like domain.com vs domain.com/
    const startUrl = this.normalizeUrl(this.options.url, this.options.url) || this.options.url;
    
    const queue = [{ url: startUrl, depth: 0 }];
    const maxPages = this.options.maxPages || 10;
    const maxDepth = this.options.maxDepth !== undefined ? this.options.maxDepth : 1;
    const useRawSource = this.options.raw || false;

    // Track all requested external assets
    const externalAssets = {
      stylesheets: new Set(),
      scripts: new Set(),
      fonts: new Set(),
      images: new Set(),
      media: new Set(),
    };

    while (queue.length > 0 && this.pages.length < maxPages) {
      const { url: currentUrl, depth } = queue.shift();

      if (this.visited.has(currentUrl)) continue;
      this.visited.add(currentUrl);

      console.log(`Crawling: ${currentUrl} (Depth: ${depth})`);

      const page = await this.browser.newPage();

      // Intercept network requests to capture assets
      await page.route("**/*", (route) => {
        const request = route.request();
        const resourceType = request.resourceType();
        const url = request.url();

        // We intercept everything, including internal relative links which Playwright resolves to absolute
        // We'll track stylesheets, scripts, fonts, images, and media
        if (["stylesheet", "script", "font", "image", "media"].includes(resourceType)) {
          const key = resourceType === "media" ? "media" : resourceType + "s";
          externalAssets[key].add(url);
        } else if (resourceType === "other" || resourceType === "fetch") {
          // Catch SVGs loaded via fetch/XHR or custom methods
          if (url.endsWith(".svg") || url.includes("assets/")) {
            externalAssets.images.add(url);
          }
        }

        route.continue();
      });

      try {
        await page.goto(currentUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        // Emulate human scrolling to trigger lazy-loaded images and JS widgets
        await page.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 400; // smaller jumps
            let checks = 0;
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;

              // If we reached the bottom
              if (totalHeight >= scrollHeight - window.innerHeight) {
                checks++;
                if (checks >= 5) {
                  // wait a bit (5 * 100ms = 500ms) to ensure no more lazy DOM is generated
                  clearInterval(timer);
                  resolve();
                }
              } else {
                checks = 0; // reset if DOM expanded
              }

              if (totalHeight > 30000) {
                // Safety max out at 30k px
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
          // Scroll back to top just in case
          window.scrollTo(0, 0);
        });

        await page.waitForTimeout(5000);

        const pageData = await this.extractPageData(page, currentUrl, useRawSource);
        this.pages.push(pageData);

        // Ensure all explicit DOM assets are added to global tracking, even if network didn't trigger
        pageData.assets.images.forEach((img) => externalAssets.images.add(img));
        pageData.assets.stylesheets.forEach((css) => externalAssets.stylesheets.add(css));
        pageData.assets.scripts.forEach((script) => externalAssets.scripts.add(script));
        if (pageData.assets.media) pageData.assets.media.forEach((m) => externalAssets.media.add(m));
        if (pageData.assets.fonts) pageData.assets.fonts.forEach((f) => externalAssets.fonts.add(f));

        if (depth < maxDepth) {
          for (const route of pageData.routes) {
            if (!this.visited.has(route) && !queue.find((q) => q.url === route)) {
              queue.push({ url: route, depth: depth + 1 });
            }
          }
        }
      } catch (error) {
        console.error(`Failed to crawl ${currentUrl}:`, error);
      } finally {
        await page.close();
      }
    }

    return {
      baseUrl: this.baseUrl,
      pages: this.pages,
      globalAssets: {
        stylesheets: Array.from(externalAssets.stylesheets),
        scripts: Array.from(externalAssets.scripts),
        fonts: Array.from(externalAssets.fonts),
        images: Array.from(externalAssets.images),
        media: Array.from(externalAssets.media),
      },
    };
  }
}
