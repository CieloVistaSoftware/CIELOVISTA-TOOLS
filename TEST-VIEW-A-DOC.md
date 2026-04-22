# View a Doc — Manual Test Procedure

**Objective:** Verify that View a Doc opens a browser and all links are clickable.

## Setup

The extension is installed at:
```
C:\Users\jwpmi\.vscode-insiders\extensions\cielovistasoftware.cielovista-tools-1.0.0
```

## Test Steps

### 1. Open Doc Catalog
- Press `Ctrl+Shift+P` to open the Command Palette
- Type: `Open Doc Catalog`
- Press Enter
- ✓ Verify: Catalog webview opens in the next window over (to the right)
- ✓ Verify: Catalog shows ~700 cards organized by project

### 2. Launch View a Doc Server
- In the catalog, look for any doc card (e.g., "View a Doc" entry or any markdown file)
- Click the card to open "View a Doc" 
- ✓ **CRITICAL**: Browser should open to `http://127.0.0.1:<port>` 
  - Do NOT expect a webview panel
  - Do NOT expect an iframe
  - Expect a full native browser window with localhost URL

### 3. Verify Server Startup
- Check the VS Code Output channel: `View > Output > CieloVista Tools`
- ✓ Verify: Message appears: `View a Doc server running at http://127.0.0.1:<port>`

### 4. Test Homepage
- Browser should show a list of all documentation files
- ✓ Verify: Homepage loads (not a blank page)
- ✓ Verify: At least 10+ documentation links are visible
- ✓ Verify: No 404 errors or "Cannot GET" messages

### 5. Test Markdown Links
Click on different documentation links to verify navigation:

**External Links:**
- Click any http/https link (e.g., a URL)
- ✓ Verify: Opened in new browser tab
- ✓ Verify: No console errors

**Internal Doc Links:**
- Click a markdown link to another doc (e.g., in breadcrumb or document)
- ✓ Verify: Doc loaded in same browser window (localhost URL changed)
- ✓ Verify: No 404 errors
- ✓ Verify: Page content displayed correctly

**Email Links:**
- Click a mailto: link if present
- ✓ Verify: Email client opens

**VS Code Links:**
- Click a vscode: link if present  
- ✓ Verify: Switches back to VS Code and executes the command

### 6. Test Server Reuse
- Close the browser window
- Click "View a Doc" again in the catalog
- ✓ Verify: Browser opens again (reusing same localhost port)
- ✓ Verify: No new server started (check output for port reuse)

### 7. Test After Extension Reload
- Press `Ctrl+Shift+P` → `Developer: Reload Window`
- After reload, click "View a Doc" again
- ✓ Verify: New browser window opens with fresh server on new port
- ✓ Verify: All links still work

## Success Criteria

✅ **All of the following must be true:**
1. Browser opens when View a Doc is clicked (not a webview panel)
2. Server runs on localhost with accessible HTTP port
3. At least 10+ docs are visible and clickable
4. Markdown links navigate correctly
5. External links (http/https) open in new tabs
6. Email links work
7. VS Code links switch back to VS Code  
8. No missing file (404) errors
9. No CSP or permission errors
10. Server output shows port number and doc count

## Troubleshooting

**Browser doesn't open:**
- Check VS Code Output (View > Output > CieloVista Tools)
- If you see an error, note the exact message
- Check Windows Defender/Antivirus isn't blocking the localhost connection

**404 errors on links:**
- This means the markdown link resolution failed
- Check the URL in browser address bar
- Make sure the path is URL-encoded properly

**CSP errors in console:**
- Should NOT happen anymore (we removed the iframe approach)
- If you see CSP errors, the extension might not have been reinstalled correctly

**Server doesn't start:**
- Check that port 127.0.0.1 is accessible
- Run in PowerShell: `Test-NetConnection -ComputerName 127.0.0.1 -Port <port>`

## Expected Output in VS Code

When you click "View a Doc", you should see in the CieloVista Tools output:

```
[time] [doc-catalog] View a Doc server running at http://127.0.0.1:50123
[time] [doc-catalog] View Doc browser server on port 50123 — 696 docs
```

The port number will vary each time you start a fresh server.
