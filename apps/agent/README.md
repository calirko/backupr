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
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; iex (irm "https://raw.githubusercontent.com/calirko/backupr/refs/heads/main/apps/agent/scripts/install.ps1")
```

The TLS 1.2 line ensures compatibility with older Windows Server editions that default to TLS 1.0.
