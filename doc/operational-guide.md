# 🚀 Site Analysis: Operational Guide

This guide covers how to manage your production AWS environment and connect your local tools (DBeaver) to the private RDS database using the **AWS SSM Bridge** (The modern, key-less way).

---

## 1. 🌉 Connect DBeaver (No PEM Required)
Since your RDS is in a private subnet, you must open a secure bridge on your computer first.

### Step A: Start the Bridge (Terminal 1)
Run this command in the `server` folder:
```bash
npm run db:tunnel
```
*(This script automatically reads your RDS host and EC2 ID from your `.env` file and opens the bridge on port 5400).*
*(If you get a "Plugin not found" error, run `winget install Amazon.SessionManagerPlugin` first).*

### Step B: Configure DBeaver
1.  **New Connection**: Select **PostgreSQL**.
2.  **Host**: `localhost`
3.  **Port**: `5400` (The automated script defaults to 5400)
4.  **Database**: `osm-tn`
5.  **Username**: `postgres`
6.  **Password**: `<YOUR_RDS_PASSWORD>`
7.  **SSH Tunnel**: **DISABLED** (The SSM bridge handles it).
8.  **SSL**: Set SSL Mode to **`require`**.

---

## 2. 🚀 Automated Backend Deployment
To update your production server with new code:
```bash
cd server
npm run deploy:backend
```
This script handles the full lifecycle: **Docker Build -> ECR Push -> SSM Remote Update**.

---

## 3. 🛡️ Recovering Lost Access
If you lose access to the server, you have two options:
*   **Method 1 (Browser)**: Navigate to EC2 in the AWS Console -> Select Instance -> **Connect** -> **Session Manager**.
*   **Method 2 (CLI)**: Run `aws ssm start-session --target <TARGET_INSTANCE_ID>`.

---

## ⚡ Troubleshooting Checklist
*   **Bridge Timeout**: If DBeaver disconnects, your SSM session likely timed out. Restart the command in Terminal 1.
*   **Permission Denied**: Ensure your `aws configure` credentials are correct and have `AmazonSSMFullAccess`.
*   **Database Not Found**: Ensure you have run the `CREATE DATABASE "osm-tn";` command on RDS first.
