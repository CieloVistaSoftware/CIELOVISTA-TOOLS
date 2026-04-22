$extRoot = 'C:\Users\jwpmi\.vscode-insiders\extensions'
$orphan  = Join-Path $extRoot '.8b73db92-74d1-45ee-9796-beaf5d4679e7'
$cvt     = Join-Path $extRoot 'cielovistasoftware.cielovista-tools-1.0.0'

Write-Output '=== Step 1: remove orphan staging dir ==='
if (Test-Path $orphan) {
  Remove-Item $orphan -Recurse -Force -EA SilentlyContinue
  if (Test-Path $orphan) { Write-Output 'FAILED to remove' } else { Write-Output 'removed' }
} else {
  Write-Output '(already gone)'
}

Write-Output '=== Step 2: remove direct-copied CVT folder so CLI can lay down a fresh copy ==='
if (Test-Path $cvt) {
  Remove-Item $cvt -Recurse -Force -EA SilentlyContinue
  if (Test-Path $cvt) { Write-Output 'FAILED to remove' } else { Write-Output 'removed' }
} else {
  Write-Output '(not present)'
}

Write-Output '=== Step 3: install via CLI ==='
$vsix = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\cielovista-tools-1.0.0.vsix'
$cli  = 'C:\Users\jwpmi\AppData\Local\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd'
if (-not (Test-Path $cli)) {
  Write-Output 'CLI not at default path, trying alt'
  $cli = (Get-Command code-insiders -EA SilentlyContinue).Source
}
Write-Output ('cli=' + $cli)
Write-Output ('vsix=' + $vsix)
& $cli --install-extension $vsix 2>&1 | Out-String | Write-Output
Write-Output ('exit-code=' + $LASTEXITCODE)

Write-Output '=== Step 4: verify extensions.json got the entry ==='
$arr = Get-Content (Join-Path $extRoot 'extensions.json') -Raw | ConvertFrom-Json
$hit = $arr | Where-Object { $_.identifier.id -like '*cielovistasoftware.cielovista-tools*' -or $_.identifier.id -eq 'CieloVistaSoftware.cielovista-tools' }
if ($hit) {
  Write-Output ('REGISTERED id=' + $hit.identifier.id + ' version=' + $hit.version + ' rel=' + $hit.relativeLocation)
  $resolved = Join-Path $extRoot $hit.relativeLocation
  Write-Output ('folder-exists=' + (Test-Path $resolved))
  Write-Output ('package.json-exists=' + (Test-Path (Join-Path $resolved 'package.json')))
  Write-Output ('out/extension.js-exists=' + (Test-Path (Join-Path $resolved 'out\extension.js')))
} else {
  Write-Output 'STILL NOT REGISTERED'
}