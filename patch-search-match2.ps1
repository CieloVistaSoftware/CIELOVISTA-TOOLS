$f = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\commands.ts'
$c = [System.IO.File]::ReadAllText($f)

# Find the exact block by start/end markers (both present and unique)
$startMarker = "searchEl.addEventListener('input', function() {"
$endMarker   = "    statEl.textContent = q ? (visible + ' of ' + TOTAL + ' docs') : (TOTAL + ' docs across ${totalProjects} projects');" + [char]10 + "});"

$si = $c.IndexOf($startMarker)
$ei = $c.IndexOf($endMarker)

Write-Host "start=$si  end=$ei"

if ($si -lt 0 -or $ei -lt 0) {
    # Try without the dollar interpolation issue
    $endMarker2 = "statEl.textContent = q ? (visible + ' of ' + TOTAL + ' docs')"
    $ei2 = $c.IndexOf($endMarker2)
    Write-Host "end2=$ei2"
    Write-Host "chunk: [$($c.Substring($ei2, 100))]"
    exit 1
}

$blockEnd = $ei + $endMarker.Length
$oldBlock = $c.Substring($si, $blockEnd - $si)
Write-Host "Block length: $($oldBlock.Length)"

$newBlock = "searchEl.addEventListener('input', function() {" + [char]10 +
"    var q = searchEl.value.toLowerCase().trim();" + [char]10 +
"    var visible = 0;" + [char]10 +
"    document.querySelectorAll('.doc-link.search-match').forEach(function(l) { l.classList.remove('search-match'); });" + [char]10 +
"    document.querySelectorAll('tbody tr').forEach(function(row) {" + [char]10 +
"        var text = row.textContent.toLowerCase();" + [char]10 +
"        var show = !q || text.includes(q);" + [char]10 +
"        row.classList.toggle('hidden', !show);" + [char]10 +
"        if (show) {" + [char]10 +
"            var matched = 0;" + [char]10 +
"            row.querySelectorAll('.doc-link').forEach(function(link) {" + [char]10 +
"                if (q && link.textContent.toLowerCase().includes(q)) {" + [char]10 +
"                    link.classList.add('search-match'); matched++;" + [char]10 +
"                }" + [char]10 +
"            });" + [char]10 +
"            visible += q ? matched : row.querySelectorAll('.doc-link').length;" + [char]10 +
"        }" + [char]10 +
"    });" + [char]10 +
"    emptyEl.classList.toggle('visible', document.querySelectorAll('tbody tr:not(.hidden)').length === 0);" + [char]10 +
"    statEl.textContent = q ? (visible + ' matching of ' + TOTAL + ' docs') : (TOTAL + ' docs across `${totalProjects} projects');" + [char]10 +
"});"

$newC = $c.Substring(0, $si) + $newBlock + $c.Substring($blockEnd)

if ($newC -eq $c) { Write-Host "ERROR: no change"; exit 1 }
[System.IO.File]::WriteAllText($f, $newC, [System.Text.Encoding]::UTF8)
Write-Host "Saved OK. New length: $($newC.Length)"
