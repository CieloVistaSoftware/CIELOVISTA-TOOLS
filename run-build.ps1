Set-Location 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools'
Write-Host "Compiling TypeScript..."
& ".\node_modules\.bin\tsc" -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "COMPILE FAILED: $LASTEXITCODE"; exit 1 }
Write-Host "Packaging VSIX..."
& ".\node_modules\.bin\vsce" package --no-dependencies 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "PACKAGE FAILED: $LASTEXITCODE"; exit 1 }
Write-Host "Installing..."
$vsix = Get-ChildItem -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
code --install-extension $vsix.FullName --force 2>&1
Write-Host "Done: $($vsix.Name)"
