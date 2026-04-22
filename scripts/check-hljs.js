const {execSync} = require('child_process');
const r = execSync('powershell -Command "Get-ChildItem C:\\\\Users\\\\jwpmi\\\\Downloads\\\\VSCode\\\\projects\\\\cielovista-tools\\\\src -Recurse -Filter *.ts | Select-String -Pattern \'MISSING REQUIRED\' | ForEach-Object { $_.Path + \'::\' + $_.LineNumber }"', {encoding:'utf8'});
console.log(r || 'none');
