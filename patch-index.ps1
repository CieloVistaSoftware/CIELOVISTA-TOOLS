$file = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\index.ts'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# 1. Add rebuildCatalog to the import line
$oldImport = "import { openCatalog, viewSpecificDoc, clearCachedCards, deserializeCatalogPanel } from './commands';"
$newImport = "import { openCatalog, viewSpecificDoc, clearCachedCards, rebuildCatalog, deserializeCatalogPanel } from './commands';"

if (-not $content.Contains($oldImport)) {
    Write-Host "ERROR: import anchor not found"
    Write-Host "Current import line search:"
    $idx = $content.IndexOf('openCatalog')
    Write-Host $content.Substring($idx, 120)
    exit 1
}

$content = $content.Replace($oldImport, $newImport)

# 2. Replace the rebuild command registration
$oldCmd = "vscode.commands.registerCommand('cvs.catalog.rebuild', () => { clearCachedCards(); openCatalog(true); }),"
$newCmd = "vscode.commands.registerCommand('cvs.catalog.rebuild', rebuildCatalog),"

if (-not $content.Contains($oldCmd)) {
    Write-Host "ERROR: command registration anchor not found"
    $idx = $content.IndexOf('cvs.catalog.rebuild')
    Write-Host $content.Substring($idx, 120)
    exit 1
}

$content = $content.Replace($oldCmd, $newCmd)
[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host "OK. Length: $($content.Length)"
