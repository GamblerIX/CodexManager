#!/usr/bin/env bash
set -euo pipefail

BUNDLES="dmg"
NO_BUNDLE=false
CLEAN_DIST=false
DRY_RUN=false
TARGET=""
TAURI_CLI_VERSION="2.10.1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundles)
      BUNDLES="${2:-}"
      shift 2
      ;;
    --no-bundle)
      NO_BUNDLE=true
      shift
      ;;
    --clean-dist)
      CLEAN_DIST=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --target)
      TARGET="${2:-}"
      if [[ -z "$TARGET" ]]; then
        echo "--target requires a value" >&2
        exit 2
      fi
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APPS_ROOT="$ROOT/apps"
FRONTEND_ROOT="$APPS_ROOT"
TAURI_DIR="$APPS_ROOT/src-tauri"
ROOT_TARGET="$ROOT/target"
TAURI_TARGET="$TAURI_DIR/target"
DIST_DIR="$FRONTEND_ROOT/out"

step() { echo "$*"; }

remove_dir() {
  local path="$1"
  if [[ ! -e "$path" ]]; then
    step "skip: $path not found"
    return
  fi
  if [[ "$DRY_RUN" == "true" ]]; then
    step "DRY RUN: remove $path"
    return
  fi
  rm -rf "$path"
}

run_cmd() {
  local display="$1"
  shift
  if [[ "$DRY_RUN" == "true" ]]; then
    step "DRY RUN: $display"
    return
  fi
  "$@"
}

run_tauri_build() {
  local display
  local -a args=(dlx "@tauri-apps/cli@${TAURI_CLI_VERSION}" build)

  if [[ "$NO_BUNDLE" == "true" ]]; then
    args+=(--no-bundle)
  else
    args+=(--bundles "$BUNDLES")
  fi

  if [[ -n "$TARGET" ]]; then
    args+=(--target "$TARGET")
  fi

  display="pnpm ${args[*]}"
  if [[ "$DRY_RUN" == "true" ]]; then
    step "DRY RUN: $display"
    return
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm not found in PATH" >&2
    exit 1
  fi

  pnpm "${args[@]}"
}

command -v cargo >/dev/null 2>&1 || { echo "cargo not found in PATH" >&2; exit 1; }

remove_dir "$ROOT_TARGET"
remove_dir "$TAURI_TARGET"
if [[ "$CLEAN_DIST" == "true" ]]; then
  remove_dir "$DIST_DIR"
fi

# 构建前端静态产物（beforeBuildCommand 使用 Windows CMD 语法，在 macOS 上无法执行）
step "building frontend..."
run_cmd "pnpm build:desktop" pnpm --dir "$FRONTEND_ROOT" run build:desktop

# 临时移除 Windows 专用的 beforeBuildCommand，构建后恢复
TAURI_CONF="$TAURI_DIR/tauri.conf.json"
cp "$TAURI_CONF" "$TAURI_CONF.bak"
python3 -c "
import json, pathlib
p = pathlib.Path('$TAURI_CONF')
c = json.loads(p.read_text(encoding='utf-8'))
c.get('build', {}).pop('beforeBuildCommand', None)
p.write_text(json.dumps(c, indent=2, ensure_ascii=False), encoding='utf-8')
"

trap 'mv -f "$TAURI_CONF.bak" "$TAURI_CONF" 2>/dev/null' EXIT

pushd "$TAURI_DIR" >/dev/null
run_tauri_build
popd >/dev/null

# 恢复原始 tauri.conf.json
mv -f "$TAURI_CONF.bak" "$TAURI_CONF"
trap - EXIT

step "done"
