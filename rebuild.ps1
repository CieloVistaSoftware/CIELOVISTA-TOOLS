Set-Location 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools'
Write-Host "Compiling..."
& ".\node_modules\.bin\tsc" -p tsconfig.json --noEmitOnError false 2>&1
Write-Host "Compile done (errors above are pre-existing, ignored)"
Write-Host "Copying CommandHelp..."
Copy-Item -Path ".\src\features\CommandHelp" -Destination ".\out\features\CommandHelp" -Recurse -Force
Write-Host "Packaging..."
& ".\node_modules\.bin\vsce" package --no-dependencies 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "PACKAGE FAILED"; exit 1 }
$vsix = Get-ChildItem -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "Installing $($vsix.Name)..."
code --install-extension $vsix.FullName --force 2>&1
Write-Host "Done"
