const path = require('path');
     const repoRoot = path.resolve(__dirname, '..');
     module.exports = {
         workspace: { workspaceFolders: [{ uri: { fsPath: repoRoot }, name: 'cielovista-tools' }] },
         window: {}, ViewColumn: { One: 1 }, Uri: { parse: s => ({ toString: () => s }) }, env: {}
     };