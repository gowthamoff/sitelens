# Fixing Mixed-Content (HTTP → HTTPS) for SiteLens

## The Problem

Amplify serves the frontend on **HTTPS**. The ALB serves the API on **HTTP**.  
Browsers block HTTPS pages from calling HTTP endpoints → everything breaks.

```
Browser (https://amplify.app)
  → tries to call http://alb-dns:80/api/...
  → Browser blocks it ✗
```

**Two ways to fix it. Option B is currently active.**

---

## Option B — CloudFront (Active, no domain needed, free)

CloudFront sits in front of the ALB and gives it an HTTPS URL automatically.

```
Browser (HTTPS)
  → https://d1abc123.cloudfront.net/api/...   ← CloudFront (HTTPS)
    → http://alb-dns:80/api/...               ← ALB → EC2 (internal HTTP, fine)
```

### Setup steps

1. **Create CloudFront distribution**
   - AWS Console → CloudFront → **Create distribution**
   - **Origin domain**: your ALB DNS name (from CloudFormation Outputs → `AlbDnsName`)
   - **Origin protocol**: HTTP only
   - **Cache policy**: `CachingDisabled` ← critical, API must not be cached
   - **Origin request policy**: `AllViewer` ← passes query strings and headers
   - Leave everything else default → **Create distribution**
   - Wait ~5 min → copy the **Distribution domain** e.g. `d1abc123.cloudfront.net`

2. **Update Amplify environment variable**
   - Amplify Console → your app → **Environment variables**
   - `VITE_API_BASE` = `https://d1abc123.cloudfront.net`
   - Redeploy the Amplify app

3. **Allow CloudFront in ALB security group** (if requests are being blocked)
   - EC2 → Security Groups → ALB security group → Inbound rules
   - Ensure port 80 is open to `0.0.0.0/0` (or restrict to CloudFront prefix list)

### Notes
- No domain purchase needed
- Free (CloudFront free tier: 1 TB/month data transfer, 10M requests/month)
- Adds ~30–80 ms latency per request vs direct ALB
- The `d1abc.cloudfront.net` URL changes if you delete and recreate the distribution

---

## Option A — Custom Domain + ACM Certificate (Cleaner, ~$3–5/yr)

Attach an SSL certificate directly to the ALB. No extra latency, clean URL.

```
Browser (HTTPS)
  → https://api.yourdomain.click            ← ALB (HTTPS, ACM cert)
    → http://localhost:8080                 ← EC2 Node.js (internal)
```

### Step 1 — Buy a domain in Route 53

- AWS Console → **Route 53** → Registered domains → **Register domain**
- Cheapest options: `.click` = $3/yr, `.link` = $5/yr
- Search e.g. `sitelens.click` → complete purchase (5–10 min to activate)

### Step 2 — Request an ACM certificate

- AWS Console → **Certificate Manager** → **Request certificate**
- **Request a public certificate** → Next
- Domain name: `api.sitelens.click`
- Validation: **DNS validation** → Request
- Open the certificate → **Create records in Route 53** (auto-validates in ~2 min)
- Copy the certificate **ARN** — you'll need it next

### Step 3 — Point the domain at the ALB

- Route 53 → **Hosted zones** → your domain → **Create record**
- Record name: `api`
- Record type: **A** → Enable **Alias**
- Route traffic to: **Application and Classic Load Balancer** → your region → your ALB
- **Create records**

### Step 4 — Update CloudFormation stack

The `backend.yaml` already has the HTTPS listener and HTTP→HTTPS redirect ready.  
Just add the `AcmCertificateArn` parameter when updating the stack:

```bash
aws cloudformation update-stack \
  --stack-name <your-backend-stack-name> \
  --template-body file://infrastructure/backend.yaml \
  --parameters \
    ParameterKey=AcmCertificateArn,ParameterValue=arn:aws:acm:ap-south-1:XXXX:certificate/YYYY \
    ParameterKey=DbPassword,ParameterValue=<your-db-password> \
    ParameterKey=VpcId,UsePreviousValue=true \
    ParameterKey=PublicSubnetIds,UsePreviousValue=true \
    ParameterKey=PrivateSubnetIds,UsePreviousValue=true \
    ParameterKey=AppSecurityGroupId,UsePreviousValue=true \
    ParameterKey=AlbSecurityGroupId,UsePreviousValue=true \
    ParameterKey=Ec2InstanceProfileName,UsePreviousValue=true \
    ParameterKey=DockerImageUrl,UsePreviousValue=true \
    ParameterKey=DatabaseStackName,UsePreviousValue=true \
    ParameterKey=GooglePlacesKey,UsePreviousValue=true \
  --capabilities CAPABILITY_IAM
```

What the template does automatically:
- Port 80 → 301 redirect to HTTPS
- Port 443 → forward to Node.js (with your ACM cert)
- Port 443 `/tiles/*` → forward to Martin tile server

### Step 5 — Update Amplify environment variable

- `VITE_API_BASE` = `https://api.sitelens.click`
- Redeploy the Amplify app

### Step 6 — Update ALB security group

- EC2 → Security Groups → ALB security group → Inbound rules
- Add rule: **HTTPS (443)** from `0.0.0.0/0`

---

## Switching from Option B → Option A later

1. Complete Option A steps 1–6 above
2. Update `VITE_API_BASE` to your custom domain URL
3. Delete the CloudFront distribution (AWS Console → CloudFront → select → Disable → Delete)

---

## Comparison

| | Option B (CloudFront) | Option A (Custom domain) |
|---|---|---|
| **Status** | ✅ Active | Ready to deploy |
| **Cost** | Free | ~$3–5/yr |
| **Setup time** | Done | ~20 min |
| **URL** | `d1abc.cloudfront.net` | `api.yourdomain.click` |
| **Latency** | +30–80 ms | No extra latency |
| **SSL cert management** | Automatic | Automatic (ACM auto-renews) |
| **Requires domain** | No | Yes |
