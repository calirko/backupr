![backupr](../../banner.png)

# agent

CLI daemon that runs on client machines. Connects to the backupr server over WebSocket, executes backup jobs on demand, and uploads archives to S3.

## Setup

Run once to pair with the server using a code generated from the dashboard:

```bash
# Linux
./backupr-agent setup <pairing-code>

# Windows
backupr-agent.exe setup <pairing-code>
```

After setup the agent starts automatically and reconnects on restart.

## Dev

```bash
bun install
bun run dev           # run with hot reload
bun run setup         # interactive setup mode
```

## Build binaries

```bash
bun run build:linux    # linux-x64
bun run build:windows  # windows-x64
```

## Install (Windows, one-liner)

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
iex (irm "https://raw.githubusercontent.com/calirko/backupr/refs/heads/main/apps/agent/scripts/install.ps1")
```

### Troubleshooting: TLS/SSL Error on older Windows Servers

If you get `"A solicitação foi anulada: Não foi possível criar um canal seguro para SSL/TLS"` (or similar SSL/TLS error), use the helper script instead:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
iex (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/calirko/backupr/refs/heads/main/apps/agent/scripts/install-helper.ps1')
```

This helper configures TLS 1.2+ support before downloading the main installer, which works on older Windows Server editions.
