#!/usr/bin/env bash
set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/out"
mkdir -p "$OUT"

build() {
    local target="$1"
    local out_name="$2"
    echo "Building $target..."
    cargo build --release --target "$target"
    cp "target/$target/release/agent${3:-}" "$OUT/$out_name"
    echo "  -> out/$out_name"
}

build x86_64-pc-windows-gnu  backupr-agent-x86_64-windows.exe .exe
build i686-pc-windows-gnu     backupr-agent-i686-windows.exe   .exe
build x86_64-unknown-linux-gnu backupr-agent-x86_64-linux      ""

echo "Done. Binaries in out/"
