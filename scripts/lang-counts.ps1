$r='C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools'
$srcTs=(Get-ChildItem -Path "$r\src" -Recurse -Filter *.ts -File -EA SilentlyContinue).Count
$scriptsJs=(Get-ChildItem -Path "$r\scripts" -Filter *.js -File -EA SilentlyContinue).Count
$scriptsTs=(Get-ChildItem -Path "$r\scripts" -Filter *.ts -File -EA SilentlyContinue).Count
$testsJs=(Get-ChildItem -Path "$r\tests" -Recurse -Filter *.js -File -EA SilentlyContinue).Count
$testsTs=(Get-ChildItem -Path "$r\tests" -Recurse -Filter *.ts -File -EA SilentlyContinue).Count
$mcpTs=(Get-ChildItem -Path "$r\mcp-server\src" -Recurse -Filter *.ts -File -EA SilentlyContinue).Count
$mcpJs=(Get-ChildItem -Path "$r\mcp-server\src" -Recurse -Filter *.js -File -EA SilentlyContinue).Count
Write-Output ("src/ .ts: " + $srcTs)
Write-Output ("scripts/ .js: " + $scriptsJs + "  .ts: " + $scriptsTs)
Write-Output ("tests/ .js: " + $testsJs + "  .ts: " + $testsTs)
Write-Output ("mcp-server/src .ts: " + $mcpTs + "  .js: " + $mcpJs)