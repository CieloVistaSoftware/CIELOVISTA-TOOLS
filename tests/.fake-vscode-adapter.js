const path = require('path');
     const repoRoot = "C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools";
     module.exports = {
         workspace: { workspaceFolders: [{ uri: { fsPath: repoRoot }, name: 'cielovista-tools' }] },
         window: {}, ViewColumn: { One: 1 }, Uri: { parse: s => ({ toString: () => s }) }, env: {}
     };