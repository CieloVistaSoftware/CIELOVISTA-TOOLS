# ViewADoc — View Any Project Document

**Command:** `cvs.catalog.view`

Opens any `.md` file from any registered project in the built-in browser-based viewer.
Links are rewritten so relative references navigate within the viewer; external links open in the system browser.

## How to Use

1. Open the Doc Catalog (`cvs.catalog.open`)
2. Browse to any doc and click **Open**
3. A local HTTP server starts on `127.0.0.1` and the file opens in your browser

## Notes

- Server binds to `127.0.0.1` only — not exposed to the network
- Port is OS-assigned (random available port)
- Server shuts down automatically when the VS Code window closes
