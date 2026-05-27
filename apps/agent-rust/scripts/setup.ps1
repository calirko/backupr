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
    [ValidateSet("install", "setup", "start", "stop", "restart", "remove", "status", "logs", "update", "vss", "")]
    [string]$Action = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$global:LASTEXITCODE = 0

# --- Console: UTF-8 + TrueColor (ANSI VT processing) -------------------------
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { $null = chcp 65001 } catch {}

try {
    $sig = '
        [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int n);
        [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint m);
        [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint m);
    '
    $k32 = Add-Type -MemberDefinition $sig -Name 'K32VT' -Namespace '' -PassThru -ErrorAction Stop
    $h   = $k32::GetStdHandle(-11)
    $m   = [uint32]0
    $null = $k32::GetConsoleMode($h, [ref]$m)
    $null = $k32::SetConsoleMode($h, $m -bor 0x4)   # ENABLE_VIRTUAL_TERMINAL_PROCESSING
} catch {}

$ESC    = [char]27
$Brand  = "${ESC}[38;2;17;24;162m"     # #1118A2
$Subtle = "${ESC}[38;2;100;115;200m"   # lighter tint for dim text
$Reset  = "${ESC}[0m"

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

$AgentUrl     = "https://github.com/calirko/backupr/releases/latest/download/backupr-agent-$Arch-windows.exe"
$TrayUrl      = "https://github.com/calirko/backupr/releases/latest/download/backupr-tray-$Arch-windows.exe"
$ServiceName  = "backupr-agent"
$TrayTaskName = "Backupr Agent"
$InstallDir   = "C:\ProgramData\backupr"
$AgentExe     = Join-Path $InstallDir "backupr-agent.exe"
$TrayExe      = Join-Path $InstallDir "backupr-tray.exe"
$ConfigFile   = Join-Path $InstallDir "backupr.conf"
$WinSwDir     = Join-Path $InstallDir "winsw"
$WinSwExe     = Join-Path $WinSwDir "winsw.exe"
$WinSwUrl     = "https://github.com/winsw/winsw/releases/latest/download/WinSW-x64.exe"
$WinSwConfig  = Join-Path $WinSwDir "winsw.xml"
$SevenZipDir  = Join-Path $InstallDir "7zip"
$SevenZipExe  = Join-Path $SevenZipDir "7z.exe"
$SevenZipUrl  = "https://www.7-zip.org/a/7z2409-x64.exe"

# --- Helpers ------------------------------------------------------------------

function Write-Banner {
    Write-Host ""
    Write-Host "${Brand}  ██████╗  █████╗  ██████╗██╗  ██╗██╗   ██╗██████╗ ██████╗ ${Reset}"
    Write-Host "${Brand}  ██╔══██╗██╔══██╗██╔════╝██║ ██╔╝██║   ██║██╔══██╗██╔══██╗${Reset}"
    Write-Host "${Brand}  ██████╔╝███████║██║     █████╔╝ ██║   ██║██████╔╝██████╔╝${Reset}"
    Write-Host "${Brand}  ██╔══██╗██╔══██║██║     ██╔═██╗ ██║   ██║██╔═══╝ ██╔══██╗${Reset}"
    Write-Host "${Brand}  ██████╔╝██║  ██║╚██████╗██║  ██╗╚██████╔╝██║     ██║  ██╗${Reset}"
    Write-Host "${Brand}  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝  ╚═╝${Reset}"
    Write-Host "${Subtle}  Agent Installer & Service Manager${Reset}"
    Write-Host ""
}

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "  ${Brand}${Text}${Reset}"
    Write-Host "  ${Subtle}$('─' * $Text.Length)${Reset}"
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
  <name>Backupr Service</name>
  <description>Backupr Service</description>
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

function Ensure-TrayPresent {
    Stop-TrayProcess
    $null = New-Item -ItemType Directory -Force -Path $InstallDir
    Write-Host "  Downloading backupr-tray.exe..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $TrayUrl -OutFile $TrayExe -UseBasicParsing
    Write-Host "  Tray binary saved to $TrayExe" -ForegroundColor Green
}

function Register-TrayStartup {
    # Scheduled task that launches the tray app for every user that logs in.
    $action    = New-ScheduledTaskAction -Execute $TrayExe
    $trigger   = New-ScheduledTaskTrigger -AtLogon
    $settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -GroupId "Users" -RunLevel Limited
    Register-ScheduledTask -TaskName $TrayTaskName -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal `
        -Description "Backupr Tray" `
        -Force | Out-Null
    Write-Host "  Tray startup task registered (runs for all users at logon)." -ForegroundColor Green
}

function Stop-TrayProcess {
    $procs = Get-Process -Name "backupr-tray" -ErrorAction SilentlyContinue
    if ($procs) {
        Write-Host "  Stopping running tray process(es)..." -ForegroundColor Yellow
        $procs | Stop-Process -Force
        Start-Sleep -Milliseconds 500
    }
}

function Unregister-TrayStartup {
    if (Get-ScheduledTask -TaskName $TrayTaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TrayTaskName -Confirm:$false
        Write-Host "  Tray startup task removed." -ForegroundColor Yellow
    }
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
    Ensure-TrayPresent
    Write-WinSwConfig -StartMode "Manual"

    Push-Location $WinSwDir
    try {
        & $WinSwExe install
    } finally {
        Pop-Location
    }
    if ($LASTEXITCODE -ne 0) { throw "WinSW install failed (exit $LASTEXITCODE)" }

    Register-TrayStartup

    Write-Host ""
    Write-Host "  Service installed successfully." -ForegroundColor Green
    Write-Host "  The tray app (Backupr Agent) will start automatically at each user logon." -ForegroundColor DarkGray
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
    Unregister-TrayStartup
    Stop-TrayProcess
    Write-Host "  Service removed." -ForegroundColor Yellow
    Write-Host "  Files in $InstallDir were left in place. Delete manually if needed." -ForegroundColor DarkGray
}

function Action-Status {
    Write-Header "Backupr Agent status"

    Write-Host "  Install dir : $InstallDir"
    Write-Host "  Config file : $(if (Test-Path $ConfigFile) { $ConfigFile } else { '(not found)' })"
    Write-Host "  Service exe : $(if (Test-Path $AgentExe) { $AgentExe } else { '(not found)' })"
    Write-Host "  Tray exe    : $(if (Test-Path $TrayExe) { $TrayExe } else { '(not found)' })"
    Write-Host "  WinSW       : $(if (Test-Path $WinSwExe) { $WinSwExe } else { '(not found)' })"
    Write-Host "  7-Zip       : $(if (Test-Path $SevenZipExe) { $SevenZipExe } else { '(not found)' })"
    $trayTask = Get-ScheduledTask -TaskName $TrayTaskName -ErrorAction SilentlyContinue
    $trayStatus = if ($trayTask) { "registered" } else { "not registered" }
    $trayColor  = if ($trayTask) { "Green" } else { "DarkGray" }
    Write-Host "  Tray startup: $trayStatus" -ForegroundColor $trayColor

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

function Action-Vss {
    Write-Header "VSS (Volume Shadow Copy) toggle"

    if (-not (Test-Path $ConfigFile)) {
        Write-Warning "Config file not found at $ConfigFile. Run 'setup' first."
        return
    }

    $json = Get-Content $ConfigFile -Raw | ConvertFrom-Json

    $current = if ($null -ne $json.vssEnabled) { $json.vssEnabled } else { $true }
    $label   = if ($current) { "enabled" } else { "disabled" }
    Write-Host "  VSS is currently: $label" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1) Enable VSS  (default — consistent snapshots)"
    Write-Host "  2) Disable VSS (live file copy — use if AV/EDR kills the service during backup)"
    Write-Host ""
    $choice = Read-Host "  Choose (1/2, Enter to cancel)"

    $newValue = switch ($choice.Trim()) {
        "1" { $true  }
        "2" { $false }
        default {
            Write-Host "  Cancelled." -ForegroundColor DarkGray
            return
        }
    }

    if ($newValue -eq $current) {
        Write-Host "  No change." -ForegroundColor DarkGray
        return
    }

    $json | Add-Member -MemberType NoteProperty -Name vssEnabled -Value $newValue -Force
    $json | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigFile -Encoding UTF8

    $newLabel = if ($newValue) { "enabled" } else { "disabled" }
    Write-Host "  VSS $newLabel — config saved." -ForegroundColor Green

    if (Get-ServiceExists) {
        $svc = Get-Service -Name $ServiceName
        if ($svc.Status -eq "Running") {
            Write-Host "  Restarting service to apply change..." -ForegroundColor Yellow
            Action-Restart
        }
    }
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
        Write-Host "  Service binary updated at $AgentExe" -ForegroundColor Green

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

    # Tray binary — kill any running instance first so the file is not locked.
    if (Test-Path $TrayExe) {
        Stop-TrayProcess
        try {
            Write-Host "  Downloading latest backupr-tray.exe..." -ForegroundColor Yellow
            Invoke-WebRequest -Uri $TrayUrl -OutFile $TrayExe -UseBasicParsing
            Write-Host "  Tray binary updated at $TrayExe" -ForegroundColor Green
        } catch {
            Write-Warning "Tray download failed: $_"
        }
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
        Write-Host "  ${Brand}┌──────────────────────────────┐${Reset}"
        Write-Host "  ${Brand}│${Reset}  1)  Install service          ${Brand}│${Reset}"
        Write-Host "  ${Brand}│${Reset}  2)  Setup agent code         ${Brand}│${Reset}"
        Write-Host "  ${Brand}│${Reset}  3)  Start service            ${Brand}│${Reset}"
        Write-Host "  ${Brand}│${Reset}  4)  Stop service             ${Brand}│${Reset}"
        Write-Host "  ${Brand}│${Reset}  5)  Restart service          ${Brand}│${Reset}"
        Write-Host "  ${Brand}│${Reset}  6)  Remove service           ${Brand}│${Reset}"
        Write-Host "  ${Brand}│${Reset}  7)  Status                   ${Brand}│${Reset}"
        Write-Host "  ${Brand}│${Reset}  8)  View logs                ${Brand}│${Reset}"
        Write-Host "  ${Brand}│${Reset}  9)  Update agent             ${Brand}│${Reset}"
        Write-Host "  ${Brand}│${Reset}  10) Toggle VSS               ${Brand}│${Reset}"
        Write-Host "  ${Brand}│${Reset}  Q)  Quit                     ${Brand}│${Reset}"
        Write-Host "  ${Brand}└──────────────────────────────┘${Reset}"
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
            "9"  { Action-Update }
            "10" { Action-Vss    }
            "Q"  { Write-Host "  Bye." -ForegroundColor DarkGray; return }
            default { Write-Warning "Unknown option: $choice" }
        }
    }
}

# --- Entry point --------------------------------------------------------------

Confirm-Admin
Write-Banner

switch ($Action.ToLower()) {
    "install" { Action-Install }
    "setup"   { Action-Setup   }
    "start"   { Action-Start   }
    "stop"    { Action-Stop    }
    "restart" { Action-Restart }
    "remove"  { Action-Remove  }
    "status"  { Action-Status  }
    "logs"    { Action-Logs    }
    "update"  { Action-Update }
    "vss"     { Action-Vss    }
    ""        { Show-Menu     }
}
