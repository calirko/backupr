#Requires -Version 5.1
<#
.SYNOPSIS
    Backupr Agent installer / service manager

.DESCRIPTION
    Downloads the latest backupr-agent.exe from GitHub Releases and manages it
    as a Windows service via WinSW.
    The service runs as LocalSystem (no interactive login required) and starts automatically.

.PARAMETER Action
    Action to perform: install | setup | start | stop | restart | remove | status | logs | update
    If omitted, an interactive menu is shown.

.EXAMPLE
    # Interactive
    .\install.ps1

    # One-shot
    .\install.ps1 -Action install
#>

param(
    [ValidateSet("install", "setup", "start", "stop", "restart", "remove", "status", "logs", "update", "")]
    [string]$Action = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$global:LASTEXITCODE = 0

# Force TLS 1.2+ and TLS 1.3 when available
$protocols = [Net.SecurityProtocolType]::Tls12
$tls13 = [Net.SecurityProtocolType].GetField('Tls13')
if ($tls13) { $protocols = $protocols -bor $tls13.GetValue($null) }
[Net.ServicePointManager]::SecurityProtocol = $protocols

# --- Architecture detection ---------------------------------------------------

$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq "AMD64" -or
            ($env:PROCESSOR_ARCHITECTURE -eq "x86" -and [System.Environment]::Is64BitOperatingSystem)) {
    "x86_64"
} else {
    "i686"
}

# --- Constants ----------------------------------------------------------------

$AgentUrl    = "https://github.com/calirko/backupr/releases/latest/download/backupr-agent-$Arch-windows.exe"
$ServiceName = "backupr-agent"
$InstallDir  = "C:\ProgramData\backupr"
$AgentExe    = Join-Path $InstallDir "backupr-agent.exe"
$ConfigFile  = Join-Path $InstallDir "backupr.conf"
$WinSwDir    = Join-Path $InstallDir "winsw"
$WinSwExe    = Join-Path $WinSwDir "winsw.exe"
$WinSwUrl    = "https://github.com/winsw/winsw/releases/latest/download/WinSW-x64.exe"
$WinSwConfig = Join-Path $WinSwDir "winsw.xml"
$SevenZipDir = Join-Path $InstallDir "7zip"
$SevenZipExe = Join-Path $SevenZipDir "7z.exe"
$SevenZipUrl = "https://www.7-zip.org/a/7z2409-x64.exe"

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

function Ensure-WinSwPresent {
    if (Test-Path $WinSwExe) { return }

    Write-Host "  Downloading WinSW..." -ForegroundColor Yellow
    $null = New-Item -ItemType Directory -Force -Path $WinSwDir

    Invoke-WebRequest -Uri $WinSwUrl -OutFile $WinSwExe -UseBasicParsing
    Write-Host "  WinSW saved to $WinSwExe" -ForegroundColor Green
}

function Write-WinSwConfig {
    param([string]$StartMode = "Manual")
    $xml = @"
<service>
  <id>$ServiceName</id>
  <name>Backupr Agent</name>
  <description>Backupr backup agent service</description>
  <executable>$AgentExe</executable>
  <workingdirectory>$InstallDir</workingdirectory>
  <startmode>$StartMode</startmode>
  <env name="PATH" value="$SevenZipDir;%PATH%"/>
  <log mode="append">
    <logpath>$InstallDir</logpath>
  </log>
  <onfailure action="restart" delay="5000 ms"/>
  <resetfailure>3600</resetfailure>
</service>
"@
    $xml | Set-Content -Path $WinSwConfig -Encoding UTF8
}

function Ensure-AgentPresent {
    $null = New-Item -ItemType Directory -Force -Path $InstallDir
    Write-Host "  Downloading backupr-agent.exe..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $AgentUrl -OutFile $AgentExe -UseBasicParsing
    Write-Host "  Agent binary saved to $AgentExe" -ForegroundColor Green
}

function Ensure-SevenZipPresent {
    if (Test-Path $SevenZipExe) { return }

    Write-Host "  Downloading 7-Zip..." -ForegroundColor Yellow
    $null = New-Item -ItemType Directory -Force -Path $SevenZipDir

    $installer = Join-Path $env:TEMP "7z-setup.exe"
    Invoke-WebRequest -Uri $SevenZipUrl -OutFile $installer -UseBasicParsing

    $proc = Start-Process -FilePath $installer -ArgumentList "/S /D=`"$SevenZipDir`"" -Wait -PassThru
    Remove-Item $installer -Force

    if ($proc.ExitCode -ne 0) {
        throw "7-Zip installer failed (exit $($proc.ExitCode))"
    }
    if (-not (Test-Path $SevenZipExe)) {
        throw "7-Zip installer ran but 7z.exe not found at $SevenZipExe"
    }

    Write-Host "  7-Zip installed at $SevenZipDir" -ForegroundColor Green
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

    Ensure-WinSwPresent
    Ensure-AgentPresent
    Ensure-SevenZipPresent
    Write-WinSwConfig -StartMode "Manual"

    Push-Location $WinSwDir
    try {
        & $WinSwExe install
    } finally {
        Pop-Location
    }
    if ($LASTEXITCODE -ne 0) { throw "WinSW install failed (exit $LASTEXITCODE)" }

    Write-Host ""
    Write-Host "  Service installed successfully." -ForegroundColor Green
    Write-Host "  Run 'setup' next to configure your agent code, then 'start'." -ForegroundColor Cyan
}

function Action-Setup {
    Write-Header "Configuring Backupr Agent"

    if (-not (Test-Path $AgentExe)) {
        Write-Warning "Agent binary not found at $AgentExe. Run 'install' first."
        return
    }

    Write-Host ""
    Write-Host "  Paste your agent code from the Backupr web UI and press Enter:" -ForegroundColor Yellow
    $code = Read-Host "  Agent code"
    $code = $code.Trim()

    if (-not $code) {
        Write-Warning "No code entered. Configuration unchanged."
        return
    }

    Write-Host ""
    Push-Location $InstallDir
    try {
        & $AgentExe setup $code
    } finally {
        Pop-Location
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "  Setup complete. Start the service with: .\install.ps1 -Action start" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Warning "Setup failed (exit $LASTEXITCODE). Check the output above."
    }
}

function Action-Start {
    Write-Header "Starting Backupr Agent service"

    if (-not (Get-ServiceExists)) {
        Write-Warning "Service not installed. Run 'install' first."
        return
    }

    sc.exe config $ServiceName start= auto | Out-Null
    if (Test-Path $WinSwDir) {
        Push-Location $WinSwDir
        try { & $WinSwExe start } finally { Pop-Location }
    } else {
        sc.exe start $ServiceName | Out-Null
    }
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

    if (Test-Path $WinSwDir) {
        Push-Location $WinSwDir
        try { & $WinSwExe stop } finally { Pop-Location }
    } else {
        sc.exe stop $ServiceName | Out-Null
    }
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

    if (Test-Path $WinSwDir) {
        Push-Location $WinSwDir
        try { & $WinSwExe uninstall } finally { Pop-Location }
    } else {
        Write-Host "  WinSW directory not found; using sc.exe to remove service..." -ForegroundColor Yellow
        sc.exe delete $ServiceName | Out-Null
    }
    Write-Host "  Service removed." -ForegroundColor Yellow
    Write-Host "  Files in $InstallDir were left in place. Delete manually if needed." -ForegroundColor DarkGray
}

function Action-Status {
    Write-Header "Backupr Agent status"

    Write-Host "  Install dir : $InstallDir"
    Write-Host "  Config file : $(if (Test-Path $ConfigFile) { $ConfigFile } else { '(not found)' })"
    Write-Host "  Agent binary: $(if (Test-Path $AgentExe) { $AgentExe } else { '(not found)' })"
    Write-Host "  WinSW       : $(if (Test-Path $WinSwExe) { $WinSwExe } else { '(not found)' })"
    Write-Host "  7-Zip       : $(if (Test-Path $SevenZipExe) { $SevenZipExe } else { '(not found)' })"

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

function Action-Logs {
    Write-Header "Backupr Agent logs"

    $logFiles = Get-ChildItem -Path $InstallDir -Filter "*.log" -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending

    if (-not $logFiles) {
        Write-Host "  No log files found in $InstallDir" -ForegroundColor DarkGray
        return
    }

    Write-Host "  Found $($logFiles.Count) log file(s) in $InstallDir" -ForegroundColor Cyan
    Write-Host ""

    foreach ($file in $logFiles) {
        $size = if ($file.Length -ge 1MB) {
            "{0:N1} MB" -f ($file.Length / 1MB)
        } elseif ($file.Length -ge 1KB) {
            "{0:N1} KB" -f ($file.Length / 1KB)
        } else {
            "$($file.Length) B"
        }
        Write-Host ("  {0,-40} {1,8}   {2}" -f $file.Name, $size, $file.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"))
    }

    Write-Host ""
    $choice = Read-Host "  Enter a log filename to tail (or press Enter to skip)"
    $choice = $choice.Trim()
    if (-not $choice) { return }

    $target = Join-Path $InstallDir $choice
    if (-not (Test-Path $target)) {
        Write-Warning "File not found: $target"
        return
    }

    Write-Host ""
    Write-Host "  --- Last 50 lines of $choice ---" -ForegroundColor DarkCyan
    Get-Content $target -Tail 50 | ForEach-Object { Write-Host "  $_" }
    Write-Host "  --- end ---" -ForegroundColor DarkCyan
}

function Action-Update {
    Write-Header "Updating Backupr Agent"

    $null = New-Item -ItemType Directory -Force -Path $InstallDir

    $wasRunning = $false
    if (Get-ServiceExists) {
        $svc = Get-Service -Name $ServiceName
        if ($svc.Status -eq "Running") {
            $wasRunning = $true
            Write-Host "  Stopping service before update..." -ForegroundColor Yellow
            Action-Stop
            Start-Sleep -Seconds 2
        }
    }

    # Back up the current binary so we can roll back on failure
    $backup = $null
    if (Test-Path $AgentExe) {
        $backup = "$AgentExe.bak"
        Copy-Item $AgentExe $backup -Force
        Write-Host "  Backed up existing binary to $backup" -ForegroundColor DarkGray
    }

    try {
        Write-Host "  Downloading latest backupr-agent.exe..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $AgentUrl -OutFile $AgentExe -UseBasicParsing
        Write-Host "  Agent updated at $AgentExe" -ForegroundColor Green

        # Remove backup on success
        if ($backup -and (Test-Path $backup)) {
            Remove-Item $backup -Force
        }
    } catch {
        Write-Warning "Download failed: $_"
        if ($backup -and (Test-Path $backup)) {
            Copy-Item $backup $AgentExe -Force
            Remove-Item $backup -Force
            Write-Host "  Rolled back to previous binary." -ForegroundColor Yellow
        }
        if ($wasRunning) { Action-Start }
        return
    }

    if ($wasRunning) {
        Write-Host "  Restarting service..." -ForegroundColor Yellow
        Action-Start
    } else {
        Write-Host "  Service was not running; skipping restart." -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "  Update complete. Config files were not modified." -ForegroundColor Green
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
        Write-Host "  |  8) View logs                |"
        Write-Host "  |  9) Update agent             |"
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
            "8" { Action-Logs    }
            "9" { Action-Update  }
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
    "logs"    { Action-Logs    }
    "update"  { Action-Update  }
    ""        { Show-Menu      }
}
