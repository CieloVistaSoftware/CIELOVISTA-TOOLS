// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const mcpOnly    = process.argv.includes('--mcp-only');

const nodeBase = {
  bundle:   true,
  platform: 'node',
  target:   'node18',
  minify:   production,
  logLevel: 'info',
};

async function buildExtension() {
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/extension.ts'],
    outfile:     'out/extension.js',
    external:    ['vscode'],
    format:      'cjs',
    sourcemap:   !production,
  });
  // Standalone analyzer — no vscode dep, consumed by unit tests
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/features/doc-intelligence/analyzer.ts'],
    outfile:     'out/features/doc-intelligence/analyzer.js',
    format:      'cjs',
    sourcemap:   false,
  });
  // Standalone doc-auditor html builder — no vscode dep, consumed by unit tests
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/features/doc-auditor/html.ts'],
    outfile:     'out/features/doc-auditor/html.js',
    format:      'cjs',
    sourcemap:   false,
  });
  // Standalone doc-auditor analyzer — no vscode dep, consumed by unit tests
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/features/doc-auditor/analyzer.ts'],
    outfile:     'out/features/doc-auditor/analyzer.js',
    format:      'cjs',
    sourcemap:   false,
  });
  // Standalone launcher html builder — no vscode dep, consumed by Playwright UI tests
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/features/cvs-command-launcher/html.ts'],
    outfile:     'out/features/cvs-command-launcher/html.js',
    format:      'cjs',
    sourcemap:   false,
  });
  // Standalone doc-catalog projects module — no vscode dep, consumed by unit tests
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/features/doc-catalog/projects.ts'],
    outfile:     'out/features/doc-catalog/projects.js',
    format:      'cjs',
    sourcemap:   false,
  });
  // Standalone doc-catalog commands module — vscode external, consumed by view-doc tests
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/features/doc-catalog/commands.ts'],
    outfile:     'out/features/doc-catalog/commands.js',
    external:    ['vscode'],
    format:      'cjs',
    sourcemap:   false,
  });
  // Standalone shared modules — vscode external, consumed by view-doc tests
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/shared/doc-preview.ts'],
    outfile:     'out/shared/doc-preview.js',
    external:    ['vscode'],
    format:      'cjs',
    sourcemap:   false,
  });
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/shared/output-channel.ts'],
    outfile:     'out/shared/output-channel.js',
    external:    ['vscode'],
    format:      'cjs',
    sourcemap:   false,
  });
  // Standalone doc-auditor scanner — no vscode dep, consumed by unit tests
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/features/doc-auditor/scanner.ts'],
    outfile:     'out/features/doc-auditor/scanner.js',
    format:      'cjs',
    sourcemap:   false,
  });
  // Standalone home-page html builder — vscode external, consumed by regression tests
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/features/home-page.ts'],
    outfile:     'out/features/home-page.js',
    external:    ['vscode'],
    format:      'cjs',
    sourcemap:   false,
  });
  // Standalone readme-generator — vscode external, consumed by unit tests
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['src/features/readme-generator.ts'],
    outfile:     'out/features/readme-generator.js',
    external:    ['vscode'],
    format:      'cjs',
    sourcemap:   false,
  });
}

async function buildMcpServer() {
  // Main server entry — self-contained, no external deps needed at runtime
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['mcp-server/src/index.ts'],
    outfile:     'mcp-server/dist/index.js',
    format:      'esm',
    sourcemap:   false,
  });
  // Standalone catalog-helpers module consumed by scripts/backfill-doc-contract.mjs
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['mcp-server/src/tools/catalog-helpers.ts'],
    outfile:     'mcp-server/dist/tools/catalog-helpers.js',
    format:      'esm',
    sourcemap:   false,
  });
  // HTTP server entry for MCP server HTTP mode
  await esbuild.build({
    ...nodeBase,
    entryPoints: ['mcp-server/src/http.ts'],
    outfile:     'mcp-server/dist/http.js',
    format:      'esm',
    sourcemap:   false,
  });
}

if (mcpOnly) {
  await buildMcpServer();
} else {
  await Promise.all([buildExtension(), buildMcpServer()]);
}
