# fresh-install.ps1
# Interactive script to perform a clean, first-time installation of cielovista-tools.

# --- Configuration ---
$repoUrl = "https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS.git"
$defaultInstallPath = "C:\projects\cielovista-tools"

# --- Helper Functions ---
function Write-Host-Header($message) {
    Write-Host "`n"
    Write-Host ("-" * 60)
    Write-Host $message
    Write-Host ("-" * 60)
}

function Invoke-Command-Or-Exit($command, $arguments, $errorMessage) {
    Write-Host "`n> $command $arguments"
    & $command $arguments
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n❌ ERROR: $errorMessage" -ForegroundColor Red
        exit 1
    }
}

# --- Script Start ---
Clear-Host
Write-Host-Header "CieloVista Tools - Fresh Install Script"

# 1. Get Installation Path
$installPath = Read-Host -Prompt "Enter installation directory (press Enter for default)"
if ([string]::IsNullOrWhiteSpace($installPath)) {
    $installPath = $defaultInstallPath
}
Write-Host "Project will be installed in: $installPath"

# 2. Create or Validate Directory
if (Test-Path $installPath) {
    Write-Host "`nDirectory already exists." -ForegroundColor Yellow
    $choice = Read-Host "Do you want to continue using this directory? (y/n)"
    if ($choice -ne 'y') {
        Write-Host "Installation cancelled."
        exit
    }
    # Check if directory is empty
    if (Get-ChildItem -Path $installPath) {
        Write-Host "WARNING: Directory is not empty. Files may be overwritten." -ForegroundColor Yellow
        $overwriteChoice = Read-Host "Are you sure you want to continue? (y/n)"
        if ($overwriteChoice -ne 'y') {
            Write-Host "Installation cancelled."
            exit
        }
    }
} else {
    Write-Host "`nCreating directory: $installPath"
    New-Item -ItemType Directory -Path $installPath -Force | Out-Null
}

# 3. Change to Directory
try {
    Set-Location $installPath
} catch {
    Write-Host "`n❌ ERROR: Could not navigate to '$installPath'. Please check permissions." -ForegroundColor Red
    exit 1
}


# 4. Clone Repository
Write-Host-Header "Step 1 of 3: Cloning repository..."
Invoke-Command-Or-Exit "git" "clone $repoUrl ." "Failed to clone the repository."

# 5. Install Dependencies
Write-Host-Header "Step 2 of 3: Installing dependencies (this may take a minute)..."
Invoke-Command-Or-Exit "npm" "install" "npm install failed."

# 6. Run Fresh Install Build
Write-Host-Header "Step 3 of 3: Building and installing the extension..."
Invoke-Command-Or-Exit "npm" "run fresh-install" "The fresh-install script failed."

# 7. Final Instructions
Write-Host-Header "✅ Installation Complete!"
Write-Host "The final step is to reload the VS Code window to activate the extension."
Write-Host "You can do this by opening the Command Palette (Ctrl+Shift+P) and running 'Developer: Reload Window'."
