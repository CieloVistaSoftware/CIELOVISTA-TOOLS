"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.showResultWebview = showResultWebview;
const vscode = __importStar(require("vscode"));
/**
 * Opens a simple result webview showing action, duration, and result summary.
 * @param title Title for the webview panel
 * @param action Action performed (string)
 * @param durationMs Duration in milliseconds
 * @param result Summary/result string (can be HTML)
 */
function showResultWebview(title, action, durationMs, result) {
    const panel = vscode.window.createWebviewPanel('resultWebview', title, vscode.ViewColumn.Beside, { enableScripts: false });
    panel.webview.html = `
    <html>
      <head>
        <style>
          body { font-family: sans-serif; margin: 2em; }
          .action { font-size: 1.2em; margin-bottom: 0.5em; }
          .duration { color: #888; margin-bottom: 1em; }
          .result { background: #f6f8fa; padding: 1em; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="action"><b>Action:</b> ${action}</div>
        <div class="duration"><b>Duration:</b> ${durationMs} ms</div>
        <div class="result">${result}</div>
      </body>
    </html>
  `;
}
//# sourceMappingURL=show-result-webview.js.map