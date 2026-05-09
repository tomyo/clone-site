/**
 * @typedef {Object} CrawlOptions
 * @property {string} url
 * @property {number} [maxPages]
 * @property {number} [maxDepth]
 * @property {string} [outputDir]
 * @property {boolean} [raw]
 * @property {boolean} [dehydrateComponents]
 */

/**
 * @typedef {Object} AssetLinks
 * @property {string[]} images
 * @property {string[]} stylesheets
 * @property {string[]} scripts
 */

/**
 * @typedef {Object} CrawledPage
 * @property {string} url
 * @property {string} title
 * @property {string} html - Original or raw HTML
 * @property {string} renderedDom - Rendered DOM (outerHTML of <html>)
 * @property {string[]} routes - Internal links found on the page
 * @property {AssetLinks} assets - Linked external assets (not downloaded)
 * @property {string} [screenshotPath] - Path to saved screenshot
 */

/**
 * @typedef {Object} CrawlResult
 * @property {string} baseUrl
 * @property {CrawledPage[]} pages
 */

/**
 * Canonical Block Representation
 * @typedef {Object} SemanticBlock
 * @property {string} id - Unique identifier for the block
 * @property {string} type - e.g. "hero", "features", "gallery"
 * @property {string} [variant] - e.g. "hero_split", "hero_centered"
 * @property {Record<string, unknown>} props - Extracted content and data
 */

export {};
