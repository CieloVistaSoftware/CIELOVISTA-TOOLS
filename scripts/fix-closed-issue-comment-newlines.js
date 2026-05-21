#!/usr/bin/env node
// Fix literal "\\n" sequences in comments on closed issues.
// Usage:
//   node scripts/fix-closed-issue-comment-newlines.js --repo CieloVistaSoftware/CIELOVISTA-TOOLS --limit 300 --apply
// Default is dry-run unless --apply is provided.

'use strict';

const { execFileSync } = require('child_process');

function parseArgs(argv) {
  const out = { repo: 'CieloVistaSoftware/CIELOVISTA-TOOLS', limit: 200, apply: false, state: 'closed' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') { out.apply = true; continue; }
    if (a === '--repo' && argv[i + 1]) { out.repo = argv[++i]; continue; }
    if (a === '--limit' && argv[i + 1]) { out.limit = Number(argv[++i]) || out.limit; continue; }
    if (a === '--state' && argv[i + 1]) { out.state = String(argv[++i] || out.state).toLowerCase(); continue; }
  }
  return out;
}

function ghJson(args) {
  const stdout = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(stdout);
}

function ghRaw(args, input) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input: input || undefined,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function splitCodeFences(text) {
  const parts = [];
  const re = /```[\s\S]*?```/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) { parts.push({ fenced: false, text: text.slice(last, m.index) }); }
    parts.push({ fenced: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) { parts.push({ fenced: false, text: text.slice(last) }); }
  return parts;
}

function normalizeEscapedNewlines(body) {
  if (!body.includes('\\n') && !body.includes('\\r\\n')) { return body; }
  return splitCodeFences(body).map((p) => {
    if (p.fenced) { return p.text; }
    return p.text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  }).join('');
}

function main() {
  const opts = parseArgs(process.argv);
  const [owner, name] = opts.repo.split('/');
  if (!owner || !name) {
    console.error('Invalid --repo. Expected owner/name');
    process.exit(1);
  }

  const issues = ghJson([
    'issue', 'list',
    '--repo', opts.repo,
    '--state', opts.state,
    '--limit', String(opts.limit),
    '--json', 'number,title',
  ]);

  let scannedComments = 0;
  let candidates = 0;
  let patched = 0;

  for (const issue of issues) {
    const comments = ghJson([
      'api',
      `repos/${owner}/${name}/issues/${issue.number}/comments?per_page=100`,
    ]);

    for (const comment of comments) {
      scannedComments += 1;
      const body = String(comment.body || '');
      if (!body.includes('\\n')) { continue; }

      const fixed = normalizeEscapedNewlines(body);
      if (fixed === body) { continue; }

      candidates += 1;
      const preview = fixed.replace(/\n/g, ' ').slice(0, 120);
      console.log(`#${issue.number} comment ${comment.id} candidate by @${comment.user?.login || 'unknown'}: ${preview}`);

      if (!opts.apply) { continue; }

      const payload = JSON.stringify({ body: fixed });
      ghRaw([
        'api',
        '--method', 'PATCH',
        `repos/${owner}/${name}/issues/comments/${comment.id}`,
        '--input', '-',
      ], payload);
      patched += 1;
    }
  }

  console.log('---');
  console.log(`${opts.state[0].toUpperCase() + opts.state.slice(1)} issues scanned: ${issues.length}`);
  console.log(`Comments scanned: ${scannedComments}`);
  console.log(`Candidates found: ${candidates}`);
  console.log(`Patched: ${patched}`);
  if (!opts.apply) {
    console.log('Dry run complete. Re-run with --apply to patch comments.');
  }
}

main();
