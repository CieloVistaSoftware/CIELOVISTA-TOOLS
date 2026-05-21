// Copyright (c) 2026 CieloVista Software. All rights reserved.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// REG-074: Ensure the MCP server's http.js file is built.
// This test was created to prevent a regression where the HTTP server mode
// failed to start because the required http.js was missing from the build output.

function runTest() {
    console.log('Running test: REG-074-mcp-server-http-build.test.js');

    // Arrange: Define the path to the file that should exist
    const httpJsPath = path.join(__dirname, '..', '..', 'mcp-server', 'dist', 'http.js');

    // Act: Check if the file exists
    const fileExists = fs.existsSync(httpJsPath);

    // Assert: The file must exist
    assert(fileExists, 'The MCP server http.js file is missing from the build output (mcp-server/dist/http.js). The build process needs to be fixed to include it.');

    console.log('REG-074 PASSED: MCP server http.js is present in the build output.');
}

runTest();
