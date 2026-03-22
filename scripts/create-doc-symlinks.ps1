# PowerShell script to create symbolic links for global docs in your project
# Place this script in the scripts/ folder and run from project root

# --- UPDATE THESE PATHS TO MATCH YOUR SYSTEM ---
$globalClaude = "C:\Users\jwpmi\Documents\global-docs\claude"
$globalToday  = "C:\Users\jwpmi\Documents\global-docs\_today"

# --- DO NOT EDIT BELOW THIS LINE ---
$projectRoot = "C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools"
$linkClaude = Join-Path $projectRoot "docs\claude"
$linkToday  = Join-Path $projectRoot "docs\_today"

if (Test-Path $linkClaude) { Remove-Item $linkClaude -Force -Recurse }
if (Test-Path $linkToday)  { Remove-Item $linkToday  -Force -Recurse }

$docsDir = Join-Path $projectRoot "docs"
if (-not (Test-Path $docsDir)) { New-Item -ItemType Directory -Path $docsDir | Out-Null }

New-Item -ItemType SymbolicLink -Path $linkClaude -Target $globalClaude
New-Item -ItemType SymbolicLink -Path $linkToday  -Target $globalToday

Write-Host "Symlinks created:"
Write-Host "  $linkClaude -> $globalClaude"
Write-Host "  $linkToday  -> $globalToday"
