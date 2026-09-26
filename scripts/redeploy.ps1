# One-command EC2 redeploy over SSM (no SSH session needed).
# Runs on the instance: git pull -> docker build -> replace container -> status.
#
# Usage:  .\scripts\redeploy.ps1
# Note:   the instance pulls from the git remote, so commit + push local work first.
param (
    [string]$InstanceId = "i-099cb46cbe2285cce",
    [string]$Region = "ap-south-1"
)

# Build logs contain unicode (checkmarks etc.) - keep the console from choking
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Warn if local work has not been pushed (the EC2 pull would miss it)
$ahead = git -C (Join-Path $PSScriptRoot "..") status -sb 2>$null | Select-Object -First 1
if ($ahead -match "ahead") { Write-Host "WARNING: local branch is ahead of remote - push before redeploying." -ForegroundColor Yellow }
$dirty = git -C (Join-Path $PSScriptRoot "..") status --porcelain 2>$null
if ($dirty) { Write-Host "WARNING: uncommitted local changes exist - they will NOT be deployed." -ForegroundColor Yellow }

$commands = @(
    "set -e",
    "export HOME=/root",
    "cd /opt/sitelens",
    "git config --global --add safe.directory /opt/sitelens || true",
    "git pull",
    "docker build -t sitelens-api .",
    "docker rm -f sitelens-api || true",
    "docker run -d --restart always --name sitelens-api -p 80:8080 --env-file /opt/sitelens/backend.env sitelens-api",
    "sleep 3",
    "docker ps --filter name=sitelens-api",
    "docker logs --tail 15 sitelens-api"
)
$paramsJson = @{ commands = $commands } | ConvertTo-Json -Compress
$paramsFile = Join-Path $env:TEMP "redeploy-params.json"
Set-Content -Path $paramsFile -Value $paramsJson -Encoding ascii

Write-Host "Sending redeploy to $InstanceId..." -ForegroundColor Cyan
$cmdId = aws ssm send-command --instance-ids $InstanceId --document-name "AWS-RunShellScript" `
    --parameters "file://$paramsFile" --timeout-seconds 900 `
    --query "Command.CommandId" --output text --region $Region
if (-not $cmdId) { Write-Host "ERROR: send-command failed." -ForegroundColor Red; exit 1 }

# Poll until done (docker build takes a few minutes)
Write-Host "Command $cmdId running (docker build takes a few minutes)..." -ForegroundColor Cyan
do {
    Start-Sleep -Seconds 10
    $status = aws ssm get-command-invocation --command-id $cmdId --instance-id $InstanceId `
        --query "Status" --output text --region $Region
    Write-Host "  status: $status"
} while ($status -in @("Pending", "InProgress", "Delayed"))

Write-Host "`n----- output (tail) -----" -ForegroundColor Cyan
$stdout = aws ssm get-command-invocation --command-id $cmdId --instance-id $InstanceId `
    --query "StandardOutputContent" --output text --region $Region
($stdout -split "`n" | Select-Object -Last 30) -join "`n"
$stderr = aws ssm get-command-invocation --command-id $cmdId --instance-id $InstanceId `
    --query "StandardErrorContent" --output text --region $Region
if ($stderr -and $stderr -ne "None") { Write-Host "----- stderr (tail) -----" -ForegroundColor Yellow; ($stderr -split "`n" | Select-Object -Last 15) -join "`n" }

if ($status -eq "Success") { Write-Host "`nRedeploy complete." -ForegroundColor Green }
else { Write-Host "`nRedeploy FAILED ($status) - see output above." -ForegroundColor Red; exit 1 }
