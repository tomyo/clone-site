import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'site');
const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'localhost');

// Simple static server
const server = http.createServer((req, res) => {
    let filePath = path.join(FIXTURE_DIR, req.url === '/' ? 'index.html' : req.url);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        const ext = path.extname(filePath);
        const mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'text/javascript'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
        res.end(data);
    });
});

async function runTest() {
    console.log('--- Starting Test Environment ---');
    server.listen(PORT, async () => {
        console.log(`Test server running at http://localhost:${PORT}`);

        console.log('Running clone-site...');
        const cloner = spawn('node', [
            path.join(__dirname, '..', 'src', 'index.js'),
            `http://localhost:${PORT}`,
            '--depth=2',
            '--out=tests/output',
            '-f'
        ], { stdio: 'inherit' });

        cloner.on('close', (code) => {
            server.close();
            
            if (code === 0) {
                console.log('\n--- Verifying Results ---');
                const clonedFiles = [
                    'tests/output/localhost/clone/index.html',
                    'tests/output/localhost/clone/about/index.html',
                    'tests/output/localhost/clone/about/team/index.html',
                    'tests/output/localhost/clone/style.css',
                    'tests/output/localhost/clone/script.js'
                ];

                let allPassed = true;
                clonedFiles.forEach(file => {
                    const fullPath = path.join(__dirname, '..', file);
                    if (fs.existsSync(fullPath)) {
                        console.log(`✅ Found: ${file}`);
                    } else {
                        console.log(`❌ Missing: ${file}`);
                        allPassed = false;
                    }
                });

                if (allPassed) {
                    console.log('\n✨ TEST PASSED ✨');
                    process.exit(0);
                } else {
                    console.log('\n💥 TEST FAILED 💥');
                    process.exit(1);
                }
            } else {
                console.error(`Cloner exited with code ${code}`);
                process.exit(1);
            }
        });
    });
}

runTest().catch(err => {
    console.error(err);
    server.close();
    process.exit(1);
});
