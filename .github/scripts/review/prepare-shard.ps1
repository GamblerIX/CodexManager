[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Name
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

function Test-PathInScope {
    param(
        [string]$Path,
        [string]$Scope
    )

    $normalizedPath = Normalize-RepoPath -Path $Path
    $normalizedScope = Normalize-RepoPath -Path $Scope

    if ([string]::IsNullOrWhiteSpace($normalizedPath) -or [string]::IsNullOrWhiteSpace($normalizedScope)) {
        return $false
    }

    if ($normalizedScope -notmatch '/') {
        return $normalizedPath -eq $normalizedScope
    }

    return $normalizedPath -eq $normalizedScope -or $normalizedPath.StartsWith("$normalizedScope/")
}

function Read-JsonFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return $null
    }

    try {
        return Get-Content -Raw -Path $Path | ConvertFrom-Json
    } catch {
        return $null
    }
}

$root = Get-RepoRoot
$stateDir = Join-Path $root ".github\review-state"
$reviewInputDir = Join-Path $stateDir "review-inputs"
$reviewShardDir = Join-Path $stateDir "review-shards"
New-Item -ItemType Directory -Force -Path $reviewInputDir | Out-Null
New-Item -ItemType Directory -Force -Path $reviewShardDir | Out-Null

$sessionPath = Join-Path $stateDir "session-state.json"
$verifyPath = Join-Path $stateDir "verify-summary.json"

$session = Read-JsonFile -Path $sessionPath
$verify = Read-JsonFile -Path $verifyPath

$partitionScript = Join-Path $root ".github\scripts\review\partition.ps1"
$classifyScript = Join-Path $root ".github\scripts\verify\classify-changes.ps1"

$partition = & $partitionScript | ConvertFrom-Json
$classification = & $classifyScript | ConvertFrom-Json
$target = @($partition | Where-Object { $_.name -eq $Name } | Select-Object -First 1)

if ($target.Count -eq 0) {
    throw "Unknown shard: $Name"
}

$changedFiles = @(
    @($classification.changedFiles) | Where-Object {
        $path = [string]$_
        @($target.paths) | Where-Object { Test-PathInScope -Path $path -Scope ([string]$_) }
    }
)

$instructionHints = [System.Collections.Generic.List[string]]::new()
[void]$instructionHints.Add("AGENTS.md")
if (@($target.paths) | Where-Object { ([string]$_).StartsWith("apps") }) {
    if ($instructionHints -notcontains "apps/AGENTS.md") {
        [void]$instructionHints.Add("apps/AGENTS.md")
    }
}

$verifyGeneratedAt = $null
if ($null -ne $verify -and $verify.PSObject.Properties.Name -contains "generatedAt") {
    $verifyGeneratedAt = [string]$verify.generatedAt
}

$verifySessionId = $null
if ($null -ne $verify -and $verify.PSObject.Properties.Name -contains "sessionId") {
    $verifySessionId = [string]$verify.sessionId
}

$sessionId = $null
if ($null -ne $session -and $session.PSObject.Properties.Name -contains "sessionId") {
    $sessionId = [string]$session.sessionId
}

$dirtyAt = $null
if ($null -ne $session -and $session.PSObject.Properties.Name -contains "dirtyAt") {
    $dirtyAt = [string]$session.dirtyAt
}

$verifyFresh = $false
if (-not [string]::IsNullOrWhiteSpace($sessionId) -and -not [string]::IsNullOrWhiteSpace($verifySessionId) -and $sessionId -eq $verifySessionId -and -not [string]::IsNullOrWhiteSpace($verifyGeneratedAt)) {
    $verifyFresh = $true
    if (-not [string]::IsNullOrWhiteSpace($dirtyAt)) {
        try {
            if ([DateTimeOffset]::Parse($verifyGeneratedAt) -lt [DateTimeOffset]::Parse($dirtyAt)) {
                $verifyFresh = $false
            }
        } catch {
            $verifyFresh = $false
        }
    }
}

$output = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    sessionId = $sessionId
    sessionStartedAt = if ($null -ne $session -and $session.PSObject.Properties.Name -contains "sessionStartedAt") { [string]$session.sessionStartedAt } else { $null }
    dirtyAt = $dirtyAt
    verifySessionId = $verifySessionId
    verifyGeneratedAt = $verifyGeneratedAt
    verifyFresh = $verifyFresh
    name = $Name
    paths = @($target.paths)
    changedFiles = @($changedFiles | Select-Object -Unique)
    hasChanges = (@($changedFiles).Count -gt 0)
    instructionHints = @($instructionHints | Select-Object -Unique)
    verifySummaryPath = ".github/review-state/verify-summary.json"
    reviewInputPath = ".github/review-state/review-inputs/$Name.json"
    reviewOutputPath = ".github/review-state/review-shards/$Name.json"
}

$outputPath = Join-Path $reviewInputDir "$Name.json"
$output | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $outputPath

$output | ConvertTo-Json -Depth 8
