#Requires -Version 5.1
<#
.SYNOPSIS
    Bootstrap helper for Backupr Agent installer
    
.DESCRIPTION
    This helper script solves TLS/SSL issues on older Windows servers.
    It configures PowerShell to accept modern TLS protocols and downloads the main installer.
    
.EXAMPLE
    iex (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/calirko/backupr/refs/heads/main/apps/agent/scripts/install-helper.ps1')
#>

Write-Host "Backupr Agent Installer Bootstrap" -ForegroundColor Cyan
Write-Host ""

# Try multiple TLS configurations for maximum compatibility
try {
    Write-Host "Configuring TLS support..." -ForegroundColor Yellow
    
    # First try: TLS 1.2 + 1.3
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    if ([Net.SecurityProtocolType].GetMember('Tls13')) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
    }
    
    Write-Host "Downloading installer..." -ForegroundColor Yellow
    
    # Use WebClient for better compatibility
    $client = New-Object System.Net.WebClient
    $script = $client.DownloadString('https://raw.githubusercontent.com/calirko/backupr/refs/heads/main/apps/agent/scripts/install.ps1')
    
    Write-Host "Executing installer..." -ForegroundColor Green
    Invoke-Expression $script
}
catch {
    Write-Error "Failed to download installer: $_"
    Write-Host ""
    Write-Host "Troubleshooting steps:" -ForegroundColor Yellow
    Write-Host "1. Ensure your server has internet access"
    Write-Host "2. Check if GitHub is accessible: (New-Object System.Net.WebClient).DownloadString('https://github.com')"
    Write-Host "3. Verify TLS support: [Net.ServicePointManager]::SecurityProtocol"
    Write-Host "4. Consider updating Windows and PowerShell"
    exit 1
}
