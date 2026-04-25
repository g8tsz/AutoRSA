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

$pip = Join-Path $venv "Scripts\pip.exe"
$python = Join-Path $venv "python.exe"
& $pip install -U pip
& $pip install -r (Join-Path $here "requirements.txt")
Write-Host "Installing Playwright browser deps (if required by brokers)..." -ForegroundColor Cyan
& $python -m playwright install
$exe = Join-Path $venv "Scripts\auto_rsa_bot.exe"
if (Test-Path $exe) {
    Write-Host "OK: $exe" -ForegroundColor Green
} else {
    Write-Warning "auto_rsa_bot.exe not found. The package requires Python 3.12+; see pip output above."
}
