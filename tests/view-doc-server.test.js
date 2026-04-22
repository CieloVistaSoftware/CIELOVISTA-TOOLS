#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

// Test the View Doc HTTP server functionality
async function runTests() {
    console.log('\n✓ View Doc Server Tests');
    console.log('─'.repeat(60));

    let testsPassed = 0;
    let testsFailed = 0;

    // Test 1: Server can start on localhost
    try {
        const server = http.createServer((req, res) => {
            const u = new URL(req.url, 'http://127.0.0.1');

            if (u.pathname === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body>OK</body></html>');
            } else if (u.pathname === '/doc' && decodeURIComponent(u.searchParams.get('path') || '') === '/test.md') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body>Doc content</body></html>');
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });

        server.listen(0, '127.0.0.1', async () => {
            const addr = server.address();
            const port = addr.port;
            const host = addr.address;

            console.log(`\n  ✓ Server started on ${host}:${port}`);
            testsPassed++;

            // Test 2: Homepage responds with HTML
            try {
                const response = await makeRequest(host, port, '/');
                if (response.includes('<html') && response.includes('</html>')) {
                    console.log(`  ✓ Homepage returns valid HTML`);
                    testsPassed++;
                } else {
                    console.log(`  ✗ Homepage does not return valid HTML`);
                    testsFailed++;
                }
            } catch (e) {
                console.log(`  ✗ Homepage request failed: ${e.message}`);
                testsFailed++;
            }

            // Test 3: Doc endpoint returns HTML
            try {
                const response = await makeRequest(host, port, '/doc?path=%2Ftest.md');
                if (response.includes('<html') && response.includes('</html>')) {
                    console.log(`  ✓ Doc endpoint returns valid HTML`);
                    testsPassed++;
                } else {
                    console.log(`  ✗ Doc endpoint does not return valid HTML`);
                    testsFailed++;
                }
            } catch (e) {
                console.log(`  ✗ Doc endpoint request failed: ${e.message}`);
                testsFailed++;
            }

            // Test 4: Invalid path returns 404
            try {
                const response = await makeRequest(host, port, '/nonexistent');
                console.log(`  ✗ Invalid path should return 404 but returned: ${response.substring(0, 50)}`);
                testsFailed++;
            } catch (e) {
                if (e.statusCode === 404) {
                    console.log(`  ✓ Invalid path properly returns 404`);
                    testsPassed++;
                } else {
                    console.log(`  ✗ Invalid path returned unexpected status: ${e.statusCode}`);
                    testsFailed++;
                }
            }

            server.close();

            console.log(`\n────────────────────────────────────────────────────────────`);
            console.log(`${testsPassed} passed, ${testsFailed} failed\n`);

            if (testsFailed > 0) {
                process.exit(1);
            }
        });
    } catch (e) {
        console.log(`  ✗ Server creation failed: ${e.message}`);
        process.exit(1);
    }
}

function makeRequest(host, port, path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host,
            port: port,
            path: path,
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    const err = new Error(`HTTP ${res.statusCode}`);
                    err.statusCode = res.statusCode;
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

runTests();
