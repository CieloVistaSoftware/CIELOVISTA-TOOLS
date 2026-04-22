$f = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\commands.ts'
$c = [System.IO.File]::ReadAllText($f)
$ci = $c.IndexOf("search-match{background")
Write-Host "CSS rule at: $ci"
if ($ci -ge 0) { Write-Host $c.Substring($ci, 120) }
# Also check #empty style
$ei = $c.IndexOf("#empty{padding:40px")
Write-Host "empty CSS at: $ei"
if ($ei -ge 0) { Write-Host $c.Substring($ei, 200) }
