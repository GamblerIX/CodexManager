[CmdletBinding()]
param(
    [string[]]$Paths
)

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

function Invoke-Step {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [scriptblock]$Action
    )

    Push-Location $WorkingDirectory
    $start = Get-Date
    try {
        $global:LASTEXITCODE = 0
        & $Action
        if ($LASTEXITCODE -ne 0) {
            throw "Step exited with code $LASTEXITCODE"
        }

        return [pscustomobject]@{
            name = $Name
            status = "pass"
            command = $Action.ToString().Trim()
            workingDirectory = $WorkingDirectory
            startedAt = $start.ToString("o")
            finishedAt = (Get-Date).ToString("o")
        }
    } catch {
        return [pscustomobject]@{
            name = $Name
            status = "fail"
            command = $Action.ToString().Trim()
            workingDirectory = $WorkingDirectory
            startedAt = $start.ToString("o")
            finishedAt = (Get-Date).ToString("o")
            error = $_.Exception.Message
        }
    } finally {
        Pop-Location
    }
}

$root = Get-RepoRoot
$stateDir = Join-Path $root ".github\review-state"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$classificationScript = Join-Path $root ".github\scripts\verify\classify-changes.ps1"
$sessionPath = Join-Path $stateDir "session-state.json"
$session = Read-JsonFile -Path $sessionPath
if ($PSBoundParameters.ContainsKey("Paths") -and $Paths.Count -gt 0) {
    $classification = & $classificationScript -Paths $Paths | ConvertFrom-Json
} else {
    $classification = & $classificationScript | ConvertFrom-Json
}
$steps = [System.Collections.Generic.List[object]]::new()

if ($classification.frontend) {
    [void]$steps.Add((Invoke-Step -Name "frontend-build" -WorkingDirectory (Join-Path $root "apps") -Action { pnpm run build:desktop }))
}

if ($classification.docsConfig) {
    [void]$steps.Add((Invoke-Step -Name "automation-config-smoke" -WorkingDirectory $root -Action {
        $targets = @(
            @($classification.changedFiles) | Where-Object {
                $_ -like ".github/hooks/*.json" -or
                $_ -like ".github/agents/*.agent.md" -or
                $_ -like ".github/skills/*/SKILL.md" -or
                $_ -like ".github/instructions/*.instructions.md" -or
                $_ -like ".github/scripts/*" -or
                $_ -like "scripts/*.ps1" -or
                $_ -eq "AGENTS.md" -or
                $_ -eq "apps/AGENTS.md"
            }
        )

        if ($targets.Count -eq 0) {
            $targets = @(".github/hooks/autoloop.json")
        }

        foreach ($relativePath in $targets) {
            $fullPath = Join-Path $root ($relativePath -replace '/', '\')
            if (-not (Test-Path -LiteralPath $fullPath)) {
                continue
            }

            if ($relativePath -like "*.json") {
                Get-Content -Raw -LiteralPath $fullPath | ConvertFrom-Json | Out-Null
            } elseif ($relativePath -like "*.agent.md" -or $relativePath -like "*/SKILL.md") {
                $content = Get-Content -Raw -LiteralPath $fullPath
                if (-not ($content -match '(?s)^---\r?\n.*?\bname:\s*.+?\r?\n.*?\bdescription:\s*.+?\r?\n---')) {
                    throw "Missing required frontmatter in $relativePath"
                }
            } elseif ($relativePath -like "*.instructions.md") {
                $content = Get-Content -Raw -LiteralPath $fullPath
                if (-not ($content -match '(?s)^---\r?\n.*?\bapplyTo:\s*.+?\r?\n---')) {
                    throw "Missing applyTo frontmatter in $relativePath"
                }
            } elseif ($relativePath -like "*.ps1") {
                [void][scriptblock]::Create((Get-Content -Raw -LiteralPath $fullPath))
            }
        }
    }))
}

if ($classification.tauri) {
    [void]$steps.Add((Invoke-Step -Name "tauri-tests" -WorkingDirectory (Join-Path $root "apps\src-tauri") -Action { cargo test }))
}

if ($classification.core -or $classification.service) {
    [void]$steps.Add((Invoke-Step -Name "rust-build" -WorkingDirectory $root -Action { cargo build -p codexmanager-core -p codexmanager-service }))
}

if ($classification.service) {
    [void]$steps.Add((Invoke-Step -Name "service-tests" -WorkingDirectory $root -Action { cargo test -p codexmanager-service --quiet }))
    [void]$steps.Add((Invoke-Step -Name "service-binary-build" -WorkingDirectory $root -Action { cargo build -p codexmanager-start -p codexmanager-web }))
} elseif ($classification.start -or $classification.web) {
    [void]$steps.Add((Invoke-Step -Name "service-binary-build" -WorkingDirectory $root -Action { cargo build -p codexmanager-start -p codexmanager-web }))
}

if ($classification.gateway) {
    [void]$steps.Add((Invoke-Step -Name "gateway-regression" -WorkingDirectory $root -Action { pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/tests/gateway_regression_suite.ps1 }))
}

if ($steps.Count -eq 0) {
    [void]$steps.Add([pscustomobject]@{
        name = "no-op"
        status = "pass"
        command = "n/a"
        workingDirectory = $root
        startedAt = (Get-Date).ToString("o")
        finishedAt = (Get-Date).ToString("o")
        note = "No runtime validation was required for this change set."
    })
}

$failedSteps = @($steps | Where-Object { $_.status -eq "fail" })
$overallStatus = if ($failedSteps.Count -gt 0) { "fail" } else { "pass" }

$summary = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    sessionId = $session.sessionId
    sessionStartedAt = $session.sessionStartedAt
    dirtyAt = $session.dirtyAt
    sessionStatePath = ".github/review-state/session-state.json"
    classification = $classification
    changedFiles = @($classification.changedFiles)
    overallStatus = $overallStatus
    steps = @($steps)
}

$verifyPath = Join-Path $stateDir "verify-summary.json"
$summary | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -Path $verifyPath

$summary | ConvertTo-Json -Depth 12

if ($overallStatus -eq "fail") {
    exit 1
}
