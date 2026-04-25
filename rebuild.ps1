# cielovista-tools rebuild.ps1
#
# REWRITE — designed to be impossible to leave the install in a broken state.
#
# Problems this fixes (each one bit us in real life):
#
#   1. Old script swallowed TypeScript errors with --noEmitOnError false and
#      a "errors above are pre-existing, ignored" comment. A real compile
#      error (missing import, broken signature) got packaged into a VSIX
#      that loaded but crashed at runtime. NEW: tsc must exit 0, period.
#
#   2. Old script called `code --install-extension`. We use Insiders.
#      `code` and `code-insiders` install into different folders. Half the
#      time the install went to the wrong place. NEW: detect Insiders,
#      use `code-insiders` exclusively.
#
#   3. Old script never bumped the version. Re-installs at the same version
#      caused VS Code's extension manager to mark the old folder .obsolete
#      while leaving its bytes on disk, sometimes failing to write the new
#      bytes if any process held a file lock. Net effect: extension goes
#      missing from extensions.json with all bytes still present. NEW:
#      auto-bump patch version every rebuild.
#
#   4. Old script used --force, which means "install even if the editor is
#      running". Editor file locks then half-completed the swap. NEW:
#      detect if Code-Insiders.exe is running and refuse to install.
#
#   5. Old script said "Done" regardless of whether the install actually
#      took. NEW: post-install verification reads extensions.json and
#      confirms the new version is registered AND not in .obsolete.
#
#   6. Stale .obsolete entries from prior broken installs can prevent a
#      fresh install from being recognized. NEW: strip CVT entries from
#      .obsolete at the START of every rebuild.

$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools'

function Step($msg)  { Write-Host ''; Write-Host "==> $msg" -ForegroundColor Cyan }
function OK($msg)    { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "    --  $msg" -ForegroundColor Yellow }
function Die($msg)   { Write-Host "    !!  $msg" -ForegroundColor Red; exit 1 }

# ── Step 0: Preflight ────────────────────────────────────────────────────────
Step 'Preflight'

$insidersCli = (Get-Command code-insiders -ErrorAction SilentlyContinue).Source
if (-not $insidersCli) { Die 'code-insiders CLI not on PATH. Install VS Code Insiders or add its bin folder to PATH.' }
OK "Insiders CLI: $insidersCli"

$running = @(Get-Process -Name 'Code - Insiders' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
    Die "VS Code Insiders is running (PID $($running.Id -join ', ')). Quit ALL Insiders windows then re-run this script. We will NOT --force into a running editor."
}
OK 'No Insiders processes running'

$extDir = "$env:USERPROFILE\.vscode-insiders\extensions"
if (-not (Test-Path $extDir)) { Die "Insiders extensions folder missing: $extDir" }
OK "Extensions folder: $extDir"

# ── Step 1: Strip CVT entries from .obsolete (defensive) ─────────────────────
Step 'Clean stale .obsolete entries'

$obsPath = Join-Path $extDir '.obsolete'
if (Test-Path $obsPath) {
    $obs = Get-Content $obsPath -Raw | ConvertFrom-Json
    $h = @{}
    $obs.PSObject.Properties | ForEach-Object { $h[$_.Name] = $_.Value }
    $stale = @($h.Keys | Where-Object { $_ -like 'cielovistasoftware.cielovista-tools-*' })
    if ($stale.Count -gt 0) {
        Copy-Item $obsPath ($obsPath + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) -Force
        foreach ($k in $stale) { $h.Remove($k); Warn "removed stale: $k" }
        ($h | ConvertTo-Json -Compress) | Set-Content $obsPath -NoNewline -Encoding utf8
        OK "Cleaned $($stale.Count) stale entries"
    } else {
        OK 'No stale entries to remove'
    }
} else {
    OK '.obsolete file does not exist (clean state)'
}

# ── Step 2: Auto-bump patch version ──────────────────────────────────────────
Step 'Bump version'

$pkgPath = '.\package.json'
$pkgRaw  = Get-Content $pkgPath -Raw
$pkg     = $pkgRaw | ConvertFrom-Json
$oldVer  = $pkg.version

$parts = $oldVer.Split('.')
if ($parts.Count -ne 3) { Die "version not in major.minor.patch form: $oldVer" }
$parts[2] = ([int]$parts[2] + 1).ToString()
$newVer = $parts -join '.'

# Use a regex on raw text to preserve formatting (ConvertTo-Json reformats everything).
$updated = $pkgRaw -replace '"version"\s*:\s*"[^"]+"', "`"version`": `"$newVer`""
$updated | Set-Content $pkgPath -NoNewline -Encoding utf8
OK "Version $oldVer -> $newVer"

# ── Step 3: Compile (strict, fail-fast) ──────────────────────────────────────
Step 'Compile TypeScript (strict)'

& '.\node_modules\.bin\tsc' -p tsconfig.json
if ($LASTEXITCODE -ne 0) {
    # Roll back the version bump if compile failed
    $pkgRaw | Set-Content $pkgPath -NoNewline -Encoding utf8
    Die "TypeScript compilation failed (exit $LASTEXITCODE). Version bump rolled back. Fix errors above and re-run."
}
OK 'Compile succeeded with zero errors'

# ── Step 4: Copy CommandHelp resources ───────────────────────────────────────
Step 'Copy CommandHelp resources'

if (Test-Path '.\src\features\CommandHelp') {
    Copy-Item -Path '.\src\features\CommandHelp' -Destination '.\out\features\CommandHelp' -Recurse -Force
    OK 'CommandHelp copied'
} else {
    Warn 'src/features/CommandHelp not found, skipping'
}

# ── Step 4b: Verify every import resolves ────────────────────────────────────
# This is the gate that would have caught the 1.0.2 disaster: a compiled
# .js that requires a sibling file that doesn't exist. tsc didn't catch it
# because the source for the missing file used to exist; the import path
# was valid TypeScript. The bug is in the EMITTED output. We check the
# emitted output directly.
Step 'Verify all imports in out/ resolve to real files'

& node '.\scripts\verify-imports.js'
if ($LASTEXITCODE -ne 0) {
    $pkgRaw | Set-Content $pkgPath -NoNewline -Encoding utf8
    Die "Import verification failed (exit $LASTEXITCODE). Version bump rolled back. WILL NOT package a VSIX with broken imports."
}
OK 'All relative imports resolve to existing files'

# ── Step 5: Package VSIX ─────────────────────────────────────────────────────
Step 'Package VSIX'

# Delete old VSIX files so we always pick the freshly-built one in step 6
Get-ChildItem -Filter '*.vsix' | Remove-Item -Force -ErrorAction SilentlyContinue

& '.\node_modules\.bin\vsce' package --no-dependencies
if ($LASTEXITCODE -ne 0) { Die "vsce package failed (exit $LASTEXITCODE)" }

$vsix = Get-ChildItem -Filter '*.vsix' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $vsix) { Die 'vsce reported success but no .vsix file found' }
OK "Packaged: $($vsix.Name) ($([math]::Round($vsix.Length/1MB,1)) MB)"

# ── Step 6: Install ──────────────────────────────────────────────────────────
Step 'Install via code-insiders CLI'

# NOT --force. If install fails because of an existing version, it tells us.
& code-insiders --install-extension $vsix.FullName
if ($LASTEXITCODE -ne 0) { Die "code-insiders --install-extension failed (exit $LASTEXITCODE)" }
OK 'CLI returned success'

# ── Step 7: Verification ─────────────────────────────────────────────────────
Step 'Verify install actually took'

$mfPath = Join-Path $extDir 'extensions.json'
if (-not (Test-Path $mfPath)) { Die "extensions.json missing at $mfPath" }
$mf = Get-Content $mfPath -Raw | ConvertFrom-Json
$entry = $mf | Where-Object { $_.identifier.id -eq 'cielovistasoftware.cielovista-tools' }

if (-not $entry) {
    Die "extensions.json does NOT contain cielovistasoftware.cielovista-tools after install. Bytes may be on disk but VS Code will not load them."
}
OK "extensions.json registers id=$($entry.identifier.id) version=$($entry.version)"

if ($entry.version -ne $newVer) {
    Die "extensions.json shows version $($entry.version) but we just packaged $newVer. Stale install."
}
OK "Registered version matches packaged version: $newVer"

# Confirm the install folder exists and has content
$installFolder = Join-Path $extDir "cielovistasoftware.cielovista-tools-$newVer"
if (-not (Test-Path $installFolder)) { Die "Install folder missing: $installFolder" }
$fileCount = (Get-ChildItem $installFolder -Recurse -File -ErrorAction SilentlyContinue).Count
if ($fileCount -lt 100) { Die "Install folder has only $fileCount files. Expected hundreds. Likely a stub." }
OK "Install folder: $fileCount files at $installFolder"

# Confirm no .obsolete entry blocks the new version
if (Test-Path $obsPath) {
    $obsAfter = Get-Content $obsPath -Raw | ConvertFrom-Json
    $blocked = $obsAfter.PSObject.Properties.Name | Where-Object { $_ -eq "cielovistasoftware.cielovista-tools-$newVer" }
    if ($blocked) { Die "New version $newVer is in .obsolete. VS Code will skip it." }
}
OK '.obsolete does NOT block the new version'

# Spot-check a critical compiled file
$homePath = Join-Path $installFolder 'out\features\home-page.js'
if (-not (Test-Path $homePath)) { Die "home-page.js missing inside install folder" }
$homeBytes = (Get-Item $homePath).Length
if ($homeBytes -lt 10000) { Die "home-page.js is only $homeBytes bytes. Expected ~37000. Truncated install." }
OK "home-page.js: $homeBytes bytes"

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " SUCCESS  cielovista-tools $newVer installed and verified         " -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ''
Write-Host "Next: launch VS Code Insiders. The CVT Home dashboard, Recent"
Write-Host "Projects, Open Issues, and CVT registry toggles all reflect the"
Write-Host "freshly-built code."
Write-Host ''
