import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3002;
const FIXTURE_DIR = path.join(__dirname, "fixtures", "web-components");
const OUTPUT_DIR = path.join(__dirname, "..", "tests", "output");

const server = http.createServer((req, res) => {
  let filePath = path.join(FIXTURE_DIR, req.url === "/" ? "index.html" : req.url);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath);
    const mimeTypes = {
      ".html": "text/html",
      ".js": "text/javascript",
    };
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
    res.end(data);
  });
});

async function runTest() {
  console.log("--- Starting Dehydration Test ---");
  server.listen(PORT, async () => {
    console.log(`Test server running at http://localhost:${PORT}`);

    console.log("Running clone-site with --dehydrate-components...");
    const cloner = spawn(
      "node",
      [
        path.join(__dirname, "..", "src", "index.js"),
        `http://localhost:${PORT}`,
        "--dehydrate-components",
        "--out=tests/output",
        "-f",
      ],
      { stdio: "inherit" },
    );

    cloner.on("close", (code) => {
      server.close();

      if (code === 0) {
        console.log("\n--- Verifying Results ---");
        const clonedFilePath = path.join(__dirname, "..", "tests/output/localhost/clone/index.html");

        if (!fs.existsSync(clonedFilePath)) {
          console.log(`❌ Missing cloned file: ${clonedFilePath}`);
          process.exit(1);
        }

        const html = fs.readFileSync(clonedFilePath, "utf8");

        let allPassed = true;

        // Assert 1: The HTML should NOT contain the hydrated slot="item" attributes
        // because it was successfully dehydrated.
        if (html.includes('slot="item"')) {
          console.log('❌ FAILED: Found slot="item" attribute, dehydration failed to strip it.');
          allPassed = false;
        } else {
          console.log('✅ Passed: slot="item" was successfully stripped from the Light DOM.');
        }

        // Assert 2: The HTML should NOT contain the hydrated classes
        if (html.includes('class="slide hydrated"')) {
          console.log('❌ FAILED: Found "hydrated" class, dehydration failed to revert innerHTML.');
          allPassed = false;
        } else {
          console.log("✅ Passed: Hydrated classes were reverted.");
        }

        // Assert 3: The HTML SHOULD contain the original elements
        if (html.includes('class="slide"')) {
          console.log('✅ Passed: Original class="slide" elements are preserved.');
        } else {
          console.log('❌ FAILED: Original class="slide" elements are missing.');
          allPassed = false;
        }

        if (allPassed) {
          console.log("\n✨ DEHYDRATION TEST PASSED ✨");
          process.exit(0);
        } else {
          console.log("\n💥 DEHYDRATION TEST FAILED 💥");
          process.exit(1);
        }
      } else {
        console.error(`Cloner exited with code ${code}`);
        process.exit(1);
      }
    });
  });
}

runTest().catch((err) => {
  console.error(err);
  server.close();
  process.exit(1);
});
