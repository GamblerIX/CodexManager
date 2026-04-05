[CmdletBinding()]
param(
    [switch]$Initialize,
    [Parameter(ValueFromPipeline = $true)]
    [string[]]$InputText
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
}

function Read-HookInput {
    param([string[]]$PipelineInput)

    if ($null -ne $PipelineInput -and $PipelineInput.Count -gt 0) {
        $raw = $PipelineInput -join [Environment]::NewLine
    } else {
        $raw = [Console]::In.ReadToEnd()
    }

    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }

    return $raw | ConvertFrom-Json
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

function Get-ToolArgsValue {
    param(
        $ToolArgs,
        [string[]]$PropertyNames
    )

    if ($null -eq $ToolArgs) {
        return $null
    }

    foreach ($propertyName in $PropertyNames) {
        if ($ToolArgs.PSObject.Properties.Name -contains $propertyName) {
            return $ToolArgs.$propertyName
        }
    }

    return $null
}

function Add-UniqueString {
    param(
        [System.Collections.Generic.List[string]]$List,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return
    }

    if (-not $List.Contains($Value)) {
        [void]$List.Add($Value)
    }
}

function Clear-GeneratedState {
    param([string]$StateDir)

    foreach ($fileName in @(
        "classification.json",
        "next-step.json",
        "review-partition.json",
        "review-summary.json",
        "verify-summary.json"
    )) {
        $path = Join-Path $StateDir $fileName
        if (Test-Path $path) {
            Remove-Item -LiteralPath $path -Force
        }
    }

    $reviewShardDir = Join-Path $StateDir "review-shards"
    if (Test-Path $reviewShardDir) {
        Get-ChildItem -LiteralPath $reviewShardDir -Force -ErrorAction SilentlyContinue |
            Remove-Item -Force -Recurse
    }

    $reviewInputDir = Join-Path $StateDir "review-inputs"
    if (Test-Path $reviewInputDir) {
        Get-ChildItem -LiteralPath $reviewInputDir -Force -ErrorAction SilentlyContinue |
            Remove-Item -Force -Recurse
    }
}

function Test-CommandMutatesState {
    param(
        [string]$ToolName,
        [string]$CommandText
    )

    if ([string]::IsNullOrWhiteSpace($ToolName) -or [string]::IsNullOrWhiteSpace($CommandText)) {
        return $false
    }

    $normalizedToolName = $ToolName.Trim().ToLowerInvariant()
    $shellTools = @("bash", "sh", "zsh", "powershell", "pwsh", "shell", "command", "shell_command", "terminal", "run_in_terminal", "runterminalcommand")
    if ($shellTools -notcontains $normalizedToolName) {
        return $false
    }

    return $CommandText -match '(?is)\b(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item|Clear-Content|git\s+(add|commit|reset|checkout|merge|rebase|stash|restore|switch))\b'
}

$root = Get-RepoRoot
$stateDir = Join-Path $root ".github\review-state"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$sessionPath = Join-Path $stateDir "session-state.json"
$now = (Get-Date).ToString("o")
$input = Read-HookInput -PipelineInput $InputText

$previous = $null
if (Test-Path $sessionPath) {
    try {
        $previous = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json
    } catch {
        $previous = $null
    }
}

$sessionId = $null
if ($null -ne $previous -and $previous.PSObject.Properties.Name -contains "sessionId") {
    $sessionId = [string]$previous.sessionId
}

$sessionStartedAt = $null
if ($null -ne $previous -and $previous.PSObject.Properties.Name -contains "sessionStartedAt") {
    $sessionStartedAt = [string]$previous.sessionStartedAt
}

if ($Initialize) {
    $sessionId = $null
    $sessionStartedAt = $null
}

$toolName = ""
$toolArgsRaw = $null
$toolArgs = $null
$toolResultType = $null
$dirtyNow = $false
$changedFiles = [System.Collections.Generic.List[string]]::new()

if ($null -ne $input) {
    if ($input.PSObject.Properties.Name -contains "tool_name" -and $null -ne $input.tool_name) {
        $toolName = ([string]$input.tool_name).Trim()
    } elseif ($input.PSObject.Properties.Name -contains "toolName" -and $null -ne $input.toolName) {
        $toolName = ([string]$input.toolName).Trim()
    }

    if ($input.PSObject.Properties.Name -contains "tool_input" -and $null -ne $input.tool_input) {
        $toolArgs = $input.tool_input
        $toolArgsRaw = ($input.tool_input | ConvertTo-Json -Depth 20 -Compress)
    } elseif ($input.PSObject.Properties.Name -contains "toolArgs") {
        $toolArgsRaw = [string]$input.toolArgs
        if (-not [string]::IsNullOrWhiteSpace($toolArgsRaw)) {
            try {
                $toolArgs = $toolArgsRaw | ConvertFrom-Json
            } catch {
                $toolArgs = $null
            }
        }
    }

    if ($input.PSObject.Properties.Name -contains "tool_response" -and $null -ne $input.tool_response) {
        $toolResultType = [string]$input.tool_response
    } elseif ($input.PSObject.Properties.Name -contains "toolResult" -and $null -ne $input.toolResult) {
        if ($input.toolResult.PSObject.Properties.Name -contains "resultType") {
            $toolResultType = [string]$input.toolResult.resultType
        }
    }
}

$normalizedToolName = $toolName.ToLowerInvariant()
$mutatingToolPattern = '(edit|write|create|patch|replace|insert|delete|remove|move|rename|multiedit|multi_edit|apply_patch)'
if ($normalizedToolName -match $mutatingToolPattern) {
    $dirtyNow = $true
}

if ($null -ne $toolArgs -and (Test-CommandMutatesState -ToolName $normalizedToolName -CommandText ([string]($toolArgs.command)))) {
    $dirtyNow = $true
}

if ($null -eq $sessionId) {
    $sessionId = ([guid]::NewGuid().ToString("N"))
}

if ([string]::IsNullOrWhiteSpace($sessionStartedAt)) {
    $sessionStartedAt = $now
}

if ($Initialize) {
    Clear-GeneratedState -StateDir $stateDir
}

foreach ($propertyNames in @(
    @("path", "filePath", "file_path"),
    @("destination"),
    @("source")
)) {
    $value = Get-ToolArgsValue -ToolArgs $toolArgs -PropertyNames $propertyNames
    if ($value -is [string]) {
        Add-UniqueString -List $changedFiles -Value (Normalize-RepoPath -Path $value)
    }
}

foreach ($propertyNames in @(
    @("paths", "filePaths", "file_paths"),
    @("files")
)) {
    $values = Get-ToolArgsValue -ToolArgs $toolArgs -PropertyNames $propertyNames
    foreach ($value in @($values)) {
        Add-UniqueString -List $changedFiles -Value (Normalize-RepoPath -Path ([string]$value))
    }
}

$state = [ordered]@{
    sessionId = $sessionId
    sessionStartedAt = $sessionStartedAt
    dirty = $dirtyNow
    initialized = [bool]$Initialize
    updatedAt = $now
    lastToolName = $toolName
    lastToolArgs = $toolArgsRaw
    lastToolResultType = $toolResultType
    dirtyAt = $null
}

if ($null -ne $previous -and -not $Initialize) {
    foreach ($propertyName in @("sessionSource", "initialPrompt", "lastDecision", "lastDecisionAt", "lastVerificationAt", "lastReviewAt")) {
        if ($previous.PSObject.Properties.Name -contains $propertyName) {
            $state[$propertyName] = $previous.$propertyName
        }
    }

    if ($previous.PSObject.Properties.Name -contains "dirty") {
        $state.dirty = [bool]$previous.dirty -or $dirtyNow
    }

    if ($previous.PSObject.Properties.Name -contains "dirtyAt") {
        $state.dirtyAt = $previous.dirtyAt
    }

    foreach ($value in @($previous.changedFiles)) {
        Add-UniqueString -List $changedFiles -Value (Normalize-RepoPath -Path ([string]$value))
    }
}

if ($Initialize) {
    $state.dirty = $false
    $state.dirtyAt = $null
    $changedFiles.Clear()

    if ($null -ne $input) {
        if ($input.PSObject.Properties.Name -contains "source") {
            $state.sessionSource = [string]$input.source
        }

        if ($input.PSObject.Properties.Name -contains "initialPrompt") {
            $state.initialPrompt = [string]$input.initialPrompt
        }

        if ($input.PSObject.Properties.Name -contains "timestamp") {
            $state.sessionStartedAt = [string]$input.timestamp
        }

        if ($input.PSObject.Properties.Name -contains "sessionId" -and -not [string]::IsNullOrWhiteSpace([string]$input.sessionId)) {
            $state.sessionId = [string]$input.sessionId
        }
    }
} elseif ($dirtyNow) {
    $state.dirty = $true
    $state.dirtyAt = $now
}

$state.changedFiles = @($changedFiles)

$state | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $sessionPath

[ordered]@{
    statePath = ".github/review-state/session-state.json"
    initialized = [bool]$Initialize
    sessionId = $state.sessionId
    sessionStartedAt = $state.sessionStartedAt
    dirty = [bool]$state.dirty
    dirtyAt = $state.dirtyAt
    lastToolName = $state.lastToolName
    changedFiles = @($state.changedFiles)
    updatedAt = $state.updatedAt
} | ConvertTo-Json -Depth 8
