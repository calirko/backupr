## Installing

### Windows

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; iex (irm "https://raw.githubusercontent.com/calirko/backupr/refs/heads/main/apps/agent-rust/scripts/setup.ps1?$(Get-Random)")
```

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
