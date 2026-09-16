# SiteLens - AWS Deployment (current)

Lean free-tier deployment: FastAPI + React + PostGIS on AWS, region **ap-south-1**.
Open **`sitelens-aws-architecture.html`** for the visual tracker (Architecture / What's Next / To-Do / Pricing).

## Stacks (deploy in order)
| # | File | Stack name | Creates | Status |
|---|------|------------|---------|--------|
| 1 | `sitelens-network.yaml` | `sitelens-network` | VPC, subnets, IGW, security groups | ✅ done |
| 2 | `sitelens-database.yaml` | `sitelens-database` | RDS PostgreSQL (PostGIS), private | in progress |
| 3 | *(coming)* | `sitelens-app` | EC2 + git-build Docker FastAPI | pending |
| 4 | *(coming)* | `sitelens-frontend` | S3 + CloudFront | pending |

## Deploy commands (PowerShell, from repo root `D:\demo\sitelens`)

**Stack 1 - network**
```powershell
$myip = (Invoke-RestMethod https://checkip.amazonaws.com).Trim(); aws cloudformation deploy --template-file infrastructure/deploy/sitelens-network.yaml --stack-name sitelens-network --region ap-south-1 --parameter-overrides MyIpCidr="$myip/32" --tags Project=sitelens Stack=network Env=prod
```

**Stack 2 - database**
```powershell
aws cloudformation deploy --template-file infrastructure/deploy/sitelens-database.yaml --stack-name sitelens-database --region ap-south-1 --parameter-overrides DbPassword="YOUR_STRONG_PW" --tags Project=sitelens Stack=database Env=prod
```

**Verify any stack**
```powershell
aws cloudformation describe-stacks --stack-name <name> --region ap-south-1 --query "Stacks[0].Outputs" --output table
```

## Notes
- Cross-stack wiring via CloudFormation **exports** (network exports VPC/subnet/SG ids; DB imports them).
- DB is **private** - enable PostGIS + load OSM data from the EC2 (Stack 3), not your laptop.
- Cost tags: `Project` + `Stack` - activate them in Billing > Cost Allocation Tags.
- `_archive/` (sibling folder) holds the previous Lambda/ALB approach - not used.
