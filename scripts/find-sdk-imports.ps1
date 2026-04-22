$files = Get-ChildItem -Path 'C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\mcp-server\src' -Recurse -Filter *.ts
foreach ($f in $files) {
  $matches = Select-String -Path $f.FullName -Pattern '@modelcontextprotocol/sdk' -SimpleMatch
  if ($matches) {
    Write-Output ($f.FullName + ':')
    foreach ($m in $matches) { Write-Output ('  line ' + $m.LineNumber + ': ' + $m.Line.Trim()) }
  }
}