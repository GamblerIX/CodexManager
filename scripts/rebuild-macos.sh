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

pushd "$TAURI_DIR" >/dev/null
run_tauri_build
popd >/dev/null

step "done"
