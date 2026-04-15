# Remove-Backupr.ps1
# Completely removes Backupr and all associated files from Windows
# Run as Administrator for best results

param(
    [switch]$Force  # Skip confirmation prompts
)

$ErrorActionPreference = "SilentlyContinue"
$appName = "Backupr"
$appId   = "com.backupr.app"

function Write-Step  { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Done  { param($msg) Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Skip  { param($msg) Write-Host "   [--] $msg" -ForegroundColor DarkGray }
function Write-Warn  { param($msg) Write-Host "   [!!] $msg" -ForegroundColor Yellow }

# ─── Confirm ────────────────────────────────────────────────────────────────
if (-not $Force) {
    Write-Host "`n================================================" -ForegroundColor Red
    Write-Host "  This will COMPLETELY remove $appName from your PC." -ForegroundColor Red
    Write-Host "  All app data, settings, and cache will be deleted." -ForegroundColor Red
    Write-Host "================================================`n" -ForegroundColor Red
    $confirm = Read-Host "Type YES to continue"
    if ($confirm -ne "YES") { Write-Host "Aborted." -ForegroundColor Yellow; exit 0 }
}

# ─── 1. Kill running processes ───────────────────────────────────────────────
Write-Step "Stopping running $appName processes..."
$killed = $false
Get-Process | Where-Object { $_.Name -match "(?i)backupr" -or $_.MainWindowTitle -match "(?i)backupr" } | ForEach-Object {
    Stop-Process -Id $_.Id -Force
    Write-Done "Killed process: $($_.Name) (PID $($_.Id))"
    $killed = $true
}
if (-not $killed) { Write-Skip "No running processes found." }

Start-Sleep -Seconds 1

# ─── 2. Run official uninstaller (NSIS) ─────────────────────────────────────
Write-Step "Looking for official NSIS uninstaller..."

$uninstallerPaths = @(
    "$env:LOCALAPPDATA\Programs\$appName\Uninstall $appName.exe",
    "$env:ProgramFiles\$appName\Uninstall $appName.exe",
    "${env:ProgramFiles(x86)}\$appName\Uninstall $appName.exe",
    "$env:LOCALAPPDATA\$appName\Uninstall $appName.exe"
)

$uninstallerRan = $false
foreach ($path in $uninstallerPaths) {
    if (Test-Path $path) {
        Write-Done "Found: $path"
        Start-Process -FilePath $path -ArgumentList "/S" -Wait   # /S = silent
        Write-Done "Uninstaller finished."
        $uninstallerRan = $true
        break
    }
}
if (-not $uninstallerRan) { Write-Skip "No official uninstaller found (continuing with manual removal)." }

Start-Sleep -Seconds 2

# ─── 3. Remove installation directories ─────────────────────────────────────
Write-Step "Removing installation directories..."

$installDirs = @(
    # Standard install locations
    "$env:LOCALAPPDATA\Programs\$appName",
    "$env:ProgramFiles\$appName",
    "${env:ProgramFiles(x86)}\$appName",
    "$env:LOCALAPPDATA\$appName",
    # Electron-builder squirrel / portable leftovers
    "$env:LOCALAPPDATA\backupr",
    "$env:LOCALAPPDATA\Backupr"
)

foreach ($dir in $installDirs) {
    if (Test-Path $dir) {
        Remove-Item -Path $dir -Recurse -Force
        Write-Done "Deleted: $dir"
    } else {
        Write-Skip "Not found: $dir"
    }
}

# ─── 4. Remove app data directories ─────────────────────────────────────────
Write-Step "Removing app data (userData, cache, logs)..."

$dataDirs = @(
    # Electron stores userData here by default (appId or productName)
    "$env:APPDATA\$appName",
    "$env:APPDATA\$appId",
    "$env:APPDATA\backupr",
    "$env:LOCALAPPDATA\$appName",
    "$env:LOCALAPPDATA\$appId",
    # Electron cache
    "$env:LOCALAPPDATA\$appName\Cache",
    "$env:LOCALAPPDATA\$appName\Code Cache",
    "$env:LOCALAPPDATA\$appName\GPUCache",
    # Temp files
    "$env:TEMP\$appName",
    "$env:TEMP\backupr"
)

foreach ($dir in $dataDirs) {
    if (Test-Path $dir) {
        Remove-Item -Path $dir -Recurse -Force
        Write-Done "Deleted: $dir"
    } else {
        Write-Skip "Not found: $dir"
    }
}

# ─── 5. Remove registry entries ─────────────────────────────────────────────
Write-Step "Cleaning registry..."

$regPaths = @(
    # Uninstall keys
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$appName",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$appName",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$appId",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$appId",
    # App settings stored by Electron / electron-store
    "HKCU:\Software\$appName",
    "HKCU:\Software\$appId",
    "HKCU:\Software\Electron\$appName",
    # Squirrel (used by some electron-builder setups)
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\backupr"
)

foreach ($key in $regPaths) {
    if (Test-Path $key) {
        Remove-Item -Path $key -Recurse -Force
        Write-Done "Removed registry key: $key"
    } else {
        Write-Skip "Not found: $key"
    }
}

# ─── 6. Remove Start Menu shortcuts ─────────────────────────────────────────
Write-Step "Removing Start Menu shortcuts..."

$shortcutPaths = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\$appName",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\$appName.lnk",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\$appName",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\$appName.lnk"
)

foreach ($sc in $shortcutPaths) {
    if (Test-Path $sc) {
        Remove-Item -Path $sc -Recurse -Force
        Write-Done "Removed: $sc"
    } else {
        Write-Skip "Not found: $sc"
    }
}

# ─── 7. Remove Desktop shortcut ─────────────────────────────────────────────
Write-Step "Removing Desktop shortcut..."

$desktopShortcuts = @(
    "$env:PUBLIC\Desktop\$appName.lnk",
    "$env:USERPROFILE\Desktop\$appName.lnk"
)

foreach ($sc in $desktopShortcuts) {
    if (Test-Path $sc) {
        Remove-Item -Path $sc -Force
        Write-Done "Removed: $sc"
    } else {
        Write-Skip "Not found: $sc"
    }
}

# ─── 8. Scan for any remaining files (extra safety net) ─────────────────────
Write-Step "Scanning for any remaining Backupr files..."

$scanRoots = @(
    $env:LOCALAPPDATA,
    $env:APPDATA,
    $env:TEMP
)

foreach ($root in $scanRoots) {
    Get-ChildItem -Path $root -Filter "*backupr*" -Recurse -Force 2>$null | ForEach-Object {
        Remove-Item -Path $_.FullName -Recurse -Force
        Write-Warn "Extra file removed: $($_.FullName)"
    }
}

# ─── Done ────────────────────────────────────────────────────────────────────
Write-Host "`n================================================" -ForegroundColor Green
Write-Host "  $appName has been completely removed." -ForegroundColor Green
Write-Host "  You can now install the fresh version." -ForegroundColor Green
Write-Host "================================================`n" -ForegroundColor Green
