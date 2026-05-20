#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
OUT="$ROOT/out"
CARGO_TOML="$ROOT/Cargo.toml"

VERSION=$(grep '^version' "$CARGO_TOML" | head -1 | sed 's/.*"\(.*\)"/\1/')
TAG="v$VERSION"
TITLE="Backupr Agent v$VERSION"

FILES=(
    "$OUT/backupr-agent-x86_64-windows.exe"
    "$OUT/backupr-agent-i686-windows.exe"
    "$OUT/backupr-agent-x86_64-linux"
)

echo "Version : $VERSION"
echo "Tag     : $TAG"
echo "Title   : $TITLE"
echo ""

for f in "${FILES[@]}"; do
    if [[ ! -f "$f" ]]; then
        echo "Missing: $f"
        echo "Run scripts/build-all.sh first."
        exit 1
    fi
    echo "Found: $(basename "$f")"
done
echo ""

if gh release view "$TAG" &>/dev/null; then
    echo "Release $TAG already exists. Delete it first or bump the version."
    exit 1
fi

echo "Creating release $TAG..."
gh release create "$TAG" \
    --title "$TITLE" \
    --notes "Backupr Agent $TAG" \
    "${FILES[@]}"

echo ""
echo "Released: $TAG"
