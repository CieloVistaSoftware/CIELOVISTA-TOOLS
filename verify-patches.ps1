$f = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\commands.ts'
$c = [System.IO.File]::ReadAllText($f)
$si = $c.IndexOf("searchEl.addEventListener")
Write-Host "--- search block ---"
Write-Host $c.Substring($si, 700)
Write-Host "--- search-match CSS ---"
$ci = $c.IndexOf("search-match")
Write-Host $c.Substring($ci, 120)
Write-Host "--- rebuildCatalog export ---"
$ri = $c.IndexOf("export async function rebuildCatalog")
Write-Host "rebuildCatalog at: $ri"
