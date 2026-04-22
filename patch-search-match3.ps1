$f = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\commands.ts'
$c = [System.IO.File]::ReadAllText($f)

$startMarker = "searchEl.addEventListener('input', function() {"
$si = $c.IndexOf($startMarker)
if ($si -lt 0) { Write-Host "ERROR: start not found"; exit 1 }

# Find the closing '});' of this block — it's the first one after the start
$closeMarker = "});" + [char]10
$ei = $c.IndexOf($closeMarker, $si)
if ($ei -lt 0) { Write-Host "ERROR: end not found"; exit 1 }
$blockEnd = $ei + $closeMarker.Length

Write-Host "Block: $si .. $blockEnd  (len $($blockEnd - $si))"

# Build replacement entirely with string concatenation — no here-strings, no interpolation
$lf = [char]10
$nl = $lf
$rep  = "searchEl.addEventListener('input', function() {" + $nl
$rep += "    var q = searchEl.value.toLowerCase().trim();" + $nl
$rep += "    var visible = 0;" + $nl
$rep += "    document.querySelectorAll('.doc-link.search-match').forEach(function(l) { l.classList.remove('search-match'); });" + $nl
$rep += "    document.querySelectorAll('tbody tr').forEach(function(row) {" + $nl
$rep += "        var text = row.textContent.toLowerCase();" + $nl
$rep += "        var show = !q || text.includes(q);" + $nl
$rep += "        row.classList.toggle('hidden', !show);" + $nl
$rep += "        if (show) {" + $nl
$rep += "            var matched = 0;" + $nl
$rep += "            row.querySelectorAll('.doc-link').forEach(function(link) {" + $nl
$rep += "                if (q && link.textContent.toLowerCase().includes(q)) {" + $nl
$rep += "                    link.classList.add('search-match'); matched++;" + $nl
$rep += "                }" + $nl
$rep += "            });" + $nl
$rep += "            visible += q ? matched : row.querySelectorAll('.doc-link').length;" + $nl
$rep += "        }" + $nl
$rep += "    });" + $nl
$rep += "    emptyEl.classList.toggle('visible', document.querySelectorAll('tbody tr:not(.hidden)').length === 0);" + $nl
# The statEl line contains a JS template literal - use single-quote concat so PS doesn't touch it
$rep += '    statEl.textContent = q ? (visible + ' + "' matching of ' + TOTAL + ' docs') : (TOTAL + ' docs across " + '${totalProjects}' + " projects');" + $nl
$rep += "});" + $nl

$newC = $c.Substring(0, $si) + $rep + $c.Substring($blockEnd)
if ($newC -eq $c) { Write-Host "ERROR: no change"; exit 1 }
[System.IO.File]::WriteAllText($f, $newC, [System.Text.Encoding]::UTF8)
Write-Host "Saved OK. New length: $($newC.Length)"
