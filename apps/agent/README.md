## Installing

### Windows

Paste this into PowerShell (as Administrator). It works on everything from PowerShell 2.0 /
Windows 7 up — it never calls `Invoke-WebRequest`/`Invoke-RestMethod` (PS3+ only) or references
a TLS enum member (missing on pre-.NET-4.5), and it auto-selects the right installer for your
PowerShell version:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned; try { [Net.ServicePointManager]::SecurityProtocol = 3072 } catch { try { [Net.ServicePointManager]::SecurityProtocol = 3840 } catch {} }; $base = "https://cdn.jsdelivr.net/gh/calirko/backupr@main/apps/agent/scripts"; $wc = New-Object Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8; $script = if ($PSVersionTable -and $PSVersionTable.PSVersion.Major -ge 5) { "$base/setup.ps1" } else { "$base/setup-fallback.ps1" }; iex $wc.DownloadString($script)
```

The whole thing is one line (statements joined with `;`) on purpose: pasting a multi-line
snippet into `powershell.exe`'s legacy console host — especially over RDP — can execute the
lines out of order or interleaved, since paste is simulated as keystrokes rather than delivered
atomically. That leaves `$wc` still `$null` when `$wc.DownloadString(...)` runs, producing
"Não é possível chamar um método em uma expressão de valor nula" / "Cannot call a method on a
null-valued expression." Keeping it a single statement makes the paste order irrelevant.

Why not `raw.githubusercontent.com`? It only accepts TLS 1.2+, so on old Windows the *initial*
fetch fails before any TLS-fixing code inside the downloaded script gets a chance to run — the
one-liner needs to negotiate TLS itself first. We fetch from jsDelivr's CDN
(`cdn.jsdelivr.net/gh/...`) instead: it mirrors this repo automatically on every push and its
edge (Cloudflare/Fastly) accepts a much wider TLS/cipher range, so the handshake succeeds even
on Windows 7 with an unpatched .NET stack. `System.Net.WebClient` is used instead of
`Invoke-WebRequest`/`irm` because those cmdlets don't exist before PowerShell 3.0, and setting
`SecurityProtocol` via the integer literals `3072`/`3840` (Tls12 / Tls12|Tls11) avoids referencing
enum members that don't exist on older .NET — same trick used inside `setup-fallback.ps1`.
`$wc.Encoding` is forced to UTF-8 because `WebClient` otherwise assumes the legacy ANSI code page,
which mangles the em dashes and box-drawing characters in the scripts and breaks parsing.

The script picks `setup.ps1` (PowerShell 5.1+) or `setup-fallback.ps1` (PowerShell 2.0–4.x,
typically Windows 7) automatically based on `$PSVersionTable`.

> jsDelivr caches files for a while after a push. If you've just pushed a fix to a script under
> `apps/agent/scripts/` and need it live immediately, purge it with:
> `curl https://purge.jsdelivr.net/gh/calirko/backupr@main/apps/agent/scripts/setup.ps1` (and
> again for `setup-fallback.ps1`).

## Building

There are two binaries. Build them separately so `build.rs` can embed the correct icon in each exe.

### Windows targets (cross-compile from Linux or build natively)

```bash
# One-time: add cross-compilation targets
rustup target add x86_64-pc-windows-gnu
rustup target add i686-pc-windows-gnu

# Backupr Service — the headless Windows service (icon-service.ico embedded)
cargo build --release --bin agent --target x86_64-pc-windows-gnu
cargo build --release --bin agent --target i686-pc-windows-gnu

# Backupr Agent — the per-user tray app (icon-agent.ico embedded, requires --features tray)
cargo build --release --bin tray --features tray --target x86_64-pc-windows-gnu
cargo build --release --bin tray --features tray --target i686-pc-windows-gnu
```

### Linux target

```bash
rustup target add x86_64-unknown-linux-gnu
cargo build --release --bin agent --target x86_64-unknown-linux-gnu
```
