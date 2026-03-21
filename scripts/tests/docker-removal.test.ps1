$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$removedPaths = @(
  ".dockerignore",
  "docker",
  "docker/docker-compose.yml",
  "docker/Dockerfile.service",
  "docker/Dockerfile.web"
)

foreach ($relativePath in $removedPaths) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (Test-Path $fullPath) {
    throw "expected removed path to be absent: $relativePath"
  }
}

$unexpectedContentChecks = @(
  @{
    Path = "README.md"
    Patterns = @(
      "## 首页导览",
      "## 功能概览",
      "## 专题页面"
    )
  },
  @{
    Path = "README.en.md"
    Patterns = @(
      "## Landing Guide",
      "## Features",
      "## Topic Pages"
    )
  },
  @{
    Path = "ARCHITECTURE.md"
    Patterns = @(
      "## 1. 总体形态",
      "## 2. 目录结构与职责"
    )
  },
  @{
    Path = "CONTRIBUTING.md"
    Patterns = @(
      "## 1. 项目定位",
      "## 3. 提交边界"
    )
  },
  @{
    Path = "TESTING.md"
    Patterns = @(
      "## 1. 基础环境",
      "## 5. 协议适配 / 网关改动"
    )
  },
  @{
    Path = "SECURITY.md"
    Patterns = @(
      "## 支持范围",
      "## 仓库内安全约束"
    )
  },
  @{
    Path = "CHANGELOG.md"
    Patterns = @(
      "## [Unreleased]",
      "## [0.1.12]"
    )
  }
)

foreach ($check in @(
  @{ Path = "README.md"; Patterns = @("docs/root/README.md", "docs/README.md") },
  @{ Path = "README.en.md"; Patterns = @("docs/root/README.en.md", "docs/README.md") },
  @{ Path = "ARCHITECTURE.md"; Patterns = @("docs/root/ARCHITECTURE.md") },
  @{ Path = "CONTRIBUTING.md"; Patterns = @("docs/root/CONTRIBUTING.md") },
  @{ Path = "TESTING.md"; Patterns = @("docs/root/TESTING.md") },
  @{ Path = "SECURITY.md"; Patterns = @("docs/root/SECURITY.md") },
  @{ Path = "CHANGELOG.md"; Patterns = @("docs/root/CHANGELOG.md") },
  @{ Path = "docs/root/README.md"; Patterns = @("../../assets/logo/logo.png", "../report/20260310122606850_运行与部署指南.md", "../release/20260310122606851_构建发布与脚本说明.md") },
  @{ Path = "docs/root/README.en.md"; Patterns = @("../../assets/logo/logo.png", "../report/20260310122606850_运行与部署指南.md", "../release/20260310122606851_构建发布与脚本说明.md") },
  @{ Path = "docs/README.md"; Patterns = @("docs/root/README.md", "docs/root/CHANGELOG.md") }
)) {
  $fullPath = Join-Path $repoRoot $check.Path
  if (-not (Test-Path $fullPath -PathType Leaf)) {
    throw "expected file to exist: $($check.Path)"
  }

  $content = Get-Content $fullPath -Raw
  foreach ($pattern in $check.Patterns) {
    if ($content -notlike "*$pattern*") {
      throw "expected '$pattern' to be present in $($check.Path)"
    }
  }
}

foreach ($check in $unexpectedContentChecks) {
  $fullPath = Join-Path $repoRoot $check.Path
  if (-not (Test-Path $fullPath -PathType Leaf)) {
    throw "expected file to exist: $($check.Path)"
  }

  $content = Get-Content $fullPath -Raw
  foreach ($pattern in $check.Patterns) {
    if ($content -like "*$pattern*") {
      throw "unexpected Docker-related content '$pattern' found in $($check.Path)"
    }
  }
}

Write-Host "root docs are stubbed and substantive docs live under docs/root"
