# This script converts all relevant text files in the project to UTF-8 without BOM.
# It helps enforce a consistent file encoding standard across the project.

# Define file extensions to include
$extensions = @("*.ts", "*.js", "*.mjs", "*.json", "*.md", "*.ps1", "*.css", "*.html")

# Define directories to exclude
$excludeDirs = @("node_modules", ".git", "out", "dist", ".vscode")

# Get the project root directory (where the script is located)
$projectRoot = Split-Path -Path $PSScriptRoot -Parent

Write-Host "Starting file encoding conversion to UTF-8 (No BOM)..."
Write-Host "Project Root: $projectRoot"

# Get all files matching the extensions, excluding specified directories
$files = Get-ChildItem -Path $projectRoot -Recurse -Include $extensions -Exclude $excludeDirs

# PowerShell's default encoding for Set-Content is not UTF-8 without BOM.
# We create an encoding object to ensure correctness.
$utf8NoBOM = New-Object System.Text.UTF8Encoding($false)

$convertedFiles = 0
$totalFiles = $files.Count

foreach ($file in $files) {
    try {
        Write-Host "Processing: $($file.FullName)"
        $content = Get-Content -Path $file.FullName -Raw
        [System.IO.File]::WriteAllText($file.FullName, $content, $utf8NoBOM)
        $convertedFiles++
    }
    catch {
        Write-Error "Failed to convert file: $($file.FullName). Error: $_"
    }
}

Write-Host "--------------------------------------------------"
Write-Host "Conversion complete."
Write-Host "Processed $totalFiles files."
Write-Host "$convertedFiles files were successfully saved with UTF-8 (No BOM) encoding."
Write-Host "--------------------------------------------------"
Write-Host "To run this script, open a PowerShell terminal and execute:"
Write-Host ".\scripts\convert-to-utf8.ps1"
