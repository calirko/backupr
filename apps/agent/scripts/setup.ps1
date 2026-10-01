#Requires -Version 5.1
<#
.SYNOPSIS
    Backupr Agent installer / service manager

.DESCRIPTION
    Downloads the latest backupr-agent.exe from GitHub Releases and manages it
    as a Windows service via WinSW.
    The service runs as LocalSystem (no interactive login required) and starts automatically.

.PARAMETER Action
    Action to perform: install | setup | start | stop | restart | remove | status | logs | update | vss | diagnose
    If omitted, an interactive menu is shown.

.EXAMPLE
    # Interactive
    .\install.ps1

    # One-shot
    .\install.ps1 -Action install
#>

param(
    [ValidateSet("install", "setup", "start", "stop", "restart", "remove", "status", "logs", "update", "vss", "diagnose", "")]
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

$ESC   = [char]27
$Brand = "${ESC}[1m${ESC}[38;2;17;24;162m"   # bold + #1118A2
$Gray  = "${ESC}[38;2;160;160;160m"           # light gray
$Reset = "${ESC}[0m"

# Old conhost.exe (Windows 7/8/Server 2012) can throw "A device attached to
# the system is not functioning" from WriteConsole when a color is applied
# alongside codepage 65001 - shadow Write-Host to retry in plain text instead
# of crashing (and to avoid masking whatever error we were trying to report).
$OrigWriteHost = Get-Command Write-Host -CommandType Cmdlet
function Write-Host {
    param(
        [Parameter(Position = 0, ValueFromPipeline = $true)] $Object,
        [switch]$NoNewline,
        $Separator,
        $ForegroundColor,
        $BackgroundColor
    )
    try {
        & $OrigWriteHost @PSBoundParameters
    } catch {
        $PSBoundParameters.Remove('ForegroundColor') | Out-Null
        $PSBoundParameters.Remove('BackgroundColor') | Out-Null
        & $OrigWriteHost @PSBoundParameters
    }
}

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

$BootstrapUrl = "https://cdn.jsdelivr.net/gh/calirko/backupr@main/apps/agent/scripts/setup.ps1"
$AgentUrl     = "https://github.com/calirko/backupr/releases/latest/download/backupr-agent-$Arch-windows.exe"
$TrayUrl      = "https://github.com/calirko/backupr/releases/latest/download/backupr-tray-$Arch-windows.exe"
$ServiceName  = "backupr-agent"
$TrayRunKey  = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
$TrayRunName = "BackuprTray"
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
    Write-Host "${Brand}     ________  ________  ________  ____ ___  ________  ________  ________ ${Reset}"
    Write-Host "${Brand}    /       / /        \/        \/    /   \/    /   \/        \/        \${Reset}"
    Write-Host "${Brand}   /        \/         /         /         /         /         /         /${Reset}"
    Write-Host "${Brand}  /         /         /       --/        _/         /       __/        _/ ${Reset}"
    Write-Host "${Brand}  \________/\___/____/\________/\____/___/\________/\______/  \____/___/  ${Reset}"
    Write-Host "${Gray}  Agent Installer & Service Manager${Reset}"
    # Write-Host ""
}

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "  ${Brand}${Text}${Reset}"
    Write-Host "  ${Gray}$('-' * $Text.Length)${Reset}"
}

function Confirm-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Warning "This script requires Administrator privileges."
        Write-Host "Relaunching as Administrator..." -ForegroundColor Yellow
        if ($PSCommandPath) {
            # Running from a saved .ps1 file - relaunch that file directly.
            $scriptPath = $PSCommandPath
        } else {
            # Running via `iex (New-Object Net.WebClient).DownloadString(...)` - there is no
            # on-disk script to point -File at, so save the bootstrap content to a temp file
            # and relaunch that instead. (Avoids -EncodedCommand: a base64-blob relaunch is
            # one of the most heavily fingerprinted patterns in PowerShell AV/EDR heuristics,
            # and -File with a real script on disk carries none of that baggage.)
            $scriptPath = Join-Path $env:TEMP "backupr-setup-$([guid]::NewGuid().ToString('N')).ps1"
            (New-Object Net.WebClient).DownloadString($BootstrapUrl) | Set-Content -Path $scriptPath -Encoding UTF8
        }
        $args_ = "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
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
    # HKLM\Run fires in every user's interactive desktop session at logon -
    # more reliable than a scheduled task with GroupId for GUI/tray apps.
    Set-ItemProperty -Path $TrayRunKey -Name $TrayRunName -Value "`"$TrayExe`"" -Type String
    Write-Host "  Tray registered in HKLM Run (launches for all users at logon)." -ForegroundColor Green
}

function Stop-TrayProcess {
    $procs = Get-Process -Name "backupr-tray" -ErrorAction SilentlyContinue
    if ($procs) {
        Write-Host "  Stopping running tray process(es)..." -ForegroundColor Yellow
        $procs | Stop-Process -Force
        Start-Sleep -Milliseconds 500
    }
}

function Start-TrayProcess {
    # HKLM\Run only fires at the next logon - it never launches anything in the
    # session that's already running this script, so start it here too or the
    # tray icon won't appear until the machine is restarted / user signs out.
    if (-not (Test-Path $TrayExe)) { return }
    if (Get-Process -Name "backupr-tray" -ErrorAction SilentlyContinue) { return }
    Write-Host "  Starting tray app..." -ForegroundColor Yellow
    Start-Process -FilePath $TrayExe
}

function Unregister-TrayStartup {
    Remove-ItemProperty -Path $TrayRunKey -Name $TrayRunName -ErrorAction SilentlyContinue
    # Also clean up any legacy scheduled task left by older installs.
    $legacyTask = "Backupr Agent"
    if (Get-ScheduledTask -TaskName $legacyTask -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $legacyTask -Confirm:$false
    }
    Write-Host "  Tray removed from startup." -ForegroundColor Yellow
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
    Start-TrayProcess

    Write-Host ""
    Write-Host "  Service installed successfully." -ForegroundColor Green
    Write-Host "  The tray app (Backupr Agent) is running now and will start automatically at each user logon." -ForegroundColor DarkGray
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

    Start-TrayProcess
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
    $trayRun    = Get-ItemProperty -Path $TrayRunKey -Name $TrayRunName -ErrorAction SilentlyContinue
    $trayStatus = if ($trayRun) { "registered (HKLM Run)" } else { "not registered" }
    $trayColor  = if ($trayRun) { "Green" } else { "DarkGray" }
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
    Write-Host "  1) Enable VSS  (default - consistent snapshots)"
    Write-Host "  2) Disable VSS (live file copy - use if AV/EDR kills the service during backup)"
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
    Write-Host "  VSS $newLabel - config saved." -ForegroundColor Green

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

    # Tray binary - kill any running instance first so the file is not locked.
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

    # Migrate from legacy scheduled-task startup to HKLM Run (idempotent).
    $legacyTask = "Backupr Agent"
    if (Get-ScheduledTask -TaskName $legacyTask -ErrorAction SilentlyContinue) {
        Write-Host "  Removing legacy scheduled task '$legacyTask'..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $legacyTask -Confirm:$false
    }
    Register-TrayStartup
    Start-TrayProcess

    Write-Host ""
    Write-Host "  Update complete. Config files were not modified." -ForegroundColor Green
}

# --- Diagnostics (read-only) --------------------------------------------------
# Everything in this section only reads state - no settings, files, caches or
# services are touched. Every probe is isolated so that one failing check (old
# Windows, missing cmdlet, blocked protocol) never aborts the whole report.

$script:DiagFindings = New-Object System.Collections.ArrayList

function Add-Diag {
    param(
        [ValidateSet("OK", "INFO", "WARN", "FAIL", "SKIP")]
        [string]$Level,
        [string]$Text,
        [string]$Fix = ""
    )
    $color = switch ($Level) {
        "OK"    { "Green" }
        "WARN"  { "Yellow" }
        "FAIL"  { "Red" }
        default { "DarkGray" }
    }
    Write-Host ("  [{0,-4}] {1}" -f $Level, $Text) -ForegroundColor $color
    if ($Level -eq "WARN" -or $Level -eq "FAIL") {
        $null = $script:DiagFindings.Add((New-Object PSObject -Property @{ Level = $Level; Text = $Text; Fix = $Fix }))
    }
}

function Write-DiagSection {
    param([string]$Text)
    Write-Host ""
    Write-Host "  ${Brand}${Text}${Reset}"
}

function Format-DiagDuration {
    param([TimeSpan]$Span)
    if ($Span.TotalDays -ge 2)    { return "{0:N1} days" -f $Span.TotalDays }
    if ($Span.TotalHours -ge 1)   { return "{0:N1} h" -f $Span.TotalHours }
    if ($Span.TotalMinutes -ge 1) { return "{0:N0} min" -f $Span.TotalMinutes }
    return "{0:N0} s" -f $Span.TotalSeconds
}

function Get-DiagErrorLine {
    # First line of an error message - some are several lines long.
    param($ErrorRecord)
    return ("$($ErrorRecord.Exception.Message)" -split "`r?`n")[0]
}

function Get-DiagPowerCaps {
    # Asks the kernel which sleep states exist. `powercfg /a` has the same data
    # but its output is localized, so it can't be parsed reliably.
    if (-not ("BackuprDiag.Power" -as [type])) {
        Add-Type -Namespace BackuprDiag -Name Power -ErrorAction Stop -MemberDefinition '
            [DllImport("powrprof.dll")]
            public static extern uint CallNtPowerInformation(int level, IntPtr inBuf, uint inLen, byte[] outBuf, uint outLen);
        '
    }
    $buf = New-Object byte[] 128
    # 4 = SystemPowerCapabilities; the buffer is a SYSTEM_POWER_CAPABILITIES
    # struct of one-byte flags, read here by offset.
    if ([BackuprDiag.Power]::CallNtPowerInformation(4, [IntPtr]::Zero, 0, $buf, 128) -ne 0) { return $null }
    return @{
        Lid           = [bool]$buf[2]
        ModernStandby = [bool]$buf[20]
    }
}

function Get-DiagPowerSetting {
    # Returns @{ AC; DC } for a powercfg setting alias, or $null when the
    # setting does not exist on this machine. The labels are localized, so rely
    # on position: the last two hex values are the current AC and DC indexes.
    param([string]$SubGroup, [string]$Setting)
    $out = & powercfg.exe /query SCHEME_CURRENT $SubGroup $Setting 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
    $hex = @([regex]::Matches(($out -join "`n"), '0x[0-9a-fA-F]{8}') | ForEach-Object { $_.Value })
    if ($hex.Count -lt 2) { return $null }
    return @{
        AC = [Convert]::ToInt64($hex[$hex.Count - 2], 16)
        DC = [Convert]::ToInt64($hex[$hex.Count - 1], 16)
    }
}

function Get-DiagEventCount {
    # Number of matching events in the last $Days days, or -1 if the log or
    # provider can't be queried.
    param([string]$LogName, [string]$Provider, [int[]]$Ids, [int]$Days)
    try {
        $filter = @{ LogName = $LogName; Id = $Ids; StartTime = (Get-Date).AddDays(-$Days) }
        if ($Provider) { $filter.ProviderName = $Provider }
        return @(Get-WinEvent -FilterHashtable $filter -ErrorAction Stop).Count
    } catch {
        # "No events were found" is reported as an error - it just means zero.
        if ("$($_.FullyQualifiedErrorId)" -like "NoMatchingEventsFound*") { return 0 }
        return -1
    }
}

function Test-DiagTcp {
    param([string]$HostName, [int]$Port, [int]$Attempts = 3, [int]$TimeoutMs = 5000)
    $ok = 0
    $totalMs = 0
    $lastError = ""
    for ($i = 0; $i -lt $Attempts; $i++) {
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $sw = [Diagnostics.Stopwatch]::StartNew()
            $async = $client.BeginConnect($HostName, $Port, $null, $null)
            if ($async.AsyncWaitHandle.WaitOne($TimeoutMs)) {
                $client.EndConnect($async)
                $ok++
                $totalMs += $sw.ElapsedMilliseconds
            } else {
                $lastError = "no answer within $($TimeoutMs / 1000)s"
            }
        } catch {
            $lastError = $_.Exception.GetBaseException().Message
        } finally {
            $client.Close()
        }
        Start-Sleep -Milliseconds 200
    }
    $avg = if ($ok -gt 0) { [int]($totalMs / $ok) } else { 0 }
    return @{ Ok = $ok; Attempts = $Attempts; AvgMs = $avg; Error = $lastError }
}

function Test-DiagPing {
    param([string]$Address, [int]$Count = 20)
    $ping = New-Object System.Net.NetworkInformation.Ping
    $ok = 0
    $totalMs = 0
    $maxMs = 0
    for ($i = 0; $i -lt $Count; $i++) {
        try {
            $reply = $ping.Send($Address, 1000)
            if ($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) {
                $ok++
                $totalMs += $reply.RoundtripTime
                if ($reply.RoundtripTime -gt $maxMs) { $maxMs = $reply.RoundtripTime }
            }
        } catch {}
        Start-Sleep -Milliseconds 100
    }
    $ping.Dispose()
    $avg = if ($ok -gt 0) { [int]($totalMs / $ok) } else { 0 }
    return @{ LossPct = [int](100 * ($Count - $ok) / $Count); AvgMs = $avg; MaxMs = $maxMs }
}

function Read-DiagLogTail {
    # Last $MaxBytes of a log file as lines. Opened with full sharing because
    # the running service keeps these files open for writing.
    param([string]$Path, [int]$MaxBytes)
    $share = [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete
    $fs = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, $share)
    try {
        if ($fs.Length -gt $MaxBytes) { $null = $fs.Seek(-$MaxBytes, [IO.SeekOrigin]::End) }
        $reader = New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)
        return @($reader.ReadToEnd() -split "`r?`n")
    } finally {
        $fs.Dispose()
    }
}

function Action-Diagnose {
    Write-Header "Backupr diagnostics (read-only)"
    Write-Host "  ${Gray}Nothing on this computer is changed. Takes a minute or two.${Reset}"

    # Probes are expected to fail on some machines; report that, don't abort.
    $ErrorActionPreference = "Continue"
    $ProgressPreference    = "SilentlyContinue"
    $script:DiagFindings   = New-Object System.Collections.ArrayList
    $days = 7

    # --- System ---------------------------------------------------------------
    Write-DiagSection "System"

    $isLaptop = $false
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
        $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
        Add-Diag INFO "$($env:COMPUTERNAME): $($os.Caption) ($($os.Version)), $($cs.Manufacturer) $($cs.Model)"
        $uptime = (Get-Date) - $os.LastBootUpTime
        Add-Diag INFO ("Running for {0} (last boot {1:yyyy-MM-dd HH:mm})" -f (Format-DiagDuration $uptime), $os.LastBootUpTime)
        # 2 = Mobile
        if ($cs.PCSystemType -eq 2) { $isLaptop = $true }
    } catch {
        Add-Diag SKIP "System information unavailable: $(Get-DiagErrorLine $_)"
    }

    $caps = $null
    try { $caps = Get-DiagPowerCaps } catch {}
    if ($caps -and $caps.Lid) { $isLaptop = $true }

    if ($isLaptop) {
        Add-Diag WARN "This is a laptop. Laptops sleep, get their lid closed and usually sit on Wi-Fi." `
            -Fix "Keep it plugged in, wired, and review the power findings below."
    } else {
        Add-Diag OK "Desktop or server hardware (no lid)"
    }

    # --- Power ----------------------------------------------------------------
    Write-DiagSection "Power and sleep"

    try {
        $sleep = Get-DiagPowerSetting SUB_SLEEP STANDBYIDLE
        if (-not $sleep) {
            Add-Diag SKIP "Sleep timeout could not be read"
        } elseif ($sleep.AC -gt 0) {
            Add-Diag WARN "Sleeps after $(Format-DiagDuration ([TimeSpan]::FromSeconds($sleep.AC))) idle on AC power - the agent goes offline" `
                -Fix "powercfg /change standby-timeout-ac 0"
        } else {
            Add-Diag OK "Never sleeps on AC power"
        }
        if ($sleep -and $isLaptop -and $sleep.DC -gt 0) {
            Add-Diag INFO "On battery it sleeps after $(Format-DiagDuration ([TimeSpan]::FromSeconds($sleep.DC)))"
        }

        $hibernate = Get-DiagPowerSetting SUB_SLEEP HIBERNATEIDLE
        if ($hibernate -and $hibernate.AC -gt 0) {
            Add-Diag WARN "Hibernates after $(Format-DiagDuration ([TimeSpan]::FromSeconds($hibernate.AC))) idle on AC power" `
                -Fix "powercfg /change hibernate-timeout-ac 0"
        }

        if ($isLaptop) {
            $lid = Get-DiagPowerSetting SUB_BUTTONS LIDACTION
            if ($lid) {
                $lidNames = @("does nothing", "sleeps", "hibernates", "shuts down")
                $lidText  = if ($lid.AC -ge 0 -and $lid.AC -lt $lidNames.Count) { $lidNames[[int]$lid.AC] } else { "action $($lid.AC)" }
                if ($lid.AC -ne 0) {
                    Add-Diag WARN "Closing the lid on AC power: the machine $lidText" `
                        -Fix "Control Panel > Power Options > 'Choose what closing the lid does' > Do nothing"
                } else {
                    Add-Diag OK "Closing the lid on AC power does nothing"
                }
            }
        }
    } catch {
        Add-Diag SKIP "Power plan could not be read: $(Get-DiagErrorLine $_)"
    }

    if ($caps -and $caps.ModernStandby) {
        $fix = "Keep the screen from turning the machine idle: plugged in, sleep set to never."
        $msText = "Modern Standby (S0) machine: when the screen turns off, Windows may cut the network while services keep running"
        try {
            # 0 = network off in standby, 1 = on, 2 = managed by Windows
            $conn = Get-DiagPowerSetting SUB_NONE CONNECTIVITYINSTANDBY
            if ($conn -and $conn.AC -eq 1) {
                Add-Diag INFO "Modern Standby (S0) machine, network stays connected in standby on AC power"
            } else {
                Add-Diag WARN $msText -Fix $fix
            }
        } catch {
            Add-Diag WARN $msText -Fix $fix
        }
    } elseif ($caps) {
        Add-Diag OK "No Modern Standby"
    } else {
        Add-Diag SKIP "Sleep capabilities could not be read"
    }

    $sleeps = Get-DiagEventCount -LogName System -Provider "Microsoft-Windows-Kernel-Power" -Ids 42 -Days $days
    if ($sleeps -gt 0) {
        Add-Diag WARN "Went to sleep $sleeps time(s) in the last $days days" -Fix "Disable sleep (see above)."
    } elseif ($sleeps -eq 0) {
        Add-Diag OK "Did not sleep in the last $days days"
    }

    $standbys = Get-DiagEventCount -LogName System -Provider "Microsoft-Windows-Kernel-Power" -Ids 506 -Days $days
    if ($standbys -gt 0) {
        Add-Diag WARN "Entered Modern Standby $standbys time(s) in the last $days days" `
            -Fix "Compare these times with the offline periods in the agent log below."
    }

    $crashes = Get-DiagEventCount -LogName System -Provider "Microsoft-Windows-Kernel-Power" -Ids 41 -Days $days
    if ($crashes -gt 0) {
        Add-Diag WARN "$crashes unexpected shutdown(s) or power loss(es) in the last $days days" `
            -Fix "Check power supply / UPS; a backup running at that moment is lost."
    }

    # --- Network --------------------------------------------------------------
    Write-DiagSection "Network adapter"

    $gateway    = $null
    $dnsServers = @()
    $route = $null
    $haveNetCmdlets = [bool](Get-Command Get-NetRoute -ErrorAction SilentlyContinue)
    if ($haveNetCmdlets) {
        $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
                 Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
    }
    if (-not $haveNetCmdlets) {
        Add-Diag SKIP "Network adapter checks need Windows 8 / Server 2012 or newer"
    } elseif (-not $route) {
        Add-Diag FAIL "No default route - this machine has no internet connection right now" -Fix "Check cable / Wi-Fi / router."
    } else {
        try {
            $gateway = "$($route.NextHop)"
            $ifIndex = $route.InterfaceIndex
            $adapter = Get-NetAdapter -InterfaceIndex $ifIndex -ErrorAction Stop

            Add-Diag INFO "Internet goes through '$($adapter.Name)' ($($adapter.InterfaceDescription)), $($adapter.LinkSpeed), gateway $gateway"

            # NdisPhysicalMedium: 1 = wireless LAN, 9 = native 802.11
            $isWifi = ($adapter.NdisPhysicalMedium -eq 9) -or ($adapter.NdisPhysicalMedium -eq 1)
            if ($adapter.Virtual) {
                Add-Diag WARN "The default route is a virtual adapter (VPN or similar) - the agent depends on it staying up" `
                    -Fix "Check whether backups should really go through this tunnel."
            } elseif ($isWifi) {
                $signalText = ""
                $signal = -1
                try {
                    # Only the signal line carries a percentage, whatever the language.
                    $m = [regex]::Match(((& netsh.exe wlan show interfaces 2>$null) -join "`n"), ':\s*(\d{1,3})%')
                    if ($m.Success) { $signal = [int]$m.Groups[1].Value; $signalText = ", signal $signal%" }
                } catch {}
                Add-Diag WARN "Connected over Wi-Fi$signalText - the usual cause of dropped agent connections" `
                    -Fix "Use a network cable."
                if ($signal -ge 0 -and $signal -lt 60) {
                    Add-Diag FAIL "Wi-Fi signal is weak ($signal%)" -Fix "Use a cable or move the machine / access point."
                }
            } else {
                Add-Diag OK "Wired connection"
                if ($adapter.Speed -gt 0 -and $adapter.Speed -lt 100000000) {
                    Add-Diag WARN "Link speed is only $($adapter.LinkSpeed) - bad cable or port?" -Fix "Replace the cable / try another switch port."
                }
            }

            try {
                $pm = Get-NetAdapterPowerManagement -Name $adapter.Name -ErrorAction Stop
                if ("$($pm.AllowComputerToTurnOffDevice)" -eq "Enabled") {
                    Add-Diag WARN "Windows is allowed to power down this network adapter to save energy" `
                        -Fix "Device Manager > adapter > Power Management > untick 'Allow the computer to turn off this device'."
                } else {
                    Add-Diag OK "Adapter power saving is off"
                }
            } catch {
                Add-Diag SKIP "Adapter power management could not be read"
            }

            try {
                $dnsServers = @((Get-DnsClientServerAddress -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction Stop).ServerAddresses)
                if ($dnsServers.Count -eq 0) {
                    Add-Diag WARN "No IPv4 DNS server configured on this adapter" -Fix "Set DNS to 1.1.1.1 and 8.8.8.8."
                } else {
                    Add-Diag INFO "DNS servers: $($dnsServers -join ', ')"
                    $onlyRouter = @($dnsServers | Where-Object { $_ -ne $gateway }).Count -eq 0
                    if ($onlyRouter) {
                        Add-Diag WARN "The router is the only DNS server - consumer routers are a common source of 'host not known' errors" `
                            -Fix "Set DNS to 1.1.1.1 and 8.8.8.8 on this adapter."
                    } elseif ($dnsServers.Count -eq 1) {
                        Add-Diag WARN "Only one DNS server configured (no fallback)" -Fix "Add a second DNS server."
                    }
                }
            } catch {
                Add-Diag SKIP "DNS configuration could not be read"
            }
        } catch {
            Add-Diag SKIP "Network adapter details could not be read: $(Get-DiagErrorLine $_)"
        }
    }

    $drops = Get-DiagEventCount -LogName "Microsoft-Windows-NetworkProfile/Operational" -Ids 10001 -Days $days
    if ($drops -gt $days) {
        Add-Diag WARN "Network disconnected $drops time(s) in the last $days days" -Fix "Check cable, Wi-Fi, router and sleep settings."
    } elseif ($drops -ge 0) {
        Add-Diag OK "Network disconnected $drops time(s) in the last $days days"
    }

    $dnsTimeouts = Get-DiagEventCount -LogName System -Provider "Microsoft-Windows-DNS-Client" -Ids 1014 -Days $days
    if ($dnsTimeouts -gt 10) {
        Add-Diag WARN "Windows logged $dnsTimeouts DNS timeouts in the last $days days" -Fix "Change the DNS servers (1.1.1.1 / 8.8.8.8)."
    } elseif ($dnsTimeouts -ge 0) {
        Add-Diag OK "Windows logged $dnsTimeouts DNS timeout(s) in the last $days days"
    }

    # --- Targets --------------------------------------------------------------
    # The hosts the agent needs: its server, and GitHub for self-updates.
    $serverUri = $null
    $wsUri     = $null
    $vssConfig = $true
    if (Test-Path $ConfigFile) {
        try {
            $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            $serverProp = $cfg.PSObject.Properties["server_url"]
            $wsProp     = $cfg.PSObject.Properties["ws_url"]
            $vssProp    = $cfg.PSObject.Properties["vssEnabled"]
            if ($serverProp -and $serverProp.Value) { $serverUri = [uri]"$($serverProp.Value)" }
            $wsBase = if ($wsProp -and $wsProp.Value) { "$($wsProp.Value)" } elseif ($serverUri) { "$($serverProp.Value)" } else { "" }
            if ($wsBase) {
                $wsUri = [uri](($wsBase.TrimEnd("/") -replace '^http://', 'ws://' -replace '^https://', 'wss://') + "/api/agent/ws")
            }
            if ($vssProp -and $vssProp.Value -eq $false) { $vssConfig = $false }
        } catch {
            Add-Diag WARN "Config file $ConfigFile could not be parsed: $($_.Exception.Message)" -Fix "Run 'setup' again."
        }
    }

    $targets = @()
    if ($serverUri) { $targets += @{ Name = "Backupr server"; Host = $serverUri.Host; Port = $serverUri.Port } }
    if ($wsUri -and (-not $serverUri -or $wsUri.Host -ne $serverUri.Host -or $wsUri.Port -ne $serverUri.Port)) {
        $targets += @{ Name = "Backupr WebSocket"; Host = $wsUri.Host; Port = $wsUri.Port }
    }
    $targets += @{ Name = "GitHub";                  Host = "github.com";                           Port = 443 }
    $targets += @{ Name = "GitHub API";              Host = "api.github.com";                       Port = 443 }
    $targets += @{ Name = "GitHub release download"; Host = "release-assets.githubusercontent.com"; Port = 443 }

    # --- DNS ------------------------------------------------------------------
    Write-DiagSection "DNS resolution"

    if (-not $serverUri) {
        Add-Diag INFO "Agent is not configured yet - testing GitHub only"
    }

    foreach ($t in $targets) {
        # Same lookup path the agent uses; a failure here is its "os error 11001".
        try {
            $null = [System.Net.Dns]::GetHostAddresses($t.Host)
            Add-Diag OK "Windows resolves $($t.Host)"
        } catch {
            Add-Diag FAIL "Windows cannot resolve $($t.Host) ($($t.Name)) right now" -Fix "Check internet connection and DNS servers."
        }
    }

    if (Get-Command Resolve-DnsName -ErrorAction SilentlyContinue) {
        # Query each resolver directly (bypasses the local cache) a few times.
        $resolvers = @()
        foreach ($ip in $dnsServers) { $resolvers += @{ Ip = "$ip"; Configured = $true } }
        foreach ($ip in @("1.1.1.1", "8.8.8.8")) {
            if ($dnsServers -notcontains $ip) { $resolvers += @{ Ip = $ip; Configured = $false } }
        }

        $configuredBad = $false
        $publicGood    = $false
        foreach ($r in $resolvers) {
            $ok = 0
            $total = 0
            $totalMs = 0
            foreach ($t in $targets) {
                for ($i = 0; $i -lt 3; $i++) {
                    $total++
                    $sw = [Diagnostics.Stopwatch]::StartNew()
                    try {
                        $null = Resolve-DnsName -Name $t.Host -Type A -Server $r.Ip -DnsOnly -QuickTimeout -ErrorAction Stop
                        $ok++
                        $totalMs += $sw.ElapsedMilliseconds
                    } catch {}
                }
                # A resolver that is blocked or dead: don't wait out every timeout.
                if ($ok -eq 0) { break }
            }
            $avg   = if ($ok -gt 0) { [int]($totalMs / $ok) } else { 0 }
            $label = if ($r.Configured) { "DNS server $($r.Ip)" } else { "Public DNS $($r.Ip) (reference)" }
            $stats = "$ok/$total lookups answered, avg ${avg} ms"

            if ($r.Configured) {
                if ($ok -eq 0) {
                    $configuredBad = $true
                    Add-Diag FAIL "${label}: no answers" -Fix "Replace this DNS server (1.1.1.1 / 8.8.8.8)."
                } elseif ($ok -lt $total) {
                    $configuredBad = $true
                    Add-Diag WARN "${label}: $stats - drops queries" -Fix "Replace this DNS server (1.1.1.1 / 8.8.8.8)."
                } elseif ($avg -gt 300) {
                    Add-Diag WARN "${label}: $stats - slow" -Fix "Use a faster DNS server (1.1.1.1 / 8.8.8.8)."
                } else {
                    Add-Diag OK "${label}: $stats"
                }
            } else {
                if ($ok -eq $total) { $publicGood = $true }
                Add-Diag INFO "${label}: $stats"
            }
        }
        if ($configuredBad -and $publicGood) {
            Add-Diag INFO "Public DNS answers fine from here, so the configured DNS server is the weak point"
        }
    } else {
        Add-Diag SKIP "Per-server DNS test needs Windows 8 / Server 2012 or newer"
    }

    # --- Reachability ---------------------------------------------------------
    Write-DiagSection "Connection quality"

    if ($gateway -and $gateway -ne "0.0.0.0") {
        $p = Test-DiagPing $gateway
        $stats = "$($p.LossPct)% loss, avg $($p.AvgMs) ms, max $($p.MaxMs) ms"
        if ($p.LossPct -eq 100) {
            Add-Diag INFO "Router $gateway does not answer ping (cannot judge the local link)"
        } elseif ($p.LossPct -ge 10) {
            Add-Diag FAIL "Ping to router ${gateway}: $stats - the local network itself is losing packets" -Fix "Fix Wi-Fi / cable / switch before anything else."
        } elseif ($p.LossPct -gt 0 -or $p.AvgMs -gt 20) {
            Add-Diag WARN "Ping to router ${gateway}: $stats - unstable local link" -Fix "Check Wi-Fi signal or cable."
        } else {
            Add-Diag OK "Ping to router ${gateway}: $stats"
        }
    }

    $p = Test-DiagPing "1.1.1.1"
    $stats = "$($p.LossPct)% loss, avg $($p.AvgMs) ms, max $($p.MaxMs) ms"
    if ($p.LossPct -eq 100) {
        Add-Diag INFO "Internet ping (1.1.1.1) gets no answer - blocked here, or offline (see TCP tests)"
    } elseif ($p.LossPct -ge 10) {
        Add-Diag FAIL "Ping to internet (1.1.1.1): $stats" -Fix "If the router ping is clean this is the ISP line."
    } elseif ($p.LossPct -gt 0 -or $p.AvgMs -gt 150) {
        Add-Diag WARN "Ping to internet (1.1.1.1): $stats" -Fix "If the router ping is clean this is the ISP line."
    } else {
        Add-Diag OK "Ping to internet (1.1.1.1): $stats"
    }

    foreach ($t in $targets) {
        $r = Test-DiagTcp $t.Host $t.Port
        $label = "$($t.Name) ($($t.Host):$($t.Port))"
        if ($r.Ok -eq 0) {
            Add-Diag FAIL "${label}: cannot connect - $($r.Error)" -Fix "Check firewall / antivirus / ISP filtering for this host."
        } elseif ($r.Ok -lt $r.Attempts) {
            Add-Diag WARN "${label}: only $($r.Ok)/$($r.Attempts) connections succeeded - $($r.Error)" -Fix "Intermittent link or filtering; rerun to confirm."
        } elseif ($r.AvgMs -gt 1500) {
            Add-Diag WARN "${label}: connects but slowly (avg $($r.AvgMs) ms)" -Fix "Slow or congested line."
        } else {
            Add-Diag OK "${label}: $($r.Ok)/$($r.Attempts) connections, avg $($r.AvgMs) ms"
        }
    }

    if ($serverUri) {
        $pingUrl = "$($serverUri.GetLeftPart([UriPartial]::Authority))/api/ping"
        try {
            $sw   = [Diagnostics.Stopwatch]::StartNew()
            $resp = Invoke-WebRequest -Uri $pingUrl -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
            Add-Diag OK "Server API answers ($pingUrl, HTTP $($resp.StatusCode), $($sw.ElapsedMilliseconds) ms)"

            # A wrong clock breaks TLS and signed upload URLs.
            try {
                if ($resp.Headers.ContainsKey("Date")) {
                    $style      = [Globalization.DateTimeStyles]::AdjustToUniversal
                    $serverTime = [datetime]::Parse("$($resp.Headers['Date'])", [Globalization.CultureInfo]::InvariantCulture, $style)
                    $skew       = [Math]::Abs(([datetime]::UtcNow - $serverTime).TotalSeconds)
                    if ($skew -gt 300) {
                        Add-Diag WARN ("System clock is off by {0}" -f (Format-DiagDuration ([TimeSpan]::FromSeconds($skew)))) `
                            -Fix "Fix date/time and enable automatic time sync."
                    } else {
                        Add-Diag OK "System clock matches the server"
                    }
                }
            } catch {}
        } catch {
            Add-Diag FAIL "Server API does not answer at ${pingUrl}: $($_.Exception.Message)" -Fix "If the TCP test above passed, the server itself is down."
        }
    }

    if ($wsUri) {
        # No token is sent, so the server rejects this right after the upgrade -
        # it never touches the running agent's session. It only proves that
        # proxies / antivirus let a WebSocket upgrade through.
        $ws = $null
        try {
            $ws   = New-Object System.Net.WebSockets.ClientWebSocket
            $cts  = New-Object System.Threading.CancellationTokenSource
            $task = $ws.ConnectAsync($wsUri, $cts.Token)
            if ($task.Wait(10000)) {
                Add-Diag OK "WebSocket upgrade to the server works"
            } else {
                $cts.Cancel()
                Add-Diag FAIL "WebSocket upgrade to the server timed out" -Fix "Something between this PC and the server blocks WebSockets (proxy / antivirus web shield)."
            }
        } catch [System.PlatformNotSupportedException] {
            Add-Diag SKIP "WebSocket test needs Windows 8 / Server 2012 or newer"
        } catch {
            $inner = $_.Exception.GetBaseException()
            if ($inner -is [System.PlatformNotSupportedException]) {
                Add-Diag SKIP "WebSocket test needs Windows 8 / Server 2012 or newer"
            } else {
                Add-Diag FAIL "WebSocket upgrade to the server failed: $($inner.Message)" -Fix "Something between this PC and the server blocks WebSockets (proxy / antivirus web shield)."
            }
        } finally {
            if ($ws) { $ws.Dispose() }
        }
    }

    try {
        $probe = [uri]"https://github.com/"
        $via   = [System.Net.WebRequest]::GetSystemWebProxy().GetProxy($probe)
        if ($via -and $via.AbsoluteUri -ne $probe.AbsoluteUri) {
            Add-Diag WARN "This user browses through a proxy ($($via.Authority)). The service runs as LocalSystem and may not use it" `
                -Fix "Allow direct access for this machine, or configure a machine-wide proxy."
        } else {
            Add-Diag OK "No web proxy in use"
        }
    } catch {}

    try {
        $blocking = @(Get-NetFirewallProfile -ErrorAction Stop |
            Where-Object { "$($_.Enabled)" -eq "True" -and "$($_.DefaultOutboundAction)" -eq "Block" })
        if ($blocking.Count -gt 0) {
            Add-Diag WARN "Windows Firewall blocks outbound traffic by default ($(@($blocking | ForEach-Object { $_.Name }) -join ', ') profile)" `
                -Fix "Add an outbound allow rule for $AgentExe."
        }
    } catch {}

    try {
        $av = @(Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName AntiVirusProduct -ErrorAction Stop |
            ForEach-Object { $_.displayName } | Sort-Object -Unique)
        if ($av.Count -gt 0) {
            Add-Diag INFO "Antivirus: $($av -join ', ') - if only the agent has trouble, check its web / network shield"
        }
    } catch {}

    # --- Agent ----------------------------------------------------------------
    Write-DiagSection "Agent"

    $serviceRunning = $false
    if (Get-ServiceExists) {
        $svc = Get-Service -Name $ServiceName
        $serviceRunning = ("$($svc.Status)" -eq "Running")
        if ($serviceRunning) {
            Add-Diag OK "Service is running"
        } else {
            Add-Diag FAIL "Service is $($svc.Status)" -Fix "Start it (menu option 3)."
        }
        try {
            $startType = "$($svc.StartType)"
            if ($startType -ne "Automatic") {
                Add-Diag WARN "Service start type is $startType - it will not come back after a reboot" -Fix "Start it from this script (sets it to automatic)."
            }
        } catch {}
    } else {
        Add-Diag INFO "Service is not installed (pre-install check)"
    }

    if ((Get-ServiceExists) -and -not (Test-Path $SevenZipExe)) {
        Add-Diag WARN "7-Zip not found at $SevenZipExe" -Fix "Reinstall the agent."
    }

    try {
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'" -ErrorAction Stop
        $freeGb = [Math]::Round($disk.FreeSpace / 1GB, 1)
        $text = "$freeGb GB free on $($env:SystemDrive) (backups are staged and compressed in the temp folder there)"
        if ($freeGb -lt 2) {
            Add-Diag FAIL $text -Fix "Free up disk space."
        } elseif ($freeGb -lt 10) {
            Add-Diag WARN $text -Fix "Free up disk space; it must hold a copy of the data plus the archive."
        } else {
            Add-Diag OK $text
        }
    } catch {}

    if (-not $vssConfig) {
        Add-Diag INFO "VSS is disabled in the agent config (live file copy)"
    } else {
        try {
            $vss = Get-Service -Name VSS -ErrorAction Stop
            if ("$($vss.StartType)" -eq "Disabled") {
                Add-Diag WARN "Volume Shadow Copy service is disabled - open files are copied live" -Fix "Set the VSS service to Manual."
            } else {
                Add-Diag OK "Volume Shadow Copy service is available"
            }
        } catch {}
    }

    # --- Agent logs -----------------------------------------------------------
    Write-DiagSection "Agent log history"

    $errLog = Get-ChildItem -Path $InstallDir -Filter "*.err.log" -ErrorAction SilentlyContinue | Select-Object -First 1
    $outLog = Get-ChildItem -Path $InstallDir -Filter "*.out.log" -ErrorAction SilentlyContinue | Select-Object -First 1

    if ($outLog) {
        try {
            # Every connect / reconnect line carries a UTC timestamp, which turns
            # the log into a record of when and for how long the agent was offline.
            $lines  = Read-DiagLogTail $outLog.FullName 8MB
            $cutoff = [datetime]::UtcNow.AddDays(-$days)
            $style  = [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
            $rx     = [regex]'^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\] .*?(Connected and authenticated|Reconnecting in)'

            $connects   = 0
            $offline    = [TimeSpan]::Zero
            $longest    = [TimeSpan]::Zero
            $longestAt  = $null
            $downSince  = $null
            $firstStamp = $null
            foreach ($line in $lines) {
                $m = $rx.Match($line)
                if (-not $m.Success) { continue }
                $ts = [datetime]::ParseExact($m.Groups[1].Value, "yyyy-MM-dd HH:mm:ss", [Globalization.CultureInfo]::InvariantCulture, $style)
                if ($ts -lt $cutoff) { continue }
                if (-not $firstStamp) { $firstStamp = $ts }
                if ($m.Groups[2].Value -eq "Reconnecting in") {
                    if (-not $downSince) { $downSince = $ts }
                } else {
                    $connects++
                    if ($downSince) {
                        $gap = $ts - $downSince
                        $offline += $gap
                        if ($gap -gt $longest) { $longest = $gap; $longestAt = $downSince }
                        $downSince = $null
                    }
                }
            }

            if (-not $firstStamp) {
                Add-Diag INFO "No connection activity in $($outLog.Name) for the last $days days"
            } else {
                $span = [datetime]::UtcNow - $firstStamp
                $text = "Agent log, last $(Format-DiagDuration $span): connected $connects time(s), offline for $(Format-DiagDuration $offline) in total"
                if ($longestAt) {
                    $text += ", longest outage $(Format-DiagDuration $longest) starting $($longestAt.ToLocalTime().ToString('yyyy-MM-dd HH:mm'))"
                }
                $offlinePct = if ($span.TotalSeconds -gt 0) { 100 * $offline.TotalSeconds / $span.TotalSeconds } else { 0 }
                if ($offlinePct -ge 10) {
                    Add-Diag FAIL $text -Fix "Backups scheduled during these outages do not run. See the network and power findings."
                } elseif ($offline.TotalMinutes -ge 30 -or $connects -gt (3 * $days)) {
                    Add-Diag WARN $text -Fix "Check whether the outages line up with nights, sleep events or router restarts."
                } else {
                    Add-Diag OK $text
                }
                if ($downSince -and $serviceRunning) {
                    Add-Diag WARN "Agent has been disconnected since $($downSince.ToLocalTime().ToString('yyyy-MM-dd HH:mm')) and is still retrying" `
                        -Fix "See the connection tests above."
                }
            }
        } catch {
            Add-Diag SKIP "Could not read $($outLog.Name): $(Get-DiagErrorLine $_)"
        }
    } else {
        Add-Diag INFO "No agent output log yet"
    }

    if ($errLog) {
        try {
            $lines = Read-DiagLogTail $errLog.FullName 4MB
            $patterns = @(
                @{ Name = "DNS lookup failures";            Rx = 'os error 11001' },
                @{ Name = "connection timeouts";            Rx = 'os error 10060' },
                @{ Name = "connections reset mid-session";  Rx = 'WebSocket error: .*(os error 10054|Connection reset)' },
                @{ Name = "server-side errors (502/refused)"; Rx = '502 Bad Gateway|os error 10061' },
                @{ Name = "killed / failed compressions";   Rx = '7z exited with code' },
                @{ Name = "backups with nothing to stage";  Rx = 'No files could be staged' },
                @{ Name = "VSS failures";                   Rx = 'VSS failed' },
                @{ Name = "failed updates";                 Rx = '\[Update\] Update failed' }
            )
            $parts = @()
            $netErrors = 0
            foreach ($pat in $patterns) {
                $n = @($lines | Where-Object { $_ -match $pat.Rx }).Count
                if ($n -gt 0) { $parts += "$($pat.Name): $n" }
                if ($pat.Rx -match '11001|10060|10054') { $netErrors += $n }
            }
            # This log has no timestamps, so it can only be read as a total.
            if ($parts.Count -eq 0) {
                Add-Diag OK "Error log is clean"
            } elseif ($netErrors -gt 50) {
                Add-Diag WARN "Error log (undated): $($parts -join ', ')" -Fix "Frequent network errors - see the network findings."
            } else {
                Add-Diag INFO "Error log (undated): $($parts -join ', ')"
            }

            # Backup sources the agent could not find - check whether they exist now.
            $missing = @($lines |
                ForEach-Object { $m = [regex]::Match($_, 'Could not stat (.+?): [^:]*\(os error [23]\)'); if ($m.Success) { $m.Groups[1].Value } } |
                Sort-Object -Unique)
            foreach ($path in $missing) {
                if (-not (Test-Path -LiteralPath $path)) {
                    Add-Diag FAIL "Backup source does not exist: $path" -Fix "Fix the path in the backup job, or whatever is supposed to create this file."
                }
            }
        } catch {
            Add-Diag SKIP "Could not read $($errLog.Name): $(Get-DiagErrorLine $_)"
        }
    }

    # --- Summary --------------------------------------------------------------
    $fails = @($script:DiagFindings | Where-Object { $_.Level -eq "FAIL" })
    $warns = @($script:DiagFindings | Where-Object { $_.Level -eq "WARN" })

    Write-Header "Summary for $($env:COMPUTERNAME)"
    if ($fails.Count -gt 0) {
        Write-Host "  Verdict: PROBLEMS FOUND - backups on this machine will fail or be unreliable." -ForegroundColor Red
    } elseif ($warns.Count -ge 3) {
        Write-Host "  Verdict: AT RISK - this machine is likely to struggle." -ForegroundColor Yellow
    } elseif ($warns.Count -gt 0) {
        Write-Host "  Verdict: MOSTLY FINE - a few things worth fixing." -ForegroundColor Yellow
    } else {
        Write-Host "  Verdict: HEALTHY - nothing found that would disturb the agent." -ForegroundColor Green
    }
    Write-Host "  $($fails.Count) problem(s), $($warns.Count) warning(s)"

    foreach ($f in ($fails + $warns)) {
        $color = if ($f.Level -eq "FAIL") { "Red" } else { "Yellow" }
        Write-Host ""
        Write-Host "  [$($f.Level)] $($f.Text)" -ForegroundColor $color
        if ($f.Fix) { Write-Host "         -> $($f.Fix)" -ForegroundColor DarkGray }
    }

    Write-Host ""
    Write-Host "  ${Gray}The live tests are a snapshot taken as the current user; the service runs as${Reset}"
    Write-Host "  ${Gray}LocalSystem. Intermittent faults show up in the $days-day history lines, not in one run.${Reset}"
}

# --- Interactive menu ---------------------------------------------------------

function Show-Menu {
    while ($true) {
        Write-Host ""
        Write-Host "  ${Gray}+-------------------------------+${Reset}"
        Write-Host "  ${Gray}|${Reset}  1)  Install service          ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  2)  Setup agent code         ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  3)  Start service            ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  4)  Stop service             ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  5)  Restart service          ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  6)  Remove service           ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  7)  Status                   ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  8)  View logs                ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  9)  Update agent             ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  10) Toggle VSS               ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  11) Diagnose (read-only)     ${Gray}|${Reset}"
        Write-Host "  ${Gray}|${Reset}  Q)  Quit                     ${Gray}|${Reset}"
        Write-Host "  ${Gray}+-------------------------------+${Reset}"
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
            "11" { Action-Diagnose }
            "Q"  { Write-Host "  Bye." -ForegroundColor DarkGray; return }
            default { Write-Warning "Unknown option: $choice" }
        }
    }
}

# --- Entry point --------------------------------------------------------------

try {

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
    "diagnose" { Action-Diagnose }
    ""        { Show-Menu     }
}

} catch {
    Write-Host ""
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  $($_.InvocationInfo.PositionMessage)" -ForegroundColor DarkGray
    Read-Host "  Press Enter to close"
    exit 1
}
