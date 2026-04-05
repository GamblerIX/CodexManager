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

function Get-FindingCount {
    param($Items)

    if ($null -eq $Items) {
        return 0
    }

    return @($Items).Count
}

$root = Get-RepoRoot
$stateDir = Join-Path $root ".github\review-state"
$sessionPath = Join-Path $stateDir "session-state.json"
$verifyPath = Join-Path $stateDir "verify-summary.json"
$reviewPath = Join-Path $stateDir "review-summary.json"
$decisionPath = Join-Path $stateDir "next-step.json"

$now = (Get-Date).ToString("o")
$session = Read-JsonFile -Path $sessionPath
$verify = Read-JsonFile -Path $verifyPath
$review = Read-JsonFile -Path $reviewPath

$decision = "rerun-verification"
$reason = "verification summary missing"
$stopHookActive = $false

$sessionId = $null
if ($null -ne $session -and $session.PSObject.Properties.Name -contains "sessionId") {
    $sessionId = [string]$session.sessionId
}

$dirty = $false
$dirtyAt = $null
if ($null -ne $session) {
    if ($session.PSObject.Properties.Name -contains "dirty") {
        $dirty = [bool]$session.dirty
    }

    if ($session.PSObject.Properties.Name -contains "dirtyAt") {
        $dirtyAt = Parse-DateTimeOffset -Value $session.dirtyAt
    }
}

$hookInput = $null
try {
    $rawHookInput = [Console]::In.ReadToEnd()
    if (-not [string]::IsNullOrWhiteSpace($rawHookInput)) {
        $hookInput = $rawHookInput | ConvertFrom-Json
    }
} catch {
    $hookInput = $null
}

if ($null -ne $hookInput -and $hookInput.PSObject.Properties.Name -contains "stop_hook_active") {
    $stopHookActive = [bool]$hookInput.stop_hook_active
}

if ($null -eq $sessionId) {
    $reason = "session state is missing a session id"
} elseif ($null -eq $verify) {
    $reason = "verification summary missing"
} else {
    $verifySessionId = $null
    if ($verify.PSObject.Properties.Name -contains "sessionId") {
        $verifySessionId = [string]$verify.sessionId
    }

    $verifyGeneratedAt = $null
    if ($verify.PSObject.Properties.Name -contains "generatedAt") {
        $verifyGeneratedAt = Parse-DateTimeOffset -Value $verify.generatedAt
    }

    if ([string]::IsNullOrWhiteSpace($verifySessionId) -or $verifySessionId -ne $sessionId) {
        $reason = "verification summary is stale for the current session"
    } elseif ($dirty -and $null -ne $dirtyAt -and $null -ne $verifyGeneratedAt -and $verifyGeneratedAt -lt $dirtyAt) {
        $decision = "rerun-verification"
        $reason = "verification is older than the last dirty change"
    } elseif ($verify.PSObject.Properties.Name -contains "overallStatus" -and [string]$verify.overallStatus -ne "pass") {
        $decision = "continue-fixing"
        $reason = "verification reported failures"
    } else {
        if ($null -eq $review) {
            $decision = "rerun-review"
            $reason = "review summary missing for the current session"
        } else {
            $reviewSessionId = $null
            if ($review.PSObject.Properties.Name -contains "sessionId") {
                $reviewSessionId = [string]$review.sessionId
            }

            $reviewGeneratedAt = $null
            if ($review.PSObject.Properties.Name -contains "generatedAt") {
                $reviewGeneratedAt = Parse-DateTimeOffset -Value $review.generatedAt
            }

            $reviewVerifyGeneratedAt = $null
            if ($review.PSObject.Properties.Name -contains "verifyGeneratedAt") {
                $reviewVerifyGeneratedAt = Parse-DateTimeOffset -Value $review.verifyGeneratedAt
            }

            $reviewFresh = $false
            if ($review.PSObject.Properties.Name -contains "verificationFresh") {
                $reviewFresh = [bool]$review.verificationFresh
            }

            if ([string]::IsNullOrWhiteSpace($reviewSessionId) -or $reviewSessionId -ne $sessionId) {
                $decision = "rerun-review"
                $reason = "review summary is stale for the current session"
            } elseif ($null -ne $dirtyAt -and $null -ne $reviewGeneratedAt -and $reviewGeneratedAt -lt $dirtyAt) {
                $decision = "rerun-review"
                $reason = "review summary is older than the last dirty change"
            } elseif ($null -ne $verifyGeneratedAt -and $null -ne $reviewVerifyGeneratedAt -and $reviewVerifyGeneratedAt -ne $verifyGeneratedAt) {
                $decision = "rerun-review"
                $reason = "review summary does not match the current verification run"
            } elseif (-not $reviewFresh) {
                $decision = "rerun-review"
                $reason = "review summary was produced from stale verification data"
            } elseif ($review.PSObject.Properties.Name -contains "errors" -and @($review.errors).Count -gt 0) {
                $decision = "rerun-review"
                $reason = "review summary reported aggregation errors"
            } else {
                $blockingFindings = @(
                    @($review.findings) | Where-Object {
                        $_.severity -in @("critical", "high")
                    }
                )
                $recurringCount = Get-FindingCount -Items $review.recurringFindings
                $findingCount = Get-FindingCount -Items $review.findings

                if ($recurringCount -ge 2) {
                    $decision = "invoke-loop-operator"
                    $reason = "recurring findings crossed the escalation threshold"
                } elseif ($findingCount -gt 0 -or $blockingFindings.Count -gt 0) {
                    $decision = "continue-fixing"
                    $reason = "review still contains findings"
                } else {
                    $decision = "ready-to-summarize"
                    $reason = "verification and review are both fresh and clear"
                }
            }
        }
    }
}

$summary = [ordered]@{
    generatedAt = $now
    sessionId = $sessionId
    dirtyAt = if ($null -ne $dirtyAt) { $dirtyAt.ToString("o") } else { $null }
    decision = $decision
    reason = $reason
    sessionStatePath = ".github/review-state/session-state.json"
    verifySummaryPath = ".github/review-state/verify-summary.json"
    reviewSummaryPath = ".github/review-state/review-summary.json"
    dirty = $dirty
}

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $decisionPath

$output = [ordered]@{
    continue = $true
    stateDecision = $decision
    stateReason = $reason
}

if ($decision -ne "ready-to-summarize" -and -not $stopHookActive) {
    $output.hookSpecificOutput = [ordered]@{
        hookEventName = "Stop"
        decision = "block"
        reason = "Autoloop requires another round: $reason"
    }
} elseif ($decision -ne "ready-to-summarize") {
    $output.systemMessage = "Autoloop still needs another round: $reason"
}

$output | ConvertTo-Json -Depth 8
