import "dotenv/config";
#!/usr/bin/env node
import { Crawler } from "./crawler/crawler.js";
import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import { chromium } from "playwright";

/**
 * Visual verification to ensure the local clone matches the original site
 */
async function checkClonedPage(originalUrl, cloneDir) {
  console.log(`\n--- Verifying Visual Fidelity ---`);
  console.log(`  Starting internal HTTP server for ${cloneDir}...`);

  // Start a zero-dependency static node server directly in this script
  const http = await import("http");
  const fsSync = await import("fs");
  const server = http.createServer((req, res) => {
    let filePath = path.join(cloneDir, req.url === '/' ? 'index.html' : req.url);
    if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).isDirectory()) {
       filePath = path.join(filePath, 'index.html');
    }
    fsSync.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end(JSON.stringify(err));
        return;
      }
      res.writeHead(200);
      res.end(data);
    });
  });

  server.listen(8081);

  const browser = await chromium.launch({ headless: true });
  
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 375, height: 667 }
  ];

  try {
    for (const vp of viewports) {
       console.log(`  Snapshotting ${vp.name} (${vp.width}x${vp.height})...`);
       const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
       
       // 1. Snapshot the original
       await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
       await page.waitForTimeout(3000);
       const originalScreenshot = path.join(cloneDir, 'screenshots', `original-${vp.name}.png`);
       await fs.mkdir(path.dirname(originalScreenshot), { recursive: true });
       await page.screenshot({ path: originalScreenshot, fullPage: true });

       // 2. Snapshot the local clone
       await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
       await page.waitForTimeout(3000);
       const cloneScreenshot = path.join(cloneDir, 'screenshots', `clone-${vp.name}.png`);
       await page.screenshot({ path: cloneScreenshot, fullPage: true });
       
       await page.close();
    }

    console.log(`\n✅ Visual check complete! Compare images in ${cloneDir}/screenshots/`);
  } catch (err) {
    console.error(`  [Verification Error] ${err.message}`);
  } finally {
    await browser.close();
    server.close(); // Kill the node server
  }
}

/**
 * Helper to download an asset and return its local path reflecting site structure
 */
async function downloadAsset(assetUrl, cloneDir, baseDomain, visited = new Set(), includeVideos = false) {
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
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Fetch and save the file
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    let buffer = Buffer.from(await response.arrayBuffer());

    // Parse and rewrite CSS files to download embedded dependencies (fonts, images, etc.)
    const contentType = response.headers.get("content-type") || "";
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
          const depLocalPath = await downloadAsset(resolvedUrl, cloneDir, baseDomain, visited, includeVideos);
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
    console.error(
      `     [Warning] Failed to download asset ${assetUrl}:`,
      error.message,
    );
    return null;
  }
}

/**
 * Main orchestrator for the Literal Visual Clone
 */
async function runPipeline(url, isRecursive = false, includeVideos = false, customOutDir = null) {
  console.log(`\n--- Starting Perfect Visual Clone for ${url} ---\n`);

  const domain = new URL(url).hostname;
  const cloneDir = customOutDir ? path.resolve(customOutDir) : path.resolve(`./${domain}`);

  // Step 1: Crawl
  console.log("1. Crawling and rendering DOM...");
  const maxPages = isRecursive ? 10 : 1;
  const crawler = new Crawler({ url, maxPages, outputDir: cloneDir });
  await crawler.init();
  const crawlResult = await crawler.crawl();
  await crawler.close();

  await fs.mkdir(cloneDir, { recursive: true });
  await fs.writeFile(
    path.join(cloneDir, "crawl-data.json"),
    JSON.stringify(crawlResult, null, 2),
  );

  // Step 2: Download Assets
  console.log(`\n2. Downloading Assets (includeVideos=${includeVideos})...`);
  const assetMap = new Map(); // Maps original absolute URLs to new local paths
  const visitedAssets = new Set(); // Prevent infinite recursion

  // Always download core visual assets and images
  const categories = ["stylesheets", "scripts", "fonts", "images"];
  if (includeVideos) {
    categories.push("media");
  }

  for (const category of categories) {
    const urls = crawlResult.globalAssets[category] || [];
    for (const assetUrl of urls) {
      if (assetUrl.startsWith("http")) {
        const localPath = await downloadAsset(assetUrl, cloneDir, domain, visitedAssets, includeVideos);
        if (localPath) {
          assetMap.set(assetUrl, localPath);
        }
      }
    }
  }

  // Step 3: Rewrite HTML
  console.log("\n3. Rewriting HTML to use local assets...");

  for (const page of crawlResult.pages) {
    console.log(`\nProcessing page: ${page.url}`);

    let html = page.renderedDom;

    // Rewrite downloaded Assets
    for (const [originalUrl, localPath] of assetMap.entries()) {
      html = html.split(originalUrl).join(localPath);
    }

    // Explicitly rewrite media that we DIDN'T download to be absolute pointing to the original site.
    if (!includeVideos) {
      const mediaUrls = crawlResult.globalAssets["media"] || [];
      for (const assetUrl of mediaUrls) {
        if (
          assetUrl.startsWith("http") &&
          new URL(assetUrl).hostname === domain
        ) {
          let relativePath = new URL(assetUrl).pathname;

          // Find relative references in HTML and replace them with absolute original URLs
          html = html.split(`"${relativePath}"`).join(`"${assetUrl}"`);
          html = html.split(`'${relativePath}'`).join(`'${assetUrl}'`);

          // Special handling for inline CSS url() paths
          html = html
            .split(`url('${relativePath}')`)
            .join(`url('${assetUrl}')`);
          html = html
            .split(`url("${relativePath}")`)
            .join(`url("${assetUrl}")`);
          html = html.split(`url(${relativePath})`).join(`url(${assetUrl})`);
        }
      }
    }

    // Determine filename preserving the site structure
    const parsedUrl = new URL(page.url);
    let pageLocalPath = parsedUrl.pathname;

    if (pageLocalPath.endsWith("/")) {
      pageLocalPath += "index.html";
    } else if (!pageLocalPath.endsWith(".html")) {
      // e.g. /about -> /about/index.html
      pageLocalPath += "/index.html";
    }

    const targetHtmlPath = path.join(
      cloneDir,
      decodeURIComponent(pageLocalPath),
    );
    await fs.mkdir(path.dirname(targetHtmlPath), { recursive: true });

    await fs.writeFile(targetHtmlPath, html);
    console.log(
      `  -> Saved literal clone to ${targetHtmlPath}`,
    );
  }

  // Final Step: Visual Check
  await checkClonedPage(url, cloneDir);

  console.log(`\n✅ Clone Complete! Check ${cloneDir}`);
}

const args = process.argv.slice(2);
let url = args.find((a) => !a.startsWith("--"));
const isRecursive = args.includes("--recursive");
const includeVideosArg = args.find((a) => a.startsWith("--include-videos="));
const includeVideos = includeVideosArg
  ? includeVideosArg.split("=")[1] === "true"
  : false;
const outDirArg = args.find((a) => a.startsWith("--out-dir="));
const customOutDir = outDirArg ? outDirArg.split("=")[1] : null;

if (!url) {
  console.error(
    "Usage: clone-site <url> [--recursive] [--include-videos=true|false] [--out-dir=path]",
  );
  process.exit(1);
}

// Add protocol if missing
if (!url.startsWith("http://") && !url.startsWith("https://")) {
  url = `https://${url}`;
}

runPipeline(url, isRecursive, includeVideos, customOutDir).catch(console.error);
