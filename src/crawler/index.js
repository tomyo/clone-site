import { Crawler } from './crawler.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export { Crawler } from './crawler.js';

// For testing directly via CLI: node src/crawler/index.js <url>
import { fileURLToPath } from 'url';

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node src/crawler/index.js <url>');
    process.exit(1);
  }

  (async () => {
    console.log(`Starting crawl for ${url}...`);
    // Limiting to 1 page initially to adhere to the "first milestone" rule
    const crawler = new Crawler({ url, maxPages: 1 });
    try {
      await crawler.init();
      const result = await crawler.crawl();
      
      const outputPath = path.resolve('./output/crawl-data.json');
      await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
      console.log(`Crawl complete! Data saved to ${outputPath}`);
    } catch (err) {
      console.error('Crawler failed:', err);
    } finally {
      await crawler.close();
    }
  })();
}
