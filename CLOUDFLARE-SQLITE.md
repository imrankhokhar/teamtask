# Cloudflare D1 (Remote SQLite) Setup Guide

TeamTask supports **Cloudflare D1** (Cloudflare's serverless SQLite database) as the remote data store.

---

## 1. Create a D1 Database in Cloudflare

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. On the left navigation, go to **Storage & Databases** → **D1 SQL Database** (or **Workers & Pages** → **D1**).
3. Click **Create Database**.
4. Choose **Dashboard** and enter a name (e.g. `teamtask-db`).
5. Click **Create**.

---

## 2. Get Your Database ID & Account ID

1. Click on your newly created `teamtask-db` database.
2. In the top details area:
   - Copy the **Database ID** (a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
3. Your **Account ID** is visible in your browser URL bar or on the right sidebar of the Cloudflare home page (a 32-character hex string).

---

## 3. Create a Cloudflare API Token

1. Click your **User Profile icon** (top right) → **My Profile** → **API Tokens** (or visit `https://dash.cloudflare.com/profile/api-tokens`).
2. Click **Create Token**.
3. Scroll to the bottom and click **Create Custom Token** → **Get started**.
4. Configure the token:
   - **Token name:** `TeamTask D1 Access`
   - **Permissions:**
     - `Account` — `D1` — `Edit`
   - **Account Resources:**
     - `Include` — `All accounts` (or select your specific account).
5. Click **Continue to summary** → **Create Token**.
6. **Copy the API token** secret immediately (you will not be able to see it again).

---

## 4. Set Environment Variables

### In Docker (`.env` next to `docker-compose.yml`):

```env
PORT=4000
JWT_SECRET=your-secure-secret-key-12345
TEAMTASK_PUBLIC_URL=https://tt.exodevs.com

# Cloudflare D1 Settings
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_D1_DATABASE_ID=your_database_id_uuid_here
CLOUDFLARE_D1_API_TOKEN=your_api_token_here
```

### Or in `server/.env` (if running with Node/PM2 directly):

```env
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_D1_DATABASE_ID=your_database_id_uuid_here
CLOUDFLARE_D1_API_TOKEN=your_api_token_here
```

---

## 5. Deploy & Verify

Restart your server or Docker container:

```bash
docker compose up -d --build
docker compose logs --tail 30
```

You will see:
```text
TeamTask data store: Cloudflare D1 (database: xxxxxxxx...)
TeamTask API running on http://0.0.0.0:4000
```

The server automatically creates the `appstate` table in Cloudflare D1 and seeds default admin credentials if the database is empty.
