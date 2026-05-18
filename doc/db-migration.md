# 🚀 Project Migration: Local Database to AWS RDS

This guide provides the exact steps for moving your local PostGIS data (the `osm-tn` database) to your private AWS RDS instance in Mumbai (`ap-south-1`).

---

## 🏗️ The Private Bridge (SSM Tunnel)
Because your RDS is in a **Private Subnet** (Security First), it cannot be reached from the internet. You MUST create a secure bridge through your EC2 instance (`<TARGET_INSTANCE_ID>`) first.

### Step 1: Open the Bridge (Terminal 1)
Run this command in the `server` folder to open a secure bridge:
```bash
npm run db:tunnel
```
*(This script automatically reads your RDS host and EC2 ID from your `.env` file and opens the bridge on port 5400).*
*(Keep this window open! If it times out, restart it immediately).*

---

## 🏁 Step 2: Prepare the AWS Database
Before you can restore your data, you must **ensure the database exists** on AWS.

1.  **Open an Interactive Shell** (Terminal 2):
```powershell
psql -h localhost -p 5400 -U postgres
```
2.  **Inside the Shell (`postgres=#`)**, run these commands:
```sql
-- Must use double quotes because of the hyphen (-)
CREATE DATABASE "osm-tn";
\q
```

---

## 📦 Step 3: Perform the Actual Transfer
While your bridge is still open in Terminal 1, run these in Terminal 2:

### A. Create the Local Backup
```powershell
# Dumps your local 'osm-tn' to a compressed file on your desktop
pg_dump -h localhost -U postgres -d osm-tn -F c -f "$env:USERPROFILE\Desktop\osm_tn_backup.dump"
```

### B. Restore to AWS RDS (via the bridge)
```powershell
# Connects to localhost:5400 (the bridge) and pushes the data to AWS
pg_restore -h localhost -p 5400 -U postgres -d osm-tn -v "$env:USERPROFILE\Desktop\osm_tn_backup.dump"
```

---

## ⚠️ Important Migration Tips
*   **Hyphen Check**: Postgres requires names like `osm-tn` to be quoted in SQL (e.g., `"osm-tn"`).
*   **Wipe Option**: If your restore fails halfway, run `DROP DATABASE "osm-tn";` inside the `psql` shell and recreate it before trying again.
*   **Plugin Requirement**: This workflow requires the **`Amazon.SessionManagerPlugin`** (Install via `winget install Amazon.SessionManagerPlugin`).
*   **SSL**: Always ensure your psql/DBeaver settings have SSL set to **`require`**.
