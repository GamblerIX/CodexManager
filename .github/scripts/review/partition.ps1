$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
}

$root = Get-RepoRoot
$stateDir = Join-Path $root ".github\review-state"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$shards = @(
    [ordered]@{
        name = "frontend"
        paths = @(
            "apps/src",
            "apps/public",
            "apps/package.json",
            "apps/pnpm-lock.yaml",
            "apps/pnpm-workspace.yaml",
            "apps/components.json",
            "apps/next.config.ts",
            "apps/postcss.config.mjs",
            "apps/tsconfig.json",
            "apps/eslint.config.mjs"
        )
    }
    [ordered]@{
        name = "tauri"
        paths = @("apps/src-tauri", "apps/src/lib/api", "apps/src/lib/runtime")
    }
    [ordered]@{
        name = "core"
        paths = @("crates/core")
    }
    [ordered]@{
        name = "service"
        paths = @("crates/service", "crates/start", "crates/web")
    }
    [ordered]@{
        name = "meta"
        paths = @(
            ".github",
            "docs",
            "scripts",
            "AGENTS.md",
            "apps/AGENTS.md",
            "Cargo.toml",
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
            ".gitignore"
        )
    }
)

$partitionPath = Join-Path $stateDir "review-partition.json"
$shards | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $partitionPath

$shards | ConvertTo-Json -Depth 8
