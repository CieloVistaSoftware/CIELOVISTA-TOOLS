$f = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\commands.ts'
$c = [System.IO.File]::ReadAllText($f)
$si = $c.IndexOf("searchEl.addEventListener")
Write-Host "Found at: $si"
Write-Host $c.Substring($si, 500)
