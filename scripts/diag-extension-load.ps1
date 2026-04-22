$ext = 'C:\Users\jwpmi\.vscode-insiders\extensions\cielovistasoftware.cielovista-tools-1.0.0'
Write-Output '=== Installed folder exists? ==='
Write-Output (Test-Path $ext)

Write-Output '=== .obsolete marker contents ==='
$obs = 'C:\Users\jwpmi\.vscode-insiders\extensions\.obsolete'
if (Test-Path $obs) { Get-Content $obs } else { Write-Output 'no-obsolete-file' }

Write-Output '=== extensions.json mentions cielovista? ==='
$exjson = 'C:\Users\jwpmi\.vscode-insiders\extensions\extensions.json'
if (Test-Path $exjson) {
  $c = Get-Content $exjson -Raw
  if ($c -match 'cielovista') { Write-Output 'LISTED' } else { Write-Output 'NOT-LISTED' }
}

Write-Output '=== package.json parse ==='
$pkg = Join-Path $ext 'package.json'
if (Test-Path $pkg) {
  Write-Output ('size-bytes=' + (Get-Item $pkg).Length)
  try {
    $json = Get-Content $pkg -Raw | ConvertFrom-Json
    Write-Output ('name=' + $json.name)
    Write-Output ('version=' + $json.version)
    Write-Output ('publisher=' + $json.publisher)
    Write-Output ('main=' + $json.main)
    Write-Output ('command-count=' + $json.contributes.commands.Count)
  } catch {
    Write-Output ('PARSE-ERROR=' + $_.Exception.Message)
  }
}

Write-Output '=== out/extension.js size ==='
$ej = Join-Path $ext 'out\extension.js'
if (Test-Path $ej) { Write-Output ('size=' + (Get-Item $ej).Length) } else { Write-Output 'MISSING' }

Write-Output '=== leftover rename staging dirs ==='
Get-ChildItem 'C:\Users\jwpmi\.vscode-insiders\extensions' -Force -EA SilentlyContinue | Where-Object { $_.Name -like '.?*' -and $_.PSIsContainer } | Select-Object Name | Format-Table -AutoSize | Out-String | Write-Output