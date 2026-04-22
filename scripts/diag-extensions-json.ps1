$exjson = 'C:\Users\jwpmi\.vscode-insiders\extensions\extensions.json'
$arr = Get-Content $exjson -Raw | ConvertFrom-Json
$hit = $arr | Where-Object { $_.identifier.id -eq 'CieloVistaSoftware.cielovista-tools' -or $_.identifier.id -eq 'cielovistasoftware.cielovista-tools' }
if ($hit) {
  Write-Output ('id=' + $hit.identifier.id)
  Write-Output ('version=' + $hit.version)
  Write-Output ('relativeLocation=' + $hit.relativeLocation)
  Write-Output ('location=' + $hit.location)
  $resolved = Join-Path 'C:\Users\jwpmi\.vscode-insiders\extensions' $hit.relativeLocation
  Write-Output ('resolved=' + $resolved)
  Write-Output ('resolved-exists=' + (Test-Path $resolved))
  Write-Output ('resolved-pkg-exists=' + (Test-Path (Join-Path $resolved 'package.json')))
} else {
  Write-Output 'CVT entry not found'
}

Write-Output '=== Is there any OTHER cielovista entry? (duplicates) ==='
$all = $arr | Where-Object { $_.identifier.id -like '*cielovista*' }
Write-Output ('count=' + $all.Count)
foreach ($e in $all) {
  Write-Output ('  - id=' + $e.identifier.id + ' version=' + $e.version + ' rel=' + $e.relativeLocation)
}

Write-Output '=== staging dir contents (first 5 entries) ==='
$stage = 'C:\Users\jwpmi\.vscode-insiders\extensions\.8b73db92-74d1-45ee-9796-beaf5d4679e7'
if (Test-Path $stage) {
  Get-ChildItem $stage -Force -EA SilentlyContinue | Select-Object -First 5 | ForEach-Object { Write-Output ('  - ' + $_.Name) }
} else {
  Write-Output '  (not present)'
}