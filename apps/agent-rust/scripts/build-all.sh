#!/usr/bin/env bash
set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/out"
mkdir -p "$OUT"

# Build the service binary (Backupr Service).
# No extra features — build.rs embeds icon-service.ico.
build_agent() {
    local target="$1"
    local out_name="$2"
    local ext="${3:-}"
    echo "Building agent ($target)..."
    cargo build --release --bin agent --target "$target"
    cp "target/$target/release/agent${ext}" "$OUT/$out_name"
    echo "  -> out/$out_name"
}

# Build the tray binary (Backupr Agent, Windows only).
# Requires --features tray so build.rs embeds icon-agent.ico.
# Must be a separate cargo invocation from build_agent so build.rs sees
# the correct CARGO_FEATURE_TRAY value for each binary.
build_tray() {
    local target="$1"
    local out_name="$2"
    echo "Building tray ($target)..."
    cargo build --release --bin tray --features tray --target "$target"
    cp "target/$target/release/tray.exe" "$OUT/$out_name"
    echo "  -> out/$out_name"
}

build_agent x86_64-pc-windows-gnu    backupr-agent-x86_64-windows.exe .exe
build_agent i686-pc-windows-gnu      backupr-agent-i686-windows.exe   .exe
build_agent x86_64-unknown-linux-gnu backupr-agent-x86_64-linux       ""

build_tray  x86_64-pc-windows-gnu    backupr-tray-x86_64-windows.exe
build_tray  i686-pc-windows-gnu      backupr-tray-i686-windows.exe

echo "Done. Binaries in out/"
