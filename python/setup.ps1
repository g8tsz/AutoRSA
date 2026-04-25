<#
  This is a PowerShell *script* — opening it in Notepad or VS Code only shows text.
  To RUN the installer on Windows, either:
    - Double-click setup.bat in this same folder, or
    - Open PowerShell, cd here, then:  .\setup.ps1
    If you get "running scripts is disabled", use:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
#>
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$venv = Join-Path $here "venv"

if (-not (Test-Path $venv)) {
    $made = $false
    if (Get-Command py -ErrorAction SilentlyContinue) {
        foreach ($ver in @("3.12", "3.13", "3.11")) {
            $null = & py "-$ver" -c "import sys" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Creating venv with py -$ver" -ForegroundColor Cyan
                & py "-$ver" -m venv $venv
                $made = $true
                break
            }
        }
    }
    if (-not $made) {
        if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
            Write-Error "Install Python 3.12+ from https://www.python.org/downloads/windows/"
        }
        Write-Host "Creating venv with python on PATH" -ForegroundColor Cyan
        & python -m venv $venv
    }
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create venv" }
}

# Windows venv puts python.exe in Scripts\; Unix/macOS use bin\python (not venv\python.exe).
$python = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = Join-Path $venv "bin\python"
}
if (-not (Test-Path $python)) {
    Write-Error "Could not find venv Python at Scripts\python.exe or bin\python. Delete the venv folder and run this script again."
}
# Use "python -m pip" so upgrading pip does not hit "To modify pip, please run …" on Windows.
& $python -m pip install -U pip
& $python -m pip install -r (Join-Path $here "requirements.txt")
Write-Host "Installing Playwright browser deps (if required by brokers)..." -ForegroundColor Cyan
& $python -m playwright install

# Always ship a Windows launcher so the path is a normal runnable file even if pip
# skips or removes the console-script .exe (AV, partial install, etc.).
$cmdPath = Join-Path $venv "Scripts\auto_rsa_bot.cmd"
$pyAbs = (Resolve-Path $python).Path
@(
    '@echo off',
    "set PYTHONUNBUFFERED=1",
    "call `"$pyAbs`" -m auto_rsa_bot %*"
) | Set-Content -Path $cmdPath -Encoding ascii

$exe = Join-Path $venv "Scripts\auto_rsa_bot.exe"
if (Test-Path $exe) {
    Write-Host "OK: $exe" -ForegroundColor Green
} elseif (Test-Path $cmdPath) {
    Write-Host "OK: $cmdPath (runs python -m auto_rsa_bot)" -ForegroundColor Green
} else {
    Write-Warning "auto_rsa_bot launcher not found. The package requires Python 3.12+; see pip output above."
}
