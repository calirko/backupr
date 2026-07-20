#!/usr/bin/env bash
set -euo pipefail

# Bumps the version in Cargo.toml and build.rs (which hardcodes
# ProductVersion/FileVersion since winresource needs plain string literals).
# Usage:
#   scripts/bump-version.sh 2.1.7        # set an explicit version
#   scripts/bump-version.sh major|minor|patch   # bump the current version

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
CARGO_TOML="$ROOT/Cargo.toml"
BUILD_RS="$ROOT/build.rs"

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <new-version|major|minor|patch>" >&2
    exit 1
fi

CURRENT=$(grep '^version' "$CARGO_TOML" | head -1 | sed 's/.*"\(.*\)"/\1/')
IFS='.' read -r CUR_MAJOR CUR_MINOR CUR_PATCH <<< "$CURRENT"

case "$1" in
    major) NEW_VERSION="$((CUR_MAJOR + 1)).0.0" ;;
    minor) NEW_VERSION="$CUR_MAJOR.$((CUR_MINOR + 1)).0" ;;
    patch) NEW_VERSION="$CUR_MAJOR.$CUR_MINOR.$((CUR_PATCH + 1))" ;;
    *)
        if [[ ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "Invalid version '$1' (expected x.y.z, or major|minor|patch)" >&2
            exit 1
        fi
        NEW_VERSION="$1"
        ;;
esac

if [[ "$NEW_VERSION" == "$CURRENT" ]]; then
    echo "Version is already $CURRENT, nothing to do."
    exit 0
fi

sed -i "0,/^version = \"$CURRENT\"/s//version = \"$NEW_VERSION\"/" "$CARGO_TOML"
sed -i "s/\"$CURRENT\"/\"$NEW_VERSION\"/g" "$BUILD_RS"

echo "Bumped version: $CURRENT -> $NEW_VERSION"
echo "  $CARGO_TOML"
echo "  $BUILD_RS"
