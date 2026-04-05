[CmdletBinding()]
param(
    [string[]]$Paths
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
}

function Normalize-RepoPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    $normalized = $Path.Trim().Replace("\", "/")
    while ($normalized.StartsWith("./")) {
        $normalized = $normalized.Substring(2)
    }

    return $normalized
}

function Get-ChangedPathsFromGit {
    $result = [System.Collections.Generic.List[string]]::new()

    foreach ($line in @(& git status --porcelain=v1 --untracked-files=all)) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        if ($line.StartsWith("?? ")) {
            $path = $line.Substring(3)
        } elseif ($line -match '^\S\S\s+.+\s+->\s+(.+)$') {
            $path = $Matches[1]
        } elseif ($line.Length -ge 4) {
            $path = $line.Substring(3)
        } else {
            continue
        }

        $normalized = Normalize-RepoPath -Path $path
        if (-not [string]::IsNullOrWhiteSpace($normalized) -and -not $result.Contains($normalized)) {
            [void]$result.Add($normalized)
        }
    }

    return @($result)
}

function Get-ChangedPathsFromSession {
    param([string]$StateDir)

    $sessionPath = Join-Path $StateDir "session-state.json"
    if (-not (Test-Path $sessionPath)) {
        return [pscustomobject]@{
            exists = $false
            paths = @()
        }
    }

    try {
        $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json
    } catch {
        return [pscustomobject]@{
            exists = $true
            paths = @()
        }
    }

    $paths = @(
        @($session.changedFiles) |
            ForEach-Object { Normalize-RepoPath -Path ([string]$_) } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Select-Object -Unique
    )

    return [pscustomobject]@{
        exists = $true
        dirty = if ($session.PSObject.Properties.Name -contains "dirty") { [bool]$session.dirty } else { $false }
        paths = @($paths)
    }
}

$root = Get-RepoRoot
$stateDir = Join-Path $root ".github\review-state"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$changedFiles = @()
if ($PSBoundParameters.ContainsKey("Paths") -and $Paths.Count -gt 0) {
    $changedFiles = @(
        $Paths |
            ForEach-Object { Normalize-RepoPath -Path ([string]$_) } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Select-Object -Unique
    )
} else {
    $sessionPaths = Get-ChangedPathsFromSession -StateDir $stateDir
    $changedFiles = @($sessionPaths.paths)
    if (-not $sessionPaths.exists -or ($sessionPaths.dirty -and $changedFiles.Count -eq 0)) {
        $changedFiles = Get-ChangedPathsFromGit
    }
}

$result = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    changedFiles = @($changedFiles)
    frontend = $false
    tauri = $false
    core = $false
    service = $false
    start = $false
    web = $false
    gateway = $false
    docsConfig = $false
}

foreach ($path in $changedFiles) {
    if ($path -like "apps/src/*") {
        $result.frontend = $true
    }

    if (
        $path -like "apps/public/*" -or
        $path -eq "apps/components.json" -or
        $path -eq "apps/next.config.ts" -or
        $path -eq "apps/postcss.config.mjs" -or
        $path -eq "apps/tsconfig.json" -or
        $path -eq "apps/eslint.config.mjs" -or
        $path -eq "apps/pnpm-workspace.yaml"
    ) {
        $result.frontend = $true
    }

    if ($path -like "apps/src-tauri/*" -or $path -like "apps/src/lib/api/*" -or $path -like "apps/src/lib/runtime/*") {
        $result.tauri = $true
    }

    if ($path -like "apps/src/lib/api/*" -or $path -like "apps/src/lib/runtime/*") {
        $result.frontend = $true
    }

    if ($path -like "crates/core/*") {
        $result.core = $true
    }

    if ($path -like "crates/service/*") {
        $result.service = $true
    }

    if ($path -like "crates/start/*") {
        $result.service = $true
        $result.start = $true
    }

    if ($path -like "crates/web/*") {
        $result.service = $true
        $result.web = $true
    }

    if ($path -like "crates/service/src/gateway/*" -or $path -like "scripts/tests/*gateway*") {
        $result.gateway = $true
    }

    if ($path -eq "apps/package.json" -or $path -eq "apps/pnpm-lock.yaml" -or $path -eq "apps/pnpm-workspace.yaml") {
        $result.frontend = $true
        $result.docsConfig = $true
    }

    if ($path -eq "apps/AGENTS.md") {
        $result.docsConfig = $true
    }

    if (
        $path -like ".github/*" -or
        $path -like "docs/*" -or
        $path -like "scripts/*" -or
        $path -eq "AGENTS.md" -or
        $path -eq "package.json" -or
        $path -eq "pnpm-lock.yaml" -or
        $path -eq "pnpm-workspace.yaml"
    ) {
        $result.docsConfig = $true
    }
}

$classificationPath = Join-Path $stateDir "classification.json"
$result | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $classificationPath

$result | ConvertTo-Json -Depth 8
