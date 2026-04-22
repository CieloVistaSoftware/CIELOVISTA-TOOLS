Write-Output '=== Insiders processes still running? ==='
$procs = Get-Process -Name 'Code - Insiders' -EA SilentlyContinue
if ($procs) {
  Write-Output ('COUNT=' + $procs.Count)
  $procs | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize | Out-String | Write-Output
} else {
  Write-Output 'none'
}

Write-Output '=== orphan staging dirs ==='
Get-ChildItem 'C:\Users\jwpmi\.vscode-insiders\extensions' -Force -EA SilentlyContinue | Where-Object { $_.Name -like '.?*' -and $_.PSIsContainer } | Select-Object Name | Format-Table -AutoSize | Out-String | Write-Output