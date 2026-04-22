$root='C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools\out'
$dts=Get-ChildItem -Path $root -Recurse -Filter *.d.ts -File -EA SilentlyContinue | Where-Object { $_.FullName -notlike '*\node_modules\*' }
Write-Output ("Total .d.ts files: " + $dts.Count)
Write-Output "---"
Write-Output "Sample: out/shared/registry.d.ts"
Get-Content "$root\shared\registry.d.ts" -EA SilentlyContinue
Write-Output "---"
Write-Output "Sample: out/shared/output-channel.d.ts"
Get-Content "$root\shared\output-channel.d.ts" -EA SilentlyContinue
Write-Output "---"
Write-Output "Sample: out/features/doc-catalog/types.d.ts"
Get-Content "$root\features\doc-catalog\types.d.ts" -EA SilentlyContinue
Write-Output "---"
Write-Output "Sample feature: out/features/terminal-copy-output.d.ts"
Get-Content "$root\features\terminal-copy-output.d.ts" -EA SilentlyContinue