$f = 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\src\features\doc-catalog\commands.ts'
$c = [System.IO.File]::ReadAllText($f)

# ── Patch 1: add .search-match CSS to the CSS constant ──────────────────────
$oldCss = '.doc-link.active-link,a.doc-link.active-link,a.doc-link.active-link:visited{background:rgba(63,185,80,0.18) !important;border-color:#3fb950 !important;color:#3fb950 !important;font-weight:700 !important}'
$newCss = '.doc-link.active-link,a.doc-link.active-link,a.doc-link.active-link:visited{background:rgba(63,185,80,0.18) !important;border-color:#3fb950 !important;color:#3fb950 !important;font-weight:700 !important}' + `
'.doc-link.search-match{background:rgba(63,185,80,0.13) !important;border-color:rgba(63,185,80,0.55) !important;color:#3fb950 !important;font-weight:600}'

if (-not $c.Contains($oldCss)) {
    Write-Host "CSS anchor not found, trying alternate..."
    $oldCss = '#empty{padding:40px;text-align:center;color:var(--vscode-descriptionForeground);display:none}'
    $newCss = '#empty{padding:40px;text-align:center;color:var(--vscode-descriptionForeground);display:none}' + `
'.doc-link.search-match{background:rgba(63,185,80,0.13) !important;border-color:rgba(63,185,80,0.55) !important;color:#3fb950 !important;font-weight:600}'
}

if (-not $c.Contains($oldCss)) {
    Write-Host "ERROR: CSS anchor not found"
    exit 1
}

$c = $c.Replace($oldCss, $newCss)
Write-Host "CSS patch: OK"

# ── Patch 2: replace the search input listener with match-highlighting version ──
$oldSearch = @"
searchEl.addEventListener('input', function() {
    var q = searchEl.value.toLowerCase().trim();
    var visible = 0;
    document.querySelectorAll('tbody tr').forEach(function(row) {
        var text = row.textContent.toLowerCase();
        var show = !q || text.includes(q);
        row.classList.toggle('hidden', !show);
        if (show) { visible += row.querySelectorAll('.doc-link').length; }
    });
    emptyEl.classList.toggle('visible', document.querySelectorAll('tbody tr:not(.hidden)').length === 0);
    statEl.textContent = q ? (visible + ' of ' + TOTAL + ' docs') : (TOTAL + ' docs across ${totalProjects} projects');
});
"@

$newSearch = @"
searchEl.addEventListener('input', function() {
    var q = searchEl.value.toLowerCase().trim();
    var visible = 0;
    // Clear all search-match highlights first
    document.querySelectorAll('.doc-link.search-match').forEach(function(l) { l.classList.remove('search-match'); });
    document.querySelectorAll('tbody tr').forEach(function(row) {
        var text = row.textContent.toLowerCase();
        var show = !q || text.includes(q);
        row.classList.toggle('hidden', !show);
        if (show) {
            var count = 0;
            row.querySelectorAll('.doc-link').forEach(function(link) {
                if (q && link.textContent.toLowerCase().includes(q)) {
                    link.classList.add('search-match');
                    count++;
                }
            });
            // Count all links in visible rows; if query active count matched ones
            visible += q ? count : row.querySelectorAll('.doc-link').length;
        }
    });
    emptyEl.classList.toggle('visible', document.querySelectorAll('tbody tr:not(.hidden)').length === 0);
    statEl.textContent = q ? (visible + ' matching of ' + TOTAL + ' docs') : (TOTAL + ' docs across ${totalProjects} projects');
});
"@

if (-not $c.Contains($oldSearch)) {
    Write-Host "ERROR: search listener anchor not found"
    exit 1
}

$c = $c.Replace($oldSearch, $newSearch)
Write-Host "Search patch: OK"

[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "Saved. Length: $($c.Length)"
