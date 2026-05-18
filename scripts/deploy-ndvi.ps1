<#
.SYNOPSIS
  Deploys the NDVI Python service to ECR and restarts it on EC2 via SSM.

.DESCRIPTION
  This script mirrors deploy-backend.ps1 but is tailored for the Python NDVI service.
  It builds from ./ndvi-service (uses GDAL base image, takes longer than Node.js builds).

.PARAMETER Region
  AWS region. Defaults to ap-south-1.

.PARAMETER StackName
  CloudFormation stack name used to find the EC2 instance by tag.
  Defaults to site-analysis-bend.

.EXAMPLE
  # From repo root or server folder:
  npm run deploy:ndvi

  # Or directly:
  powershell -ExecutionPolicy Bypass -File ./scripts/deploy-ndvi.ps1
#>
param (
    [string]$Region = "",
    [string]$StackName = ""
)

# Try to load .env file from server folder
$EnvPath = Join-Path $PSScriptRoot "..\server\.env"
if (Test-Path $EnvPath) {
    Write-Host "Loading variables from $EnvPath" -ForegroundColor Cyan
    Get-Content $EnvPath | Where-Object { $_ -match '^\s*[^#]' -and $_ -match '=' } | ForEach-Object {
        $name, $value = $_.Split('=', 2)
        [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim())
    }
}

# Apply SSOT values from .env if not passed via param
if ([string]::IsNullOrEmpty($Region)) { $Region = $env:AWS_REGION }
if ([string]::IsNullOrEmpty($StackName)) { $StackName = $env:CF_STACK_NAME }

# ── Known constants (no need to parameterize these) ─────────────────────────
$NdviRepoUri  = $env:ECR_REPO_NDVI
# Extract account ID and ECR base from the repo URI
$EcrBase = ""
if (![string]::IsNullOrEmpty($NdviRepoUri)) {
    $EcrBase = $NdviRepoUri.Substring(0, $NdviRepoUri.IndexOf('/'))
}

if ([string]::IsNullOrEmpty($NdviRepoUri)) {
    Write-Host "ERROR: ECR_REPO_NDVI not found in .env!" -ForegroundColor Red
    exit 1
}

# Find Instance ID by Stack Name Tag
$InstanceId = (aws ec2 describe-instances --filters "Name=tag:Name,Values=$StackName-AppServer" "Name=instance-state-name,Values=running" --query "Reservations[0].Instances[0].InstanceId" --output text --region $Region)

if ($InstanceId -eq "None" -or [string]::IsNullOrEmpty($InstanceId)) {
    Write-Host "Error: Could not find a running EC2 instance with tag Name=$StackName-AppServer" -ForegroundColor Red
    exit 1
}


# ── Helper ──────────────────────────────────────────────────────────────────
function Step($msg) { Write-Host "`n[$msg]" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK $msg"  -ForegroundColor Green }
function Err($msg)  { Write-Host "  ERR $msg" -ForegroundColor Red; exit 1 }

# ─────────────────────────────────────────────────────────────────────────────
# PHASE B-1 — Login to ECR
# ─────────────────────────────────────────────────────────────────────────────
Step "1/4  Logging into AWS ECR"
$EcrPass = (aws ecr get-login-password --region $Region)
docker login --username AWS --password $EcrPass $EcrBase
if ($LASTEXITCODE -ne 0) { Err "ECR login failed" }
Ok "Logged in to $EcrBase"

# ─────────────────────────────────────────────────────────────────────────────
# PHASE B-2 — Build the NDVI Docker image
# NOTE: The GDAL base image (~1.5 GB) makes the first build slow (~5-10 min).
# Subsequent builds use Docker layer cache and are much faster.
# ─────────────────────────────────────────────────────────────────────────────
Step "2/4  Building NDVI Docker image (first build may take 5-10 min)"

# Find ndvi-service folder — works whether you run from repo root or /server
if (Test-Path "./ndvi-service/Dockerfile") {
    $BuildContext = "./ndvi-service"
} elseif (Test-Path "../ndvi-service/Dockerfile") {
    $BuildContext = "../ndvi-service"
} else {
    Err "Cannot find ndvi-service/Dockerfile. Run from repo root."
}

docker build -t ndvi-service $BuildContext
if ($LASTEXITCODE -ne 0) { Err "Docker build failed" }
Ok "Image built: ndvi-service:latest"

# ─────────────────────────────────────────────────────────────────────────────
# PHASE B-3 — Tag and push to ECR
# ─────────────────────────────────────────────────────────────────────────────
Step "3/4  Tagging and pushing to ECR"
docker tag ndvi-service:latest "${NdviRepoUri}:latest"
docker push "${NdviRepoUri}:latest"
if ($LASTEXITCODE -ne 0) { Err "Docker push failed" }
Ok "Pushed to: $NdviRepoUri"

# ─────────────────────────────────────────────────────────────────────────────
# PHASE D — Remote deploy via SSM (no SSH needed)
# Pulls latest image, stops old container, starts fresh one on port 8000.
# Port 8000 is internal-only — Node.js proxies to it. ALB never sees it.
# ─────────────────────────────────────────────────────────────────────────────
Step "4/4  Deploying on EC2 via SSM (Instance: $InstanceId)"

$RemoteCommands = @(
    "aws ecr get-login-password --region $Region | sudo docker login --username AWS --password-stdin $EcrBase",
    "sudo docker pull ${NdviRepoUri}:latest",
    "sudo docker stop ndvi-service 2>/dev/null || true",
    "sudo docker rm   ndvi-service 2>/dev/null || true",
    "sudo docker run -d -p 8000:8000 --name ndvi-service --restart unless-stopped --memory=1800m -e PYTHONUNBUFFERED=1 ${NdviRepoUri}:latest",
    "sudo docker ps --filter name=ndvi-service --format 'Status: {{.Status}}'"
)

$CommandId = (aws ssm send-command `
    --instance-ids $InstanceId `
    --document-name "AWS-RunShellScript" `
    --parameters "commands=['$($RemoteCommands -join "','")']" `
    --query "Command.CommandId" `
    --output text `
    --region $Region)

if ([string]::IsNullOrEmpty($CommandId) -or $CommandId -eq "None") {
    Err "SSM command failed to send. Check IAM permissions."
}

Write-Host "  SSM Command ID: $CommandId  (waiting...)" -ForegroundColor Yellow

# Poll until done
$Status = "Pending"
while ($Status -in @("Pending", "InProgress")) {
    Start-Sleep -Seconds 5
    $Status = (aws ssm list-command-invocations `
        --command-id $CommandId `
        --instance-id $InstanceId `
        --query "CommandInvocations[0].Status" `
        --output text `
        --region $Region)
    Write-Host "    → $Status"
}

if ($Status -eq "Success") {
    Ok "Remote deployment completed!"
    Write-Host ""
    Write-Host "  NDVI service is live at http://EC2-internal:8000" -ForegroundColor Green
    Write-Host "  Node.js proxies: POST /api/ndvi/snapshot → :8000/ndvi/snapshot" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Verify with:" -ForegroundColor Yellow
    Write-Host "    aws ssm start-session --target $InstanceId --region $Region"
    Write-Host "    sudo docker logs ndvi-service --tail 30"
} else {
    Write-Host ""
    Err "Deployment failed (status=$Status). Check SSM Run Command in AWS Console."
}

Write-Host "`n[DONE] NDVI Deploy Pipeline Finished.`n" -ForegroundColor Green
