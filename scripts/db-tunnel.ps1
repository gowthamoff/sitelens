param (
    [string]$StackName = "",
    [string]$RdsHost = "",
    [string]$RemotePort = "",
    [string]$LocalPort = "",
    [string]$Region = ""
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
if ([string]::IsNullOrEmpty($StackName))  { $StackName  = $env:CF_STACK_NAME }
if ([string]::IsNullOrEmpty($RdsHost))    { $RdsHost    = $env:RDS_HOST }
# RemotePort is ALWAYS 5432 — the real PostgreSQL port on the RDS server.
# RDS_PORT in .env (5400) is the LOCAL tunnel port only. Do not read it here.
if ([string]::IsNullOrEmpty($RemotePort)) { $RemotePort = "5432" }
if ([string]::IsNullOrEmpty($LocalPort))  { $LocalPort  = $env:RDS_PORT }
if ([string]::IsNullOrEmpty($Region))     { $Region     = $env:AWS_REGION }

if ([string]::IsNullOrEmpty($StackName))  { $StackName  = $env:CF_STACK_NAME }

if ([string]::IsNullOrEmpty($RdsHost)) {
    Write-Host "ERROR: RDS_HOST not found in .env!" -ForegroundColor Red
    exit 1
}

# Find Instance ID by Stack Name Tag
$TargetInstance = (aws ec2 describe-instances --filters "Name=tag:Name,Values=$StackName-AppServer" "Name=instance-state-name,Values=running" --query "Reservations[0].Instances[0].InstanceId" --output text --region $Region)

if ($TargetInstance -eq "None" -or [string]::IsNullOrEmpty($TargetInstance)) {
    Write-Host "Error: Could not find a running EC2 instance with tag Name=$StackName-AppServer" -ForegroundColor Red
    exit 1
}

Write-Host "Creating SSM parameter file..." -ForegroundColor Cyan
$p = "{`"host`":[`"$RdsHost`"],`"portNumber`":[`"$RemotePort`"],`"localPortNumber`":[`"$LocalPort`"]}"
Set-Content -Path "$env:TEMP\ssm-params.json" -Value $p

Write-Host "Tunnel open → Connect your DB client to localhost:$LocalPort" -ForegroundColor Green
aws ssm start-session --target $TargetInstance --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters file://$env:TEMP/ssm-params.json --region $Region
