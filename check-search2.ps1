$f = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\commands.ts'
$c = [System.IO.File]::ReadAllText($f)
$si = $c.IndexOf("searchEl.addEventListener")
# Show 600 chars as hex-safe output with explicit newline markers
$chunk = $c.Substring($si, 600)
$chunk = $chunk.Replace("`r", "[CR]").Replace("`n", "[LF]`n")
Write-Host $chunk
