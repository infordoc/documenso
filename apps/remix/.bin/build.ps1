# Exit on error
$ErrorActionPreference = "Stop"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$WEB_APP_DIR = Join-Path $SCRIPT_DIR ".."

# Store the original directory
$ORIGINAL_DIR = Get-Location

try {
    Set-Location $WEB_APP_DIR

    $start_time = Get-Date

    Write-Host "[Build]: Extracting and compiling translations"
    npm run translate --prefix ../../

    Write-Host "[Build]: Building app"
    npm run build:app

    Write-Host "[Build]: Building server"
    npm run build:server

    # Copy over the entry point for the server.
    Copy-Item server/main.js build/server/main.js -Force

    # Copy over all web.js translations
    Copy-Item -Path ../../packages/lib/translations -Destination build/server/hono/packages/lib/translations -Recurse -Force

    # Time taken
    $end_time = Get-Date
    $duration = ($end_time - $start_time).TotalSeconds

    Write-Host "[Build]: Done in $([math]::Round($duration)) seconds"
}
finally {
    # Ensure we return to original directory
    Set-Location $ORIGINAL_DIR
}
