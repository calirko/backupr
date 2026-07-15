#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
OUT="$ROOT/out"
CARGO_TOML="$ROOT/Cargo.toml"

# Pass --no-build to reuse whatever is already in out/ (the version guard below
# still runs, so stale binaries are caught either way).
BUILD=1
for arg in "$@"; do
    case "$arg" in
        --no-build) BUILD=0 ;;
        *) echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

VERSION=$(grep '^version' "$CARGO_TOML" | head -1 | sed 's/.*"\(.*\)"/\1/')
TAG="v$VERSION"
TITLE="Backupr v$VERSION"

FILES=(
    "$OUT/backupr-agent-x86_64-windows.exe"
    "$OUT/backupr-agent-i686-windows.exe"
    "$OUT/backupr-agent-x86_64-linux"
    "$OUT/backupr-tray-x86_64-windows.exe"
    "$OUT/backupr-tray-i686-windows.exe"
)

echo "Version : $VERSION"
echo "Tag     : $TAG"
echo "Title   : $TITLE"
echo ""

# ── Build ─────────────────────────────────────────────────────────────────────
# Always rebuild by default so the binaries can never lag behind Cargo.toml —
# that mismatch is exactly what causes agents to update in an endless loop.
if [[ "$BUILD" -eq 1 ]]; then
    echo "Building binaries for v$VERSION..."
    rm -rf "$OUT"
    bash "$SCRIPT_DIR/build-all.sh"
    echo ""
else
    echo "Skipping build (--no-build); reusing existing out/ binaries."
    echo ""
fi

for f in "${FILES[@]}"; do
    if [[ ! -f "$f" ]]; then
        echo "Missing: $f"
        echo "Run scripts/build-all.sh first (or drop --no-build)."
        exit 1
    fi
done

# ── Verify + summarize ────────────────────────────────────────────────────────
# Both the agent and tray binaries embed CARGO_PKG_VERSION at compile time, so a
# file that doesn't contain the current $VERSION string was built for a different
# version and must not be shipped under this tag — that mismatch is what causes
# agents to update in an endless loop (the running binary self-reports the old
# version).
echo "Binaries to publish under $TAG:"
printf "  %-34s %8s   %s\n" "FILE" "SIZE" "EMBEDS v$VERSION"
mismatch=0
for f in "${FILES[@]}"; do
    size=$(du -h "$f" | cut -f1)
    # grep -c reads all input (unlike grep -q, which closes the pipe on the
    # first match and would SIGPIPE `strings` — fatal under `pipefail`).
    matches=$(strings -n 5 "$f" | grep -cF "$VERSION" || true)
    if [[ "${matches:-0}" -gt 0 ]]; then
        mark="yes"
    else
        mark="NO  <-- stale!"
        mismatch=1
    fi
    printf "  %-34s %8s   %s\n" "$(basename "$f")" "$size" "$mark"
done
echo ""

if [[ "$mismatch" -eq 1 ]]; then
    echo "One or more binaries do not embed v$VERSION — they are stale."
    echo "Re-run without --no-build (or run scripts/build-all.sh) and retry."
    exit 1
fi

if gh release view "$TAG" &>/dev/null; then
    echo "Release $TAG already exists. Delete it first or bump the version."
    exit 1
fi

# ── Sign ──────────────────────────────────────────────────────────────────────
# The agent refuses to apply a self-update whose binary doesn't carry a valid
# signature over the embedded public key (see UPDATE_PUBLIC_KEY_HEX in
# src/update.rs) — so every binary asset needs a matching "<file>.sig" asset,
# or installed agents will treat the release as unusable and skip it.
SIGNING_KEY="${BACKUPR_SIGNING_KEY:-$HOME/.backupr-signing-key.pem}"
if [[ ! -f "$SIGNING_KEY" ]]; then
    echo "No signing key at $SIGNING_KEY."
    echo "Run scripts/keygen.sh once to create one (and embed the printed"
    echo "public key in src/update.rs), or set \$BACKUPR_SIGNING_KEY."
    exit 1
fi

echo "Signing binaries with $SIGNING_KEY..."
SIG_FILES=()
for f in "${FILES[@]}"; do
    sig="$f.sig"
    openssl pkeyutl -sign -inkey "$SIGNING_KEY" -rawin -in "$f" -out "$sig"
    SIG_FILES+=("$sig")
done
echo ""

# ── Confirm ───────────────────────────────────────────────────────────────────
read -r -p "Publish release $TAG with the binaries above (signed)? [y/N] " reply
case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 1 ;;
esac
echo ""

echo "Creating release $TAG..."
gh release create "$TAG" \
    --title "$TITLE" \
    --notes "Backupr $TAG" \
    "${FILES[@]}" "${SIG_FILES[@]}"

echo ""
echo "Released: $TAG"
