#!/usr/bin/env bash
# One-time setup: generates the Ed25519 keypair used to sign release binaries.
#
# The private key never goes in the repo — it stays on this machine (or
# wherever you run releases from) and release.sh reads it via
# $BACKUPR_SIGNING_KEY (defaulting to ~/.backupr-signing-key.pem).
#
# The public key IS meant to be public: paste the hex it prints into
# UPDATE_PUBLIC_KEY_HEX in src/update.rs and commit that.
set -euo pipefail

OUT="${1:-$HOME/.backupr-signing-key.pem}"

if [[ -f "$OUT" ]]; then
    echo "A key already exists at $OUT — refusing to overwrite."
    echo "(Rotating keys means old installed agents can no longer verify updates"
    echo "signed with the new key until you ship a build with the new embedded"
    echo "public key, so do this deliberately, not by accident.)"
    exit 1
fi

openssl genpkey -algorithm ed25519 -out "$OUT"
chmod 600 "$OUT"

echo "Private key written to: $OUT"
echo "  -> back this up somewhere safe (password manager, offline copy). If you"
echo "     lose it, you lose the ability to ship verifiable updates under the"
echo "     current embedded public key."
echo ""
echo "Public key (paste into UPDATE_PUBLIC_KEY_HEX in src/update.rs):"
openssl pkey -in "$OUT" -pubout | openssl pkey -pubin -outform DER | tail -c 32 | od -An -tx1 | tr -d ' \n'
echo
