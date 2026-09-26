# One-command RDS connect: loads backend-py\.env, finds the EC2 instance,
# opens an SSM port-forward tunnel in the background, waits for the port,
# then drops into psql. Closing psql closes the tunnel.
#
# Usage:  .\scripts\db-tunnel.ps1              (tunnel + psql)
#         .\scripts\db-tunnel.ps1 -TunnelOnly  (tunnel only, for DBeaver/pgAdmin)
param (
    [string]$EnvFile = (Join-Path $PSScriptRoot "..\backend-py\.env"),
    [string]$InstanceName = "sitelens-app",
    [switch]$TunnelOnly
)

if (-not (Test-Path $EnvFile)) {
    Write-Host "ERROR: env file not found: $EnvFile" -ForegroundColor Red
    exit 1
}

# Parse .env - later duplicate keys override earlier ones (RDS_HOST appears twice)
$vars = @{}
Get-Content $EnvFile | Where-Object { $_ -match '^\s*[^#]' -and $_ -match '=' } | ForEach-Object {
    $name, $value = $_.Split('=', 2)
    $vars[$name.Trim()] = $value.Trim()
}

$RdsHost   = $vars['RDS_HOST']
$LocalPort = $vars['RDS_PORT']
$Db        = $vars['RDS_DB']
$User      = $vars['RDS_USER']
$Pass      = $vars['RDS_PASS']
$Region    = $vars['AWS_REGION']
$Stack     = $vars['CF_STACK_NAME']

if (-not $RdsHost -or $RdsHost -eq 'localhost') {
    Write-Host "ERROR: RDS_HOST in $EnvFile is missing or 'localhost' - need the real RDS endpoint." -ForegroundColor Red
    exit 1
}
if (-not $LocalPort) { $LocalPort = "5400" }

# Find the running EC2 instance (by Name tag; accepts either naming scheme)
Write-Host "Looking up EC2 instance ($InstanceName / ${Stack}-AppServer)..." -ForegroundColor Cyan
$TargetInstance = aws ec2 describe-instances `
    --filters "Name=tag:Name,Values=$InstanceName,${Stack}-AppServer" "Name=instance-state-name,Values=running" `
    --query "Reservations[0].Instances[0].InstanceId" --output text --region $Region

if ($TargetInstance -eq "None" -or [string]::IsNullOrEmpty($TargetInstance)) {
    Write-Host "ERROR: no running instance tagged Name=$InstanceName or ${Stack}-AppServer in $Region" -ForegroundColor Red
    exit 1
}
Write-Host "Instance: $TargetInstance" -ForegroundColor Cyan

# Start the SSM port-forward tunnel in the background
$paramsFile = Join-Path $env:TEMP "ssm-params.json"
Set-Content -Path $paramsFile -Value "{`"host`":[`"$RdsHost`"],`"portNumber`":[`"5432`"],`"localPortNumber`":[`"$LocalPort`"]}" -Encoding ascii
$tunnel = Start-Process aws -ArgumentList @(
    "ssm", "start-session",
    "--target", $TargetInstance,
    "--document-name", "AWS-StartPortForwardingSessionToRemoteHost",
    "--parameters", "file://$paramsFile",
    "--region", $Region
) -PassThru -WindowStyle Hidden

# Wait until the local port accepts connections (max 30s)
Write-Host "Waiting for tunnel on localhost:$LocalPort..." -ForegroundColor Cyan
$connected = $false
$deadline = (Get-Date).AddSeconds(30)
while (-not $connected -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    try {
        $tcp = New-Object Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", [int]$LocalPort)
        $connected = $tcp.Connected
        $tcp.Close()
    } catch {}
    if ($tunnel.HasExited) { break }
}

if (-not $connected) {
    Write-Host "ERROR: tunnel did not come up on localhost:$LocalPort (is session-manager-plugin installed?)" -ForegroundColor Red
    if (-not $tunnel.HasExited) { taskkill /PID $tunnel.Id /T /F | Out-Null }
    exit 1
}
Write-Host "Tunnel up: localhost:$LocalPort -> ${RdsHost}:5432" -ForegroundColor Green

if ($TunnelOnly) {
    Write-Host "Tunnel-only mode. Connect any client to localhost:$LocalPort. Press Enter to close." -ForegroundColor Yellow
    Read-Host | Out-Null
    taskkill /PID $tunnel.Id /T /F | Out-Null
    exit 0
}

# Connect with psql; when psql exits, tear the tunnel down
try {
    $env:PGPASSWORD = $Pass
    psql "host=127.0.0.1 port=$LocalPort dbname=$Db user=$User sslmode=require"
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    if (-not $tunnel.HasExited) { taskkill /PID $tunnel.Id /T /F | Out-Null }
    Write-Host "Tunnel closed." -ForegroundColor Cyan
}
