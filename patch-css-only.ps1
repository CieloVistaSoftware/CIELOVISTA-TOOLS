$f = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\commands.ts'
$c = [System.IO.File]::ReadAllText($f)

$oldCss = '#empty{padding:40px;text-align:center;color:var(--vscode-descriptionForeground);display:none}' + [char]10 + '#empty.visible{display:block}'
$newCss = '#empty{padding:40px;text-align:center;color:var(--vscode-descriptionForeground);display:none}' + [char]10 + '#empty.visible{display:block}' + [char]10 + '.doc-link.search-match{background:rgba(63,185,80,0.13) !important;border-color:rgba(63,185,80,0.55) !important;color:#3fb950 !important;font-weight:600}'

if (-not $c.Contains($oldCss)) { Write-Host "CSS anchor not found"; exit 1 }
$c = $c.Replace($oldCss, $newCss)
[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "CSS rule added OK. Length: $($c.Length)"

# Verify
$ci = $c.IndexOf("search-match{background")
Write-Host "CSS rule now at: $ci"
