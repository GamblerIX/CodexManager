$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
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

function Get-FindingKey {
    param($Finding)

    $path = [string]$Finding.path
    $severity = [string]$Finding.severity
    $title = [string]$Finding.title
    return "$path|$severity|$title"
}

function Parse-DateTimeOffset {
    param([object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }

    try {
        return [DateTimeOffset]::Parse($text)
    } catch {
        return $null
    }
}

$root = Get-RepoRoot
$stateDir = Join-Path $root ".github\review-state"
$shardDir = Join-Path $stateDir "review-shards"
New-Item -ItemType Directory -Force -Path $shardDir | Out-Null

$sessionPath = Join-Path $stateDir "session-state.json"
$verifyPath = Join-Path $stateDir "verify-summary.json"
$summaryPath = Join-Path $stateDir "review-summary.json"
$partitionScript = Join-Path $root ".github\scripts\review\partition.ps1"
$session = Read-JsonFile -Path $sessionPath
$verify = Read-JsonFile -Path $verifyPath
$partition = & $partitionScript | ConvertFrom-Json
$shardFiles = @(Get-ChildItem -Path $shardDir -Filter *.json -File -ErrorAction SilentlyContinue | Sort-Object Name)

$sessionId = $null
if ($null -ne $session -and $session.PSObject.Properties.Name -contains "sessionId") {
    $sessionId = [string]$session.sessionId
}

$dirtyAt = $null
if ($null -ne $session -and $session.PSObject.Properties.Name -contains "dirtyAt") {
    $dirtyAt = Parse-DateTimeOffset -Value $session.dirtyAt
}

$verifyGeneratedAt = $null
if ($null -ne $verify -and $verify.PSObject.Properties.Name -contains "generatedAt") {
    $verifyGeneratedAt = Parse-DateTimeOffset -Value $verify.generatedAt
}

$verifySessionId = $null
if ($null -ne $verify -and $verify.PSObject.Properties.Name -contains "sessionId") {
    $verifySessionId = [string]$verify.sessionId
}

$verificationFresh = $false
if (-not [string]::IsNullOrWhiteSpace($sessionId) -and -not [string]::IsNullOrWhiteSpace($verifySessionId) -and $sessionId -eq $verifySessionId -and $null -ne $verifyGeneratedAt) {
    if ($null -eq $dirtyAt -or $verifyGeneratedAt -ge $dirtyAt) {
        $verificationFresh = $true
    }
}

$findings = [System.Collections.Generic.List[object]]::new()
$errors = [System.Collections.Generic.List[string]]::new()
$includedShardCount = 0
$ignoredShardCount = 0
$includedShardNames = [System.Collections.Generic.HashSet[string]]::new()
$expectedShardNames = [System.Collections.Generic.HashSet[string]]::new()

foreach ($item in @($partition)) {
    if ($null -ne $item -and $item.PSObject.Properties.Name -contains "name") {
        [void]$expectedShardNames.Add([string]$item.name)
    }
}

foreach ($file in $shardFiles) {
    $data = Read-JsonFile -Path $file.FullName
    if ($null -eq $data) {
        [void]$errors.Add("Failed to parse shard JSON: $($file.Name)")
        continue
    }

    $shardSessionId = $null
    if ($data.PSObject.Properties.Name -contains "sessionId") {
        $shardSessionId = [string]$data.sessionId
    }

    $shardVerifyGeneratedAt = $null
    if ($data.PSObject.Properties.Name -contains "verifyGeneratedAt") {
        $shardVerifyGeneratedAt = [string]$data.verifyGeneratedAt
    }

    $shardVerifyFresh = $false
    if ($data.PSObject.Properties.Name -contains "verifyFresh") {
        $shardVerifyFresh = [bool]$data.verifyFresh
    }

    $reviewComplete = $false
    if ($data.PSObject.Properties.Name -contains "reviewComplete") {
        $reviewComplete = [bool]$data.reviewComplete
    }

    if (-not $verificationFresh -or [string]::IsNullOrWhiteSpace($sessionId) -or $shardSessionId -ne $sessionId -or -not $shardVerifyFresh -or $shardVerifyGeneratedAt -ne [string]$verify.generatedAt -or -not $reviewComplete) {
        $ignoredShardCount++
        continue
    }

    $includedShardCount++
    if ($data.PSObject.Properties.Name -contains "name") {
        [void]$includedShardNames.Add([string]$data.name)
    }
    if ($data.PSObject.Properties.Name -contains "findings") {
        foreach ($finding in @($data.findings)) {
            if ($null -ne $finding) {
                [void]$findings.Add($finding)
            }
        }
    }
}

$missingShardNames = @(
    $expectedShardNames | Where-Object { -not $includedShardNames.Contains($_) } | Sort-Object
)

if ($missingShardNames.Count -gt 0) {
    [void]$errors.Add("Missing shard results for current session: $($missingShardNames -join ', ')")
}

$deduped = [ordered]@{}
foreach ($finding in $findings) {
    $key = Get-FindingKey -Finding $finding
    if (-not $deduped.Contains($key)) {
        $deduped[$key] = $finding
    }
}

$severityRank = @{
    critical = 0
    high = 1
    medium = 2
    low = 3
    info = 4
}

$orderedFindings = @(
    $deduped.Values | Sort-Object `
        @{ Expression = { if ($severityRank.ContainsKey([string]$_.severity)) { $severityRank[[string]$_.severity] } else { 99 } } }, `
        @{ Expression = { [string]$_.path } }, `
        @{ Expression = { [string]$_.title } }
)

$previousSummary = Read-JsonFile -Path $summaryPath
$previousKeys = [System.Collections.Generic.HashSet[string]]::new()
if ($null -ne $previousSummary -and $previousSummary.PSObject.Properties.Name -contains "findings" -and $previousSummary.PSObject.Properties.Name -contains "sessionId" -and [string]$previousSummary.sessionId -eq $sessionId) {
    foreach ($finding in @($previousSummary.findings)) {
        if ($null -ne $finding) {
            [void]$previousKeys.Add((Get-FindingKey -Finding $finding))
        }
    }
}

$recurringFindings = @(
    $orderedFindings | Where-Object { $previousKeys.Contains((Get-FindingKey -Finding $_)) }
)

$severityCounts = [ordered]@{
    critical = 0
    high = 0
    medium = 0
    low = 0
    info = 0
}

foreach ($finding in $orderedFindings) {
    $severity = [string]$finding.severity
    if ($severityCounts.Contains($severity)) {
        $severityCounts[$severity]++
    }
}

$summary = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    sessionId = $sessionId
    sessionStartedAt = if ($null -ne $session -and $session.PSObject.Properties.Name -contains "sessionStartedAt") { [string]$session.sessionStartedAt } else { $null }
    dirtyAt = if ($null -ne $session -and $session.PSObject.Properties.Name -contains "dirtyAt") { [string]$session.dirtyAt } else { $null }
    verifySessionId = $verifySessionId
    verifyGeneratedAt = if ($null -ne $verify -and $verify.PSObject.Properties.Name -contains "generatedAt") { [string]$verify.generatedAt } else { $null }
    verificationFresh = $verificationFresh
    shardCount = $shardFiles.Count
    includedShardCount = $includedShardCount
    ignoredShardCount = $ignoredShardCount
    missingShardCount = $missingShardNames.Count
    missingShardNames = @($missingShardNames)
    findingCount = $orderedFindings.Count
    severityCounts = $severityCounts
    findings = @($orderedFindings)
    recurringFindings = @($recurringFindings)
    converged = ($verificationFresh -and $missingShardNames.Count -eq 0 -and $orderedFindings.Count -eq 0 -and $errors.Count -eq 0)
    errors = @($errors)
}

$summary | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -Path $summaryPath

$summary | ConvertTo-Json -Depth 12
