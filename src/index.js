#!/usr/bin/env node
import { Crawler } from "./crawler.js";
import * as fs from "fs/promises";
import * as path from "path";
import { chromium } from "playwright";
import pLimit from "p-limit";
import cliProgress from "cli-progress";
import omelette from "omelette";

/**
 * Visual verification to ensure the local clone matches the original site
 */
async function checkClonedPage(originalUrl, cloneDir) {
  console.log(`\n--- Verifying Visual Fidelity ---`);
  console.log(`  Starting local HTTP server for ${cloneDir}...`);

  // Start a zero-dependency static node server directly in this script
  const http = await import("http");
  const fsSync = await import("fs");
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(cloneDir, urlPath === "/" ? "index.html" : urlPath);
    if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    fsSync.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end(JSON.stringify(err));
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
      };
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
      });
      res.end(data);
    });
  });

  await new Promise((r) => server.listen(8081, r));

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 375, height: 667 },
  ];

  try {
    for (const vp of viewports) {
      console.log(`  Snapshotting ${vp.name} (${vp.width}x${vp.height})...`);
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
      });

      // 1. Snapshot the original
      await page.goto(originalUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
      const originalScreenshot = path.join(cloneDir, "..", "screenshots", `original-${vp.name}.png`);
      await fs.mkdir(path.dirname(originalScreenshot), { recursive: true });
      await page.screenshot({ path: originalScreenshot, fullPage: true });

      // 2. Snapshot the local clone
      await page.goto("http://localhost:8081/", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await page.waitForTimeout(3000);
      const cloneScreenshot = path.join(cloneDir, "..", "screenshots", `clone-${vp.name}.png`);
      await page.screenshot({ path: cloneScreenshot, fullPage: true });

      await page.close();
    }

    console.log(`\n✅ Visual check complete! Compare images in ./output/${new URL(originalUrl).hostname}/screenshots/`);
  } catch (err) {
    console.error(`  [Verification Error] ${err.message}`);
  } finally {
    await browser.close();
    server.close(); // Close the node server
  }
}

/**
 * Helper to download an asset and return its local path reflecting site structure
 */
async function downloadAsset(
  assetUrl,
  cloneDir,
  baseDomain,
  visited = new Set(),
  includeVideos = false,
  force = false,
  stats = { newFiles: 0 },
  progressBar = null,
) {
  if (visited.has(assetUrl)) return null;
  visited.add(assetUrl);

  try {
    const urlObj = new URL(assetUrl);
    let urlPath = urlObj.pathname;

    // Skip if it's somehow just a root slash without a filename
    if (urlPath === "/" || urlPath.endsWith("/")) {
      return null;
    }

    let localPath = "";
    // If it matches the site's domain, we keep its path structure (starting with /)
    if (urlObj.hostname === baseDomain) {
      localPath = urlPath;
    } else {
      // For external domains (e.g. fonts.googleapis.com), we group them under /_external/
      localPath = `/_external/${urlObj.hostname}${urlPath}`;
    }

    // Decode URI components to prevent %20 in filenames locally
    localPath = decodeURIComponent(localPath);

    // Ensure the folder structure exists locally
    const targetPath = path.join(cloneDir, localPath);

    // Skip if already exists and not forcing
    if (!force) {
      try {
        await fs.access(targetPath);
        if (!progressBar) console.log(`     [Skip] Already exists: ${localPath}`);
        return localPath;
      } catch (e) {
        // File doesn't exist, proceed to download
      }
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Fetch and save the file with retries
    let response;
    let attempts = 3;
    while (attempts > 0) {
      try {
        response = await fetch(assetUrl);
        if (response.ok) break;
        throw new Error(`Status ${response.status}`);
      } catch (err) {
        attempts--;
        if (attempts === 0) throw err;
        if (!progressBar) console.log(`     [Retry] Failed ${assetUrl}, retrying (${3 - attempts}/3)...`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Skip if the response is actually a web page (likely a 404 or redirect) instead of an asset
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      if (!progressBar) console.log(`     [Skip] Ignoring HTML response for asset: ${assetUrl}`);
      return null;
    }

    stats.newFiles++;
    let buffer = Buffer.from(await response.arrayBuffer());

    // Parse and rewrite CSS files to download embedded dependencies (fonts, images, etc.)
    if (assetUrl.endsWith(".css") || contentType.includes("text/css")) {
      let cssText = buffer.toString("utf-8");
      const urlRegex = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
      let match;
      const replacements = new Map();

      while ((match = urlRegex.exec(cssText)) !== null) {
        const originalRef = match[2].trim();
        if (originalRef.startsWith("data:") || originalRef.startsWith("#")) continue;

        try {
          const resolvedUrl = new URL(originalRef, assetUrl).href;

          // Skip heavy media if includeVideos is false
          if (!includeVideos && resolvedUrl.match(/\.(mp4|webm|ogg|mov)$/i)) {
            replacements.set(originalRef, resolvedUrl); // Rewrite to absolute live URL
            continue;
          }

          // Recursively download the dependency
          if (progressBar) progressBar.setTotal(progressBar.getTotal() + 1);
          const depLocalPath = await downloadAsset(
            resolvedUrl,
            cloneDir,
            baseDomain,
            visited,
            includeVideos,
            force,
            stats,
            progressBar,
          );
          if (progressBar) progressBar.increment();
          if (depLocalPath) {
            replacements.set(originalRef, depLocalPath); // Replace with absolute local path
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      }

      for (const [orig, newPath] of replacements.entries()) {
        cssText = cssText.split(`"${orig}"`).join(`"${newPath}"`);
        cssText = cssText.split(`'${orig}'`).join(`'${newPath}'`);
        cssText = cssText.split(`url(${orig})`).join(`url(${newPath})`);
      }

      buffer = Buffer.from(cssText, "utf-8");
    }

    await fs.writeFile(targetPath, buffer);

    return localPath; // Return the path starting with /
  } catch (error) {
    if (!progressBar) console.error(`     [Warning] Failed to download asset ${assetUrl}:`, error.message);
    return null;
  }
}

/**
 * Main orchestrator for the Literal Visual Clone
 */
async function runPipeline(url, depth = 0, includeVideos = false, force = false, outBaseDir = "output") {
  console.log(`\n--- Starting Perfect Visual Clone for ${url} ---\n`);

  const domain = new URL(url).hostname;
  const cloneDir = path.resolve(path.join(outBaseDir, domain, "clone"));

  // Step 1: Crawl
  console.log("1. Crawling and rendering DOM...");
  const maxPages = depth > 0 ? 1000 : 1; // Default large page count, actual limit is controlled by depth
  const maxDepth = depth;
  const outDir = path.join(outBaseDir, domain);
  const crawler = new Crawler({ url, maxPages, maxDepth, outputDir: outDir });
  await crawler.init();
  const crawlResult = await crawler.crawl();
  await crawler.close();

  await fs.mkdir(cloneDir, { recursive: true });
  await fs.writeFile(path.join(cloneDir, "crawl-data.json"), JSON.stringify(crawlResult, null, 2));

  // Step 2: Download Assets
  console.log(`\n2. Downloading Assets (includeVideos=${includeVideos})...`);
  const assetMap = new Map(); // Maps original absolute URLs to new local paths
  const visitedAssets = new Set(); // Prevent infinite recursion
  const stats = { newFiles: 0 };

  // Always download core visual assets and images
  const categories = ["stylesheets", "scripts", "fonts", "images"];
  if (includeVideos) {
    categories.push("media");
  }

  const allAssets = [];
  for (const category of categories) {
    const urls = crawlResult.globalAssets[category] || [];
    for (const assetUrl of urls) {
      if (assetUrl.startsWith("http")) {
        allAssets.push(assetUrl);
      }
    }
  }

  const progressBar = new cliProgress.SingleBar(
    {
      format: "Downloading Assets | {bar} | {percentage}% || {value}/{total} Files",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  progressBar.start(allAssets.length, 0);

  const limit = pLimit(10); // Run up to 10 downloads concurrently

  const downloadPromises = allAssets.map((assetUrl) => {
    return limit(async () => {
      const localPath = await downloadAsset(
        assetUrl,
        cloneDir,
        domain,
        visitedAssets,
        includeVideos,
        force,
        stats,
        progressBar,
      );
      if (localPath) {
        assetMap.set(assetUrl, localPath);
      }
      progressBar.increment();
    });
  });

  await Promise.all(downloadPromises);

  progressBar.stop();

  console.log(`\n   -> Downloaded ${stats.newFiles} new files.`);

  // Step 3: Rewrite HTML
  console.log("\n3. Rewriting HTML to use local assets...");

  for (const page of crawlResult.pages) {
    console.log(`\nProcessing page: ${page.url}`);

    let html = page.renderedDom;

    // Remove <base> tags to prevent relative path breakage locally
    html = html.replace(/<base[^>]*>/gi, "");

    // Rewrite internal page links to be relative local paths
    // Iterate over all discovered pages in the entire crawl to rewrite navigation links
    const allRoutes = new Set();
    crawlResult.pages.forEach((p) => {
      allRoutes.add(p.url);
      if (p.routes) p.routes.forEach((r) => allRoutes.add(r));
    });

    for (const routeUrl of allRoutes) {
      let routePath = new URL(routeUrl).pathname;
      if (routePath === "/") routePath = "/index.html"; // map root explicitly if preferred, though / works for static servers

      html = html.split(`href="${routeUrl}"`).join(`href="${routePath}"`);
      html = html.split(`href='${routeUrl}'`).join(`href='${routePath}'`);
      // Also replace exact absolute domain references in links just in case
      html = html.split(`"${routeUrl}"`).join(`"${routePath}"`);
      html = html.split(`'${routeUrl}'`).join(`'${routePath}'`);
    }

    // Rewrite downloaded Assets
    for (const [originalUrl, localPath] of assetMap.entries()) {
      html = html.split(originalUrl).join(localPath);
      if (originalUrl.includes("&")) {
        html = html.split(originalUrl.replace(/&/g, "&amp;")).join(localPath);
      }
    }

    // Explicitly rewrite media that we DIDN'T download to be absolute pointing to the original site.
    if (!includeVideos) {
      const mediaUrls = crawlResult.globalAssets["media"] || [];
      for (const assetUrl of mediaUrls) {
        if (assetUrl.startsWith("http") && new URL(assetUrl).hostname === domain) {
          let relativePath = new URL(assetUrl).pathname;

          // Find relative references in HTML and replace them with absolute original URLs
          html = html.split(`"${relativePath}"`).join(`"${assetUrl}"`);
          html = html.split(`'${relativePath}'`).join(`'${assetUrl}'`);

          // Special handling for inline CSS url() paths
          html = html.split(`url('${relativePath}')`).join(`url('${assetUrl}')`);
          html = html.split(`url("${relativePath}")`).join(`url("${assetUrl}")`);
          html = html.split(`url(${relativePath})`).join(`url(${assetUrl})`);
        }
      }
    }

    // Strip out remaining absolute origins for the domain to handle dynamically generated base URLs, RSS feeds, API links, etc
    const domainPrefix = `https://${domain}`;
    html = html.split(domainPrefix).join("");
    const httpPrefix = `http://${domain}`;
    html = html.split(httpPrefix).join("");

    // Determine filename preserving the site structure
    const parsedUrl = new URL(page.url);
    let pageLocalPath = parsedUrl.pathname;

    if (pageLocalPath.endsWith("/")) {
      pageLocalPath += "index.html";
    } else if (!pageLocalPath.endsWith(".html")) {
      // e.g. /about -> /about/index.html
      pageLocalPath += "/index.html";
    }

    const targetHtmlPath = path.join(cloneDir, decodeURIComponent(pageLocalPath));
    await fs.mkdir(path.dirname(targetHtmlPath), { recursive: true });

    await fs.writeFile(targetHtmlPath, html);
    console.log(`  -> Saved literal clone to ./output/${domain}/clone${pageLocalPath}`);
  }

  // Final Step: Visual Check
  await checkClonedPage(url, cloneDir);

  console.log(`\n✅ Clone Complete! Check ./output/${domain}/`);
}

// Setup shell autocomplete
const completion = omelette("clone-site <url> <options>");

completion.on("options", ({ reply }) => {
  reply([
    "--depth=0",
    "--depth=1",
    "--depth=2",
    "--include-videos=true",
    "--include-videos=false",
    "-f",
    "--force",
    "--out=",
    "--setup-completion",
  ]);
});

completion.init();

if (process.argv.includes("--setup-completion")) {
  completion.setupShellInitFile();
  console.log("Autocomplete setup complete! Please restart your terminal or reload your shell profile.");
  process.exit(0);
}

const args = process.argv.slice(2);
let url = args.find((a) => !a.startsWith("-"));

const depthArg = args.find((a) => a.startsWith("--depth"));
let depth = 0;
if (depthArg) {
  if (depthArg.includes("=")) {
    depth = parseInt(depthArg.split("=")[1], 10) || 0;
  }
}

const force = args.includes("-f") || args.includes("--force");

const outArg = args.find((a) => a.startsWith("--out="));
const outBaseDir = outArg ? outArg.split("=")[1] : "output";

const includeVideosArg = args.find((a) => a.startsWith("--include-videos="));
const includeVideos = includeVideosArg ? includeVideosArg.split("=")[1] === "true" : false;

if (!url || url === "--help" || url === "-h") {
  console.error(
    "Usage: clone-site <url> [--depth=<0|1|2|...>] [--include-videos=true|false] [-f|--force] [--out=dir] [--setup-completion]",
  );
  process.exit(1);
}

// Add protocol if missing
if (!url.startsWith("http://") && !url.startsWith("https://")) {
  url = `https://${url}`;
}

runPipeline(url, depth, includeVideos, force, outBaseDir).catch(console.error);
