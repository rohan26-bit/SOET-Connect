# SOET Connect — Interactive Email and SMS Configuration Runner
$ErrorActionPreference = "Stop"

$pythonPath = Join-Path $PSScriptRoot "backend\venv\Scripts\python.exe"
if (-not (Test-Path $pythonPath)) {
    $pythonPath = "python"
}

$scriptPath = Join-Path $PSScriptRoot "backend\configure_notifications.py"
& $pythonPath $scriptPath $args
