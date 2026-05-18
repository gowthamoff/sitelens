param (
    [string]$Region = "",
    [string]$StackName = "",
    [string]$RepositoryUri = "",
    [string]$DbHost = "",
    [string]$DbPort = "",
    [string]$DbName = "",
    [string]$DbUser = "",
    [string]$DbPass = "",
    [string]$GooglePlacesKey = ""
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
if ([string]::IsNullOrEmpty($RepositoryUri)) { $RepositoryUri = $env:ECR_REPO_BACKEND }
if ([string]::IsNullOrEmpty($DbHost)) { $DbHost = $env:RDS_HOST }
if ([string]::IsNullOrEmpty($DbPort)) { $DbPort = $(if ($env:RDS_PORT) { $env:RDS_PORT } else { "5432" }) }
if ([string]::IsNullOrEmpty($DbName)) { $DbName = $env:RDS_DB }
if ([string]::IsNullOrEmpty($DbUser)) { $DbUser = $env:RDS_USER }
if ([string]::IsNullOrEmpty($DbPass)) { $DbPass = $env:RDS_PASS }
if ([string]::IsNullOrEmpty($GooglePlacesKey)) { $GooglePlacesKey = $env:GOOGLE_PLACES_KEY }

if ([string]::IsNullOrEmpty($RepositoryUri)) {
    Write-Host "ERROR: ECR_REPO_BACKEND not found in .env!" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrEmpty($DbHost)) {
    Write-Host "ERROR: RDS_HOST not found in .env!" -ForegroundColor Red
    exit 1
}

# 1. Login to ECR
Write-Host "Logging into AWS ECR..." -ForegroundColor Cyan
# Extract registry root (the part before the first '/')
$RegistryRoot = $RepositoryUri.Split('/')[0]
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $RegistryRoot

# 2. Build Image
Write-Host "Building Docker Image..." -ForegroundColor Cyan

# Logic to find the correct build context
if (Test-Path "./package.json") {
    # We are in the server folder
    docker build -t site-analysis .
} else {
    # We are in the root folder
    docker build -t site-analysis ./server
}

# 3. Tag Image
Write-Host "Tagging Image..." -ForegroundColor Cyan
docker tag site-analysis:latest "${RepositoryUri}:latest"

# 4. Push Image
Write-Host "Pushing Image to ECR..." -ForegroundColor Cyan
docker push "${RepositoryUri}:latest"

# 5. Remote Update via SSM (The Automation Step)
Write-Host "`nAutomation: Triggering Remote Update on EC2..." -ForegroundColor Yellow

# Find Instance ID by Stack Name Tag
$InstanceId = (aws ec2 describe-instances --filters "Name=tag:Name,Values=$StackName-AppServer" "Name=instance-state-name,Values=running" --query "Reservations[0].Instances[0].InstanceId" --output text --region $Region)

if ($InstanceId -eq "None" -or [string]::IsNullOrEmpty($InstanceId)) {
    Write-Host "Error: Could not find a running EC2 instance with tag Name=$StackName-AppServer" -ForegroundColor Red
    exit 1
}

Write-Host "Targeting Instance: $InstanceId" -ForegroundColor Cyan

$RemoteCommands = @(
    "aws ecr get-login-password --region $Region | sudo docker login --username AWS --password-stdin $RepositoryUri",
    "sudo docker pull ${RepositoryUri}:latest",
    "sudo docker stop site-analysis-api || true",
    "sudo docker rm site-analysis-api || true",
    "sudo docker rmi `$(sudo docker images -f dangling=true -q) || true",
    "sudo docker run -d -p 8080:8080 --name site-analysis-api --restart unless-stopped -e NODE_ENV=production -e DB_TARGET=rds -e RDS_HOST=$DbHost -e RDS_PORT=5432 -e RDS_DB=$DbName -e RDS_USER=$DbUser -e RDS_PASS='$DbPass' -e PORT=8080 -e NDVI_SERVICE_URL=http://localhost:8000 -e GOOGLE_PLACES_KEY='$GooglePlacesKey' ${RepositoryUri}:latest"
)

# Convert commands to JSON for safe passing
$ParamsJson = @{
    commands = $RemoteCommands
} | ConvertTo-Json -Compress

# Save to temp file to avoid CLI quoting hell
$TempFile = "$env:TEMP\ssm-params-$([guid]::NewGuid().Guid).json"
$ParamsJson | Set-Content -Path $TempFile

# Use file:// syntax which is the standard way to pass JSON to AWS CLI
$CommandId = (aws ssm send-command --instance-ids $InstanceId --document-name "AWS-RunShellScript" --parameters "file://$TempFile" --query "Command.CommandId" --output text --region $Region)
Remove-Item $TempFile

Write-Host "SSM Command Sent (ID: $CommandId). Waiting for completion..." -ForegroundColor Cyan

# Wait for command to finish
$Status = "Pending"
while ($Status -in @("Pending", "InProgress")) {
    Start-Sleep -Seconds 5
    $Status = (aws ssm list-command-invocations --command-id $CommandId --instance-id $InstanceId --query "CommandInvocations[0].Status" --output text --region $Region)
    Write-Host "Current Status: $Status..."
}

if ($Status -eq "Success") {
    Write-Host "SUCCESS: Remote deployment completed!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Remote deployment failed with status $Status" -ForegroundColor Red
    Write-Host "Check AWS SSM console for details."
}

Write-Host "`nDone! Deployment Pipeline Finished." -ForegroundColor Green
