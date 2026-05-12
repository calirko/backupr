## Installing

### Windows

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; iex (irm "https://raw.githubusercontent.com/calirko/backupr/refs/heads/main/apps/agent-rust/scripts/setup.ps1")
```

## Building

### Windows

rustup target add x86_64-pc-windows-gnu
cargo build --release --target x86_64-pc-windows-gnu

rustup target add i686-pc-windows-gnu
cargo build --release --target i686-pc-windows-gnu

### Linux

rustup target add x86_64-unknown-linux-gnu
cargo build --release --target x86_64-unknown-linux-gnu
