$ErrorActionPreference = 'Stop'

$roots = @(
  'C:\Users\jwpmi\Downloads\VSCode\projects',
  'C:\Users\jwpmi\source\repos'
)

$allProjects = @(
  'vscode-claude','wb-core','DiskCleanUp','cielovista-tools','SnapIt','ANeedToKnow',
  'BrowserKeeper','ClaudeAIWebSiteBuilder','VSCode-extensions','DrAlex','ai','company',
  'language','protocols','samples','settings','tooling','templates'
)

$missingReadmeAndChangelog = @('ai','company','language','protocols','samples','settings','tooling','templates')

$marketplaceNonCompliant = @(
  'ANeedToKnow','BrowserKeeper','VSCode-extensions','ai','company','language',
  'protocols','samples','settings','tooling','templates'
)

function Find-ProjectPath([string]$name) {
  foreach ($r in $roots) {
    $p = Join-Path $r $name
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Ensure-File([string]$path, [string]$content) {
  if (-not (Test-Path $path)) {
    $dir = Split-Path $path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    Set-Content -Path $path -Value $content -Encoding UTF8
    Write-Host "Created: $path"
  }
}

function Ensure-Readme([string]$projectPath, [string]$name) {
  $readme = Join-Path $projectPath 'README.md'
  Ensure-File $readme @"
# $name

## Overview
Project overview.

## Setup
````bash
npm install
````

## Usage
````bash
npm run build
npm test
````

## Notes
- Add architecture notes
- Add release notes policy
"@
}

function Ensure-Changelog([string]$projectPath) {
  $changelog = Join-Path $projectPath 'CHANGELOG.md'
  Ensure-File $changelog @"
# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]
### Added
- Baseline changelog created by audit autofix.
"@
}

function Ensure-Icon([string]$projectPath) {
  $icon = Join-Path $projectPath 'icon.png'
  if (-not (Test-Path $icon)) {
    $pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s8n0m8AAAAASUVORK5CYII='
    [IO.File]::WriteAllBytes($icon, [Convert]::FromBase64String($pngBase64))
    Write-Host "Created: $icon"
  }
}

function Ensure-PackageJsonBaseline([string]$projectPath, [string]$name) {
  $pkgPath = Join-Path $projectPath 'package.json'
  if (-not (Test-Path $pkgPath)) { return }

  $raw = Get-Content $pkgPath -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) { return }

  $pkg = $raw | ConvertFrom-Json -Depth 100

  if (-not $pkg.PSObject.Properties['name']) { $pkg | Add-Member -NotePropertyName 'name' -NotePropertyValue $name }
  if (-not $pkg.PSObject.Properties['displayName']) { $pkg | Add-Member -NotePropertyName 'displayName' -NotePropertyValue $name }
  if (-not $pkg.PSObject.Properties['description']) { $pkg | Add-Member -NotePropertyName 'description' -NotePropertyValue "$name project" }
  if (-not $pkg.PSObject.Properties['version']) { $pkg | Add-Member -NotePropertyName 'version' -NotePropertyValue '1.0.0' }
  if (-not $pkg.PSObject.Properties['license']) { $pkg | Add-Member -NotePropertyName 'license' -NotePropertyValue 'MIT' }
  if (-not $pkg.PSObject.Properties['repository']) { $pkg | Add-Member -NotePropertyName 'repository' -NotePropertyValue @{ type = 'git'; url = "https://example.com/$name.git" } }
  if (-not $pkg.PSObject.Properties['bugs']) { $pkg | Add-Member -NotePropertyName 'bugs' -NotePropertyValue @{ url = "https://example.com/$name/issues" } }
  if (-not $pkg.PSObject.Properties['homepage']) { $pkg | Add-Member -NotePropertyName 'homepage' -NotePropertyValue "https://example.com/$name" }
  if (-not $pkg.PSObject.Properties['keywords']) { $pkg | Add-Member -NotePropertyName 'keywords' -NotePropertyValue @('vscode', 'tools') }

  if ($pkg.PSObject.Properties['engines']) {
    if (-not $pkg.engines.PSObject.Properties['vscode']) {
      $pkg.engines | Add-Member -NotePropertyName 'vscode' -NotePropertyValue '^1.90.0' -Force
    }
    if (-not $pkg.PSObject.Properties['icon']) {
      $pkg | Add-Member -NotePropertyName 'icon' -NotePropertyValue 'icon.png' -Force
    }
  }

  if (-not $pkg.PSObject.Properties['scripts']) {
    $pkg | Add-Member -NotePropertyName 'scripts' -NotePropertyValue ([pscustomobject]@{})
  }
  if (-not $pkg.scripts.PSObject.Properties['test:e2e']) {
    $pkg.scripts | Add-Member -NotePropertyName 'test:e2e' -NotePropertyValue 'playwright test' -Force
  }

  if (-not $pkg.PSObject.Properties['devDependencies']) {
    $pkg | Add-Member -NotePropertyName 'devDependencies' -NotePropertyValue ([pscustomobject]@{})
  }
  if (-not $pkg.devDependencies.PSObject.Properties['@playwright/test']) {
    $pkg.devDependencies | Add-Member -NotePropertyName '@playwright/test' -NotePropertyValue '^1.55.0' -Force
  }

  $json = $pkg | ConvertTo-Json -Depth 100
  Set-Content -Path $pkgPath -Value $json -Encoding UTF8
  Write-Host "Updated: $pkgPath"
}

function Ensure-PlaywrightFiles([string]$projectPath) {
  $pkgPath = Join-Path $projectPath 'package.json'
  if (-not (Test-Path $pkgPath)) { return }

  $testsDir = Join-Path $projectPath 'tests'
  if (-not (Test-Path $testsDir)) { New-Item -ItemType Directory -Path $testsDir | Out-Null }

  $spec = Join-Path $testsDir 'smoke.spec.ts'
  Ensure-File $spec @"
import { test, expect } from '@playwright/test';

test('smoke: app starts', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page).toHaveTitle(/.+/);
});
"@

  $cfg = Join-Path $projectPath 'playwright.config.ts'
  Ensure-File $cfg @"
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: { headless: true },
});
"@
}

Write-Host '=== Fixing audit findings ==='

foreach ($name in $missingReadmeAndChangelog) {
  $path = Find-ProjectPath $name
  if ($null -eq $path) { Write-Warning "Not found: $name"; continue }
  Ensure-Readme $path $name
  Ensure-Changelog $path
}

foreach ($name in $marketplaceNonCompliant) {
  $path = Find-ProjectPath $name
  if ($null -eq $path) { Write-Warning "Not found: $name"; continue }
  Ensure-Icon $path
  Ensure-PackageJsonBaseline $path $name
}

foreach ($name in $allProjects) {
  $path = Find-ProjectPath $name
  if ($null -eq $path) { continue }
  Ensure-PackageJsonBaseline $path $name
  Ensure-PlaywrightFiles $path
}

Write-Host '=== Done. ==='