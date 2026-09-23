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

# Build the service binary for Windows 7 / Server 2008 R2.
# Since Rust 1.78 the *-pc-windows-gnu targets require Windows 10 (std imports
# ProcessPrng, WaitOnAddress, ...), so old Windows needs the tier-3 *-win7-*
# targets. Rust ships no prebuilt std for them, so std is compiled here with
# -Zbuild-std; RUSTC_BOOTSTRAP=1 allows that on the stable toolchain instead of
# pulling in nightly. $2 is the mingw prefix: winresource and cc don't know the
# win7 target names, so they need it spelled out via CROSS_COMPILE.
build_agent_win7() {
    local target="$1"
    local mingw_arch="$2"
    local out_name="$3"
    echo "Building agent ($target)..."
    # windows_*_gnu 0.48 (via reqwest -> winreg -> windows-sys 0.48) only adds its
    # import-lib search path for the exact *-pc-windows-gnu target name, so pass
    # the lib dirs of every windows_*_gnu crate for this arch explicitly.
    local crate="windows_${mingw_arch}_gnu"
    local flags=""
    local dir
    for dir in $(cargo metadata --format-version 1 --filter-platform "${mingw_arch}-pc-windows-gnu" \
        | jq -r --arg c "$crate" '.packages[] | select(.name == $c) | .manifest_path'); do
        flags+="-L native=$(dirname "$dir")/lib "
    done
    CROSS_COMPILE="${mingw_arch}-w64-mingw32-" RUSTC_BOOTSTRAP=1 RUSTFLAGS="$flags" \
        cargo build --release --bin agent --target "$target" -Zbuild-std=std,panic_abort
    cp "target/$target/release/agent.exe" "$OUT/$out_name"
    echo "  -> out/$out_name"
    sign_exe "$OUT/$out_name"
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

build_agent_win7 x86_64-win7-windows-gnu x86_64 backupr-agent-x86_64-win7-windows.exe
build_agent_win7 i686-win7-windows-gnu   i686   backupr-agent-i686-win7-windows.exe

build_tray  x86_64-pc-windows-gnu    backupr-tray-x86_64-windows.exe
build_tray  i686-pc-windows-gnu      backupr-tray-i686-windows.exe

echo "Done. Binaries in out/"
