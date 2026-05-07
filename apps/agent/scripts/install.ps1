#Requires -Version 5.1
<#
.SYNOPSIS
    Backupr Agent installer / service manager

.DESCRIPTION
    Downloads the latest backupr-agent.exe from GitHub Releases and manages it
    as a Windows service via NSSM.
    The service runs as LocalSystem (no interactive login required) and starts automatically.

.PARAMETER Action
    Action to perform: install | setup | start | stop | restart | remove | status
    If omitted, an interactive menu is shown.

.EXAMPLE
    # Interactive
    .\install.ps1

    # One-shot
    .\install.ps1 -Action install
#>

param(
    [ValidateSet("install", "setup", "start", "stop", "restart", "remove", "status", "")]
    [string]$Action = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- Constants ----------------------------------------------------------------

$AgentUrl    = "https://github.com/calirko/backupr/releases/latest/download/backupr-agent.exe"
$ServiceName = "backupr-agent"
$InstallDir  = "C:\ProgramData\backupr"
$AgentExe    = Join-Path $InstallDir "backupr-agent.exe"
$ConfigFile  = Join-Path $InstallDir "backupr.conf"
$NssmDir     = Join-Path $InstallDir "nssm"
$NssmExe     = Join-Path $NssmDir "nssm.exe"
$NssmUrl     = "https://nssm.cc/release/nssm-2.24.zip"

# --- Helpers ------------------------------------------------------------------

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ("  " + "-" * $Text.Length) -ForegroundColor DarkCyan
}

function Confirm-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Warning "This script requires Administrator privileges."
        Write-Host "Relaunching as Administrator..." -ForegroundColor Yellow
        $args_ = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
        if ($Action) { $args_ += " -Action `"$Action`"" }
        Start-Process powershell -Verb RunAs -ArgumentList $args_
        exit
    }
}

function Ensure-NssmPresent {
    if (Test-Path $NssmExe) { return }

    Write-Host "  Downloading NSSM..." -ForegroundColor Yellow
    $zipPath = Join-Path $env:TEMP "nssm.zip"
    $null = New-Item -ItemType Directory -Force -Path $NssmDir

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $NssmUrl -OutFile $zipPath -UseBasicParsing

    $extractDir = Join-Path $env:TEMP "nssm_extract"
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    $found = Get-ChildItem -Path $extractDir -Filter "nssm.exe" -Recurse |
             Where-Object { $_.FullName -match "win64" } |
             Select-Object -First 1

    if (-not $found) {
        $found = Get-ChildItem -Path $extractDir -Filter "nssm.exe" -Recurse |
                 Select-Object -First 1
    }

    if (-not $found) {
        throw "Could not locate nssm.exe inside the downloaded archive."
    }

    Copy-Item $found.FullName -Destination $NssmExe -Force
    Remove-Item $zipPath, $extractDir -Recurse -Force
    Write-Host "  NSSM installed at $NssmExe" -ForegroundColor Green
}

function Ensure-AgentPresent {
    $null = New-Item -ItemType Directory -Force -Path $InstallDir
    Write-Host "  Downloading backupr-agent.exe..." -ForegroundColor Yellow
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $AgentUrl -OutFile $AgentExe -UseBasicParsing
    Write-Host "  Agent binary saved to $AgentExe" -ForegroundColor Green
}

function Get-ServiceExists {
    return [bool](Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)
}

# --- Actions ------------------------------------------------------------------

function Action-Install {
    Write-Header "Installing Backupr Agent service"

    if (Get-ServiceExists) {
        Write-Warning "Service '$ServiceName' already exists. Run 'remove' first to reinstall."
        return
    }

    Ensure-NssmPresent
    Ensure-AgentPresent

    & $NssmExe install $ServiceName $AgentExe
    if ($LASTEXITCODE -ne 0) { throw "NSSM install failed (exit $LASTEXITCODE)" }

    & $NssmExe set $ServiceName AppDirectory $InstallDir
    & $NssmExe set $ServiceName ObjectName LocalSystem
    & $NssmExe set $ServiceName Start SERVICE_AUTO_START
    & $NssmExe set $ServiceName AppRestartDelay 5000
    & $NssmExe set $ServiceName AppThrottle 3600000

    $logFile = Join-Path $InstallDir "backupr-agent.log"
    $errFile = Join-Path $InstallDir "backupr-agent-err.log"
    & $NssmExe set $ServiceName AppStdout $logFile
    & $NssmExe set $ServiceName AppStderr $errFile
    & $NssmExe set $ServiceName AppStdoutCreationDisposition 4
    & $NssmExe set $ServiceName AppStderrCreationDisposition 4

    Write-Host ""
    Write-Host "  Service installed successfully." -ForegroundColor Green
    Write-Host "  Run 'setup' next to configure your agent code, then 'start'." -ForegroundColor Cyan
}

function Action-Setup {
    Write-Header "Configuring Backupr Agent"

    $null = New-Item -ItemType Directory -Force -Path $InstallDir

    Write-Host ""
    Write-Host "  Paste your agent code from the Backupr web UI and press Enter:" -ForegroundColor Yellow
    $code = Read-Host "  Agent code"
    $code = $code.Trim()

    if (-not $code) {
        Write-Warning "No code entered. Configuration unchanged."
        return
    }

    $config = @{ agentCode = $code } | ConvertTo-Json
    Set-Content -Path $ConfigFile -Value $config -Encoding UTF8

    Write-Host ""
    Write-Host "  Config saved to $ConfigFile" -ForegroundColor Green
    Write-Host "  Start (or restart) the service to apply: .\install.ps1 -Action start" -ForegroundColor Cyan
}

function Action-Start {
    Write-Header "Starting Backupr Agent service"

    if (-not (Get-ServiceExists)) {
        Write-Warning "Service not installed. Run 'install' first."
        return
    }

    & $NssmExe start $ServiceName
    Start-Sleep -Seconds 1
    $svc = Get-Service -Name $ServiceName
    $color = if ($svc.Status -eq "Running") { "Green" } else { "Yellow" }
    Write-Host "  Service status: $($svc.Status)" -ForegroundColor $color
}

function Action-Stop {
    Write-Header "Stopping Backupr Agent service"

    if (-not (Get-ServiceExists)) {
        Write-Warning "Service is not installed."
        return
    }

    & $NssmExe stop $ServiceName
    Write-Host "  Service stopped." -ForegroundColor Yellow
}

function Action-Restart {
    Action-Stop
    Start-Sleep -Seconds 2
    Action-Start
}

function Action-Remove {
    Write-Header "Removing Backupr Agent service"

    if (-not (Get-ServiceExists)) {
        Write-Warning "Service '$ServiceName' is not installed."
        return
    }

    & $NssmExe stop $ServiceName
    & $NssmExe remove $ServiceName confirm
    Write-Host "  Service removed." -ForegroundColor Yellow
    Write-Host "  Files in $InstallDir were left in place. Delete manually if needed." -ForegroundColor DarkGray
}

function Action-Status {
    Write-Header "Backupr Agent status"

    Write-Host "  Install dir : $InstallDir"
    Write-Host "  Config file : $(if (Test-Path $ConfigFile) { $ConfigFile } else { '(not found)' })"
    Write-Host "  Agent binary: $(if (Test-Path $AgentExe) { $AgentExe } else { '(not found)' })"
    Write-Host "  NSSM        : $(if (Test-Path $NssmExe) { $NssmExe } else { '(not found)' })"

    if (Get-ServiceExists) {
        $svc = Get-Service -Name $ServiceName
        $color = switch ($svc.Status) {
            "Running" { "Green" }
            "Stopped" { "Red" }
            default   { "Yellow" }
        }
        Write-Host "  Service     : $($svc.Status)" -ForegroundColor $color
    } else {
        Write-Host "  Service     : not installed" -ForegroundColor DarkGray
    }
}

# --- Interactive menu ---------------------------------------------------------

function Show-Menu {
    while ($true) {
        Write-Host ""
        Write-Host "  +------------------------------+" -ForegroundColor Cyan
        Write-Host "  |   Backupr Agent Manager      |" -ForegroundColor Cyan
        Write-Host "  +------------------------------+" -ForegroundColor Cyan
        Write-Host "  |  1) Install service          |"
        Write-Host "  |  2) Setup agent code         |"
        Write-Host "  |  3) Start service            |"
        Write-Host "  |  4) Stop service             |"
        Write-Host "  |  5) Restart service          |"
        Write-Host "  |  6) Remove service           |"
        Write-Host "  |  7) Status                   |"
        Write-Host "  |  Q) Quit                     |"
        Write-Host "  +------------------------------+" -ForegroundColor Cyan
        Write-Host ""
        $choice = Read-Host "  Choose an option"

        switch ($choice.ToUpper()) {
            "1" { Action-Install }
            "2" { Action-Setup   }
            "3" { Action-Start   }
            "4" { Action-Stop    }
            "5" { Action-Restart }
            "6" { Action-Remove  }
            "7" { Action-Status  }
            "Q" { Write-Host "  Bye." -ForegroundColor DarkGray; return }
            default { Write-Warning "Unknown option: $choice" }
        }
    }
}

# --- Entry point --------------------------------------------------------------

Confirm-Admin

switch ($Action.ToLower()) {
    "install" { Action-Install }
    "setup"   { Action-Setup   }
    "start"   { Action-Start   }
    "stop"    { Action-Stop    }
    "restart" { Action-Restart }
    "remove"  { Action-Remove  }
    "status"  { Action-Status  }
    ""        { Show-Menu      }
}
