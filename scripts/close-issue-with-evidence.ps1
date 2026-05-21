# close-issue-with-evidence.ps1
#
# Enforces issue closure gating:
# 1) blocks closure when markdown checklist items remain unchecked
# 2) requires test evidence in the closure comment
# 3) posts the closure comment via --body-file so markdown newlines render correctly

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [int] $IssueNumber,

    [string] $Repo = "CieloVistaSoftware/cielovista-tools",

    [Parameter(Mandatory = $true)]
    [string] $TestCommand,

    [Parameter(Mandatory = $true)]
    [string] $TestResult,

    [string] $RunContext = "Local validation",

    [string] $Summary = "Implemented requested changes and verified acceptance criteria.",

    [string] $NextSteps = "None"
)

$ErrorActionPreference = "Stop"

function Get-IssueBody {
    param([int] $Number, [string] $RepoName)

    $json = & gh issue view $Number --repo $RepoName --json number,title,body,url 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to read issue #$Number from ${RepoName}: $json"
    }

    return $json | ConvertFrom-Json
}

function Test-HasUncheckedChecklist {
    param([string] $Body)

    if ([string]::IsNullOrWhiteSpace($Body)) { return $false }
    return [regex]::IsMatch($Body, '(?m)^\s*[-*]\s\[\s\]')
}

$issue = Get-IssueBody -Number $IssueNumber -RepoName $Repo

if (Test-HasUncheckedChecklist -Body $issue.body) {
    throw "Closure blocked: issue #$IssueNumber still has unchecked checklist items. Complete all required checklist items before closing."
}

if ([string]::IsNullOrWhiteSpace($TestCommand) -or [string]::IsNullOrWhiteSpace($TestResult)) {
    throw "Closure blocked: test evidence is required (both -TestCommand and -TestResult)."
}

$timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss K')
$comment = @"
## Closure Validation Evidence

**Summary:** $Summary

### Test Evidence
- **Command:** `$TestCommand`
- **Result:** $TestResult
- **Run context:** $RunContext
- **Timestamp:** $timestamp

### Checklist Gate
- [x] Verified no required checklist items remain unchecked in issue body.
- [x] Required test evidence included.

### Next Steps
$NextSteps
"@

$tmp = [System.IO.Path]::GetTempFileName()
try {
    Set-Content -Path $tmp -Value $comment -Encoding utf8 -NoNewline

    if ($PSCmdlet.ShouldProcess("Issue #$IssueNumber", "Post closure evidence comment and close issue")) {
        & gh issue comment $IssueNumber --repo $Repo --body-file $tmp
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to post closure evidence comment for issue #$IssueNumber"
        }

        & gh issue close $IssueNumber --repo $Repo
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to close issue #$IssueNumber"
        }

        Write-Host "Closed issue #$IssueNumber with checklist/test-evidence gate passed." -ForegroundColor Green
    }
}
finally {
    Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue
}
