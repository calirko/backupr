<#
.SYNOPSIS
    Backupr Agent installer / service manager (PowerShell 2.0 / Windows 7 fallback)

.DESCRIPTION
    Functionally identical to setup.ps1 but written for PowerShell 2.0 on Windows 7.
    Key differences from the main script:
      - No #Requires constraint
      - Uses System.Net.WebClient instead of Invoke-WebRequest (PS3+)
      - TLS 1.2 forced via integer literal (3072) - enum field may not exist in old .NET
      - JSON parsed with regex - no ConvertFrom-Json (PS3+)
      - WinSW pinned to v2.12.0 which supports .NET 4.0 (v3 requires .NET 4.6.1+)
      - No ValidateSet, no Get-Content -Raw/-Tail, no $PSCommandPath

.PARAMETER Action
    install | setup | start | stop | restart | remove | status | logs | update | vss
    If omitted, an interactive menu is shown.

.EXAMPLE
    .\setup-fallback.ps1
    .\setup-fallback.ps1 -Action install
#>

param(
    [string]$Action = ""
)

$ErrorActionPreference = "Stop"

# TLS 1.2 via integer (3072) so this works even when the Tls12 enum field is absent
# in older .NET versions shipped with Windows 7. GitHub rejects TLS 1.0/1.1.
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]3072
} catch {
    try {
        # Tls12 (3072) | Tls11 (768) combined in case 1.2 alone throws
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]3840
    } catch {
        Write-Warning "Could not enable TLS 1.2. Downloads may fail."
        Write-Warning "Install .NET 4.5 (KB2901907) or newer and re-run."
    }
}

# Script path - $PSCommandPath is PS3+; use MyInvocation at the top level
$ScriptPath = $MyInvocation.MyCommand.Path
$BootstrapUrl = "https://cdn.jsdelivr.net/gh/calirko/backupr@main/apps/agent/scripts/setup-fallback.ps1"

# Arch detection: also check PROCESSOR_ARCHITEW6432 which is set when a 32-bit
# PowerShell process runs on a 64-bit OS (WOW64 - common default on older Windows)
if ($env:PROCESSOR_ARCHITECTURE -eq "AMD64" -or $env:PROCESSOR_ARCHITEW6432 -eq "AMD64") {
    $Arch     = "x86_64"
    $WinSwArch = "x64"
    $SevenZipInstaller = "7z2409-x64.exe"
} else {
    $Arch     = "i686"
    $WinSwArch = "x86"
    $SevenZipInstaller = "7z2409.exe"
}

# --- Constants ----------------------------------------------------------------

$AgentUrl    = "https://github.com/calirko/backupr/releases/latest/download/backupr-agent-$Arch-windows.exe"
$ServiceName = "backupr-agent"
$InstallDir  = "C:\ProgramData\backupr"
$AgentExe    = Join-Path $InstallDir "backupr-agent.exe"
$ConfigFile  = Join-Path $InstallDir "backupr.conf"
$WinSwDir    = Join-Path $InstallDir "winsw"
$WinSwExe    = Join-Path $WinSwDir "winsw.exe"
# Pinned to v2.12.0: last WinSW release that supports .NET 4.0 (Windows 7 default)
# WinSW v3+ requires .NET 4.6.1 which is not available on unpatched Windows 7
$WinSwUrl    = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-$WinSwArch.exe"
$WinSwConfig = Join-Path $WinSwDir "winsw.xml"
$SevenZipDir = Join-Path $InstallDir "7zip"
$SevenZipExe = Join-Path $SevenZipDir "7z.exe"
$SevenZipUrl = "https://www.7-zip.org/a/$SevenZipInstaller"

# --- Helpers ------------------------------------------------------------------

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ("  " + "-" * $Text.Length) -ForegroundColor DarkCyan
}

function Confirm-Admin {
    $id        = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Warning "This script requires Administrator privileges."
        Write-Host "Relaunching as Administrator..." -ForegroundColor Yellow
        if ($ScriptPath) {
            # Running from a saved .ps1 file - relaunch that file directly.
            $argList = "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
            if ($Action) { $argList += " -Action `"$Action`"" }
        } else {
            # Running via `iex $wc.DownloadString(...)` - there is no on-disk script to point
            # -File at ($ScriptPath is $null), so re-run the same bootstrap download instead.
            $cmd = "`$Action = '$Action'; `$wc2 = New-Object System.Net.WebClient; " +
                "iex `$wc2.DownloadString('$BootstrapUrl')"
            $argList = "-NoExit -NoProfile -ExecutionPolicy Bypass -EncodedCommand " +
                [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
        }
        Start-Process powershell -Verb RunAs -ArgumentList $argList
        exit
    }
}

# WebClient download helper - Invoke-WebRequest is PS3+
function Download-File {
    param([string]$Url, [string]$Dest)
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($Url, $Dest)
}

function Ensure-WinSwPresent {
    if (Test-Path $WinSwExe) { return }
    Write-Host "  Downloading WinSW..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $WinSwDir | Out-Null
    Download-File $WinSwUrl $WinSwExe
    Write-Host "  WinSW saved to $WinSwExe" -ForegroundColor Green
}

function Write-WinSwConfig {
    param([string]$StartMode)
    if (-not $StartMode) { $StartMode = "Manual" }
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
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Write-Host "  Downloading backupr-agent.exe..." -ForegroundColor Yellow
    Download-File $AgentUrl $AgentExe
    Write-Host "  Agent binary saved to $AgentExe" -ForegroundColor Green
}

function Ensure-SevenZipPresent {
    if (Test-Path $SevenZipExe) { return }
    Write-Host "  Downloading 7-Zip..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $SevenZipDir | Out-Null
    $installer = Join-Path $env:TEMP "7z-setup.exe"
    Download-File $SevenZipUrl $installer
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
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    return ($null -ne $svc)
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

    if ($code -eq "") {
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
        Write-Host "  Setup complete. Start the service with: .\setup-fallback.ps1 -Action start" -ForegroundColor Cyan
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
    if ($svc.Status -eq "Running") {
        Write-Host "  Service status: $($svc.Status)" -ForegroundColor Green
    } else {
        Write-Host "  Service status: $($svc.Status)" -ForegroundColor Yellow
    }
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

    if (Test-Path $ConfigFile) { $cfgStr = $ConfigFile } else { $cfgStr = "(not found)" }
    if (Test-Path $AgentExe)   { $exeStr = $AgentExe   } else { $exeStr = "(not found)" }
    if (Test-Path $WinSwExe)   { $swStr  = $WinSwExe   } else { $swStr  = "(not found)" }
    if (Test-Path $SevenZipExe){ $7zStr  = $SevenZipExe} else { $7zStr  = "(not found)" }

    Write-Host "  Install dir : $InstallDir"
    Write-Host "  Config file : $cfgStr"
    Write-Host "  Agent binary: $exeStr"
    Write-Host "  WinSW       : $swStr"
    Write-Host "  7-Zip       : $7zStr"

    if (Get-ServiceExists) {
        $svc = Get-Service -Name $ServiceName
        if ($svc.Status -eq "Running") {
            Write-Host "  Service     : $($svc.Status)" -ForegroundColor Green
        } elseif ($svc.Status -eq "Stopped") {
            Write-Host "  Service     : $($svc.Status)" -ForegroundColor Red
        } else {
            Write-Host "  Service     : $($svc.Status)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  Service     : not installed" -ForegroundColor DarkGray
    }
}

function Action-Logs {
    Write-Header "Backupr Agent logs"

    $logFiles = Get-ChildItem -Path $InstallDir -Filter "*.log" -ErrorAction SilentlyContinue
    if ($logFiles) {
        $logFiles = @($logFiles | Sort-Object LastWriteTime -Descending)
    }

    if (-not $logFiles) {
        Write-Host "  No log files found in $InstallDir" -ForegroundColor DarkGray
        return
    }

    Write-Host "  Found $($logFiles.Count) log file(s) in $InstallDir" -ForegroundColor Cyan
    Write-Host ""

    foreach ($file in $logFiles) {
        if ($file.Length -ge 1048576) {
            $size = "{0:N1} MB" -f ($file.Length / 1048576)
        } elseif ($file.Length -ge 1024) {
            $size = "{0:N1} KB" -f ($file.Length / 1024)
        } else {
            $size = "$($file.Length) B"
        }
        Write-Host ("  {0,-40} {1,8}   {2}" -f $file.Name, $size, $file.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"))
    }

    Write-Host ""
    $choice = Read-Host "  Enter a log filename to tail (or press Enter to skip)"
    $choice = $choice.Trim()
    if ($choice -eq "") { return }

    $target = Join-Path $InstallDir $choice
    if (-not (Test-Path $target)) {
        Write-Warning "File not found: $target"
        return
    }

    Write-Host ""
    Write-Host "  --- Last 50 lines of $choice ---" -ForegroundColor DarkCyan
    # Get-Content -Tail is PS3+; Select-Object -Last works in PS2
    Get-Content $target | Select-Object -Last 50 | ForEach-Object { Write-Host "  $_" }
    Write-Host "  --- end ---" -ForegroundColor DarkCyan
}

function Action-Vss {
    Write-Header "VSS (Volume Shadow Copy) toggle"

    if (-not (Test-Path $ConfigFile)) {
        Write-Warning "Config file not found at $ConfigFile. Run 'setup' first."
        return
    }

    # ConvertFrom-Json is PS3+; read the value with regex instead
    $content = [System.IO.File]::ReadAllText($ConfigFile)
    if ($content -match '"vssEnabled"\s*:\s*true') {
        $current = $true
    } elseif ($content -match '"vssEnabled"\s*:\s*false') {
        $current = $false
    } else {
        $current = $true
    }

    if ($current) { $label = "enabled" } else { $label = "disabled" }
    Write-Host "  VSS is currently: $label" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1) Enable VSS  (default - consistent snapshots)"
    Write-Host "  2) Disable VSS (live file copy - use if AV/EDR kills the service during backup)"
    Write-Host ""
    $choice = (Read-Host "  Choose (1/2, Enter to cancel)").Trim()

    if ($choice -eq "1") { $newValue = $true }
    elseif ($choice -eq "2") { $newValue = $false }
    else {
        Write-Host "  Cancelled." -ForegroundColor DarkGray
        return
    }

    if ($newValue -eq $current) {
        Write-Host "  No change." -ForegroundColor DarkGray
        return
    }

    if ($newValue) { $newValueStr = "true" } else { $newValueStr = "false" }

    # Replace existing value, or inject before closing brace if key is absent
    if ($content -match '"vssEnabled"\s*:\s*(true|false)') {
        $newContent = [System.Text.RegularExpressions.Regex]::Replace(
            $content,
            '"vssEnabled"\s*:\s*(true|false)',
            """vssEnabled"": $newValueStr"
        )
    } else {
        $newContent = [System.Text.RegularExpressions.Regex]::Replace(
            $content,
            '}\s*$',
            ", ""vssEnabled"": $newValueStr}"
        )
    }

    [System.IO.File]::WriteAllText($ConfigFile, $newContent, [System.Text.Encoding]::UTF8)

    if ($newValue) { $newLabel = "enabled" } else { $newLabel = "disabled" }
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

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

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

    $backup = $null
    if (Test-Path $AgentExe) {
        $backup = "$AgentExe.bak"
        Copy-Item $AgentExe $backup -Force
        Write-Host "  Backed up existing binary to $backup" -ForegroundColor DarkGray
    }

    $updateOk = $false
    try {
        Write-Host "  Downloading latest backupr-agent.exe..." -ForegroundColor Yellow
        Download-File $AgentUrl $AgentExe
        Write-Host "  Agent updated at $AgentExe" -ForegroundColor Green
        if ($null -ne $backup -and (Test-Path $backup)) {
            Remove-Item $backup -Force
        }
        $updateOk = $true
    } catch {
        Write-Warning "Download failed: $_"
        if ($null -ne $backup -and (Test-Path $backup)) {
            Copy-Item $backup $AgentExe -Force
            Remove-Item $backup -Force
            Write-Host "  Rolled back to previous binary." -ForegroundColor Yellow
        }
    }

    if (-not $updateOk) {
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
        Write-Host "  | 10) Toggle VSS               |"
        Write-Host "  |  Q) Quit                     |"
        Write-Host "  +------------------------------+" -ForegroundColor Cyan
        Write-Host ""
        $choice = (Read-Host "  Choose an option").ToUpper()

        if     ($choice -eq "1")  { Action-Install }
        elseif ($choice -eq "2")  { Action-Setup   }
        elseif ($choice -eq "3")  { Action-Start   }
        elseif ($choice -eq "4")  { Action-Stop    }
        elseif ($choice -eq "5")  { Action-Restart }
        elseif ($choice -eq "6")  { Action-Remove  }
        elseif ($choice -eq "7")  { Action-Status  }
        elseif ($choice -eq "8")  { Action-Logs    }
        elseif ($choice -eq "9")  { Action-Update  }
        elseif ($choice -eq "10") { Action-Vss     }
        elseif ($choice -eq "Q")  { Write-Host "  Bye." -ForegroundColor DarkGray; return }
        else { Write-Warning "Unknown option: $choice" }
    }
}

# --- Entry point --------------------------------------------------------------

try {

Confirm-Admin

$actionLower = $Action.ToLower()
if     ($actionLower -eq "install") { Action-Install }
elseif ($actionLower -eq "setup")   { Action-Setup   }
elseif ($actionLower -eq "start")   { Action-Start   }
elseif ($actionLower -eq "stop")    { Action-Stop    }
elseif ($actionLower -eq "restart") { Action-Restart }
elseif ($actionLower -eq "remove")  { Action-Remove  }
elseif ($actionLower -eq "status")  { Action-Status  }
elseif ($actionLower -eq "logs")    { Action-Logs    }
elseif ($actionLower -eq "update")  { Action-Update  }
elseif ($actionLower -eq "vss")     { Action-Vss     }
elseif ($actionLower -eq "")        { Show-Menu      }
else {
    Write-Warning "Unknown action: '$Action'. Valid: install, setup, start, stop, restart, remove, status, logs, update, vss"
}

} catch {
    Write-Host ""
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  $($_.InvocationInfo.PositionMessage)" -ForegroundColor DarkGray
    Read-Host "  Press Enter to close"
    exit 1
}
