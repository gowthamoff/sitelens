# ─────────────────────────────────────────────────────────────────────────────
# SiteLens — deploy the Python Lambda backend (replaces scripts/deploy-backend.ps1).
#
# Reads secrets from environment variables so nothing sensitive is committed:
#   $env:RDS_HOST  $env:RDS_DB  $env:RDS_USER  $env:RDS_PASS
#   $env:JWT_SECRET  $env:GOOGLE_PLACES_KEY (optional)  $env:ALLOWED_ORIGIN (optional)
#
# Usage:
#   cd backend-py
#   ./deploy.ps1                 # build (in container) + deploy
#   ./deploy.ps1 -GuidedFirst    # run `sam deploy --guided` once to create samconfig
#
# Requires: AWS SAM CLI + Docker Desktop running (for --use-container).
# ─────────────────────────────────────────────────────────────────────────────
param(
  [switch]$GuidedFirst,
  [string]$StackName = "sitelens-backend",
  [string]$Region    = $env:AWS_REGION
)

$ErrorActionPreference = "Stop"
if (-not $Region) { $Region = "ap-south-1" }

function Need($name) {
  $val = [Environment]::GetEnvironmentVariable($name)
  if (-not $val) { throw "Missing required env var: $name" }
  return $val
}

$rdsHost = Need "RDS_HOST"
$rdsDb   = Need "RDS_DB"
$rdsUser = if ($env:RDS_USER) { $env:RDS_USER } else { "postgres" }
$rdsPass = Need "RDS_PASS"
$jwt     = Need "JWT_SECRET"
$gkey    = if ($env:GOOGLE_PLACES_KEY) { $env:GOOGLE_PLACES_KEY } else { "" }
$origin  = if ($env:ALLOWED_ORIGIN)    { $env:ALLOWED_ORIGIN }    else { "*" }

Write-Host "==> sam build --use-container" -ForegroundColor Cyan
sam build --use-container

$overrides = @(
  "RdsHost=$rdsHost",
  "RdsDb=$rdsDb",
  "RdsUser=$rdsUser",
  "RdsPass=$rdsPass",
  "JwtSecret=$jwt",
  "GooglePlacesKey=$gkey",
  "AllowedOrigin=$origin"
) -join " "

if ($GuidedFirst) {
  Write-Host "==> sam deploy --guided" -ForegroundColor Cyan
  sam deploy --guided --stack-name $StackName --region $Region `
    --capabilities CAPABILITY_IAM --parameter-overrides $overrides
} else {
  Write-Host "==> sam deploy" -ForegroundColor Cyan
  sam deploy --stack-name $StackName --region $Region `
    --capabilities CAPABILITY_IAM --no-confirm-changeset `
    --parameter-overrides $overrides
}
