#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"
mkdir -p "$OUT"

# --- Self-signed Authenticode signing (better than shipping unsigned exes) ---
# Not trusted by Windows out of the box, but it lets us keep a stable
# publisher identity across releases and gives users something to inspect.
CODESIGN_DIR="$ROOT/codesign"
CODESIGN_CERT="$CODESIGN_DIR/selfsigned.crt"
CODESIGN_KEY="$CODESIGN_DIR/selfsigned.key"

ensure_codesign_cert() {
    if [[ -f "$CODESIGN_CERT" && -f "$CODESIGN_KEY" ]]; then
        return
    fi
    echo "Generating self-signed code-signing certificate..."
    mkdir -p "$CODESIGN_DIR"
    openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
        -keyout "$CODESIGN_KEY" -out "$CODESIGN_CERT" \
        -subj "/CN=Backupr/O=Backupr" \
        -addext "extendedKeyUsage=codeSigning" \
        -addext "basicConstraints=critical,CA:FALSE" \
        -addext "keyUsage=critical,digitalSignature"
}

# Signs $1 in place using osslsigncode, if it's installed. Warns and leaves
# the binary unsigned otherwise, so the build never fails just because the
# signing tool is missing.
sign_exe() {
    local exe="$1"
    if ! command -v osslsigncode >/dev/null 2>&1; then
        echo "  ! osslsigncode not found, leaving $exe unsigned" >&2
        return
    fi
    ensure_codesign_cert
    local signed="${exe}.signed"
    osslsigncode sign \
        -certs "$CODESIGN_CERT" -key "$CODESIGN_KEY" \
        -n "Backupr" \
        -in "$exe" -out "$signed" >/dev/null
    mv "$signed" "$exe"
    echo "  -> signed (self-signed cert)"
}

# Build the service binary (Backupr Service).
# No extra features - build.rs embeds icon-service.ico.
build_agent() {
    local target="$1"
    local out_name="$2"
    local ext="${3:-}"
    echo "Building agent ($target)..."
    cargo build --release --bin agent --target "$target"
    cp "target/$target/release/agent${ext}" "$OUT/$out_name"
    echo "  -> out/$out_name"
    if [[ "$out_name" == *.exe ]]; then
        sign_exe "$OUT/$out_name"
    fi
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
    sign_exe "$OUT/$out_name"
}

build_agent x86_64-pc-windows-gnu    backupr-agent-x86_64-windows.exe .exe
build_agent i686-pc-windows-gnu      backupr-agent-i686-windows.exe   .exe
build_agent x86_64-unknown-linux-gnu backupr-agent-x86_64-linux       ""

build_tray  x86_64-pc-windows-gnu    backupr-tray-x86_64-windows.exe
build_tray  i686-pc-windows-gnu      backupr-tray-i686-windows.exe

echo "Done. Binaries in out/"
