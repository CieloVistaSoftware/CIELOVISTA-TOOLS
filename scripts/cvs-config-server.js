#!/usr/bin/env node
/**
 * cvs-config-server.js
 *
 * Spins up a local HTTP server to serve config.json and handle updates from the config editor webview.
 * Intended for use with the CieloVista Tools Config Editor (VS Code extension).
 *
 * Usage: node scripts/cvs-config-server.js [--port 6275]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const CONFIG_PATH = path.join(process.cwd(), 'config.json');
const PORT = process.argv.includes('--port') ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10) : 6275;

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (req.method === 'GET' && parsedUrl.pathname === '/config') {
    // Serve config.json
    fs.readFile(CONFIG_PATH, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read config.json' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
  } else if (req.method === 'POST' && parsedUrl.pathname === '/config') {
    // Update config.json
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const newConfig = JSON.parse(body);
        fs.writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8', err => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to write config.json' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else if (req.method === 'GET' && parsedUrl.pathname === '/search') {
    // Search config.json for keys/values matching ?q=...
    const query = (parsedUrl.query.q || '').toLowerCase();
    fs.readFile(CONFIG_PATH, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read config.json' }));
        return;
      }
      try {
        const config = JSON.parse(data);
        const results = Object.entries(config)
          .filter(([k, v]) => k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query))
          .map(([k, v]) => ({ key: k, value: v }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid config.json' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`CVS Config Server running at http://localhost:${PORT}/`);
});
