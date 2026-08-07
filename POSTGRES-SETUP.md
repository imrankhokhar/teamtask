# Free remote Postgres (replace Mongo URI)

TeamTask now accepts a **Postgres connection URI** the same way it used Mongo:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
```

Leave `MONGODB_URI` empty (or remove it). Postgres is preferred when both are set.

## 1) Create a free DB (Neon — recommended)

1. Open https://console.neon.tech and sign up  
2. **Create a project** (any name, e.g. `teamtask`)  
3. Open **Connection details** / **Connection string**  
4. Copy the URI that looks like:

```text
postgresql://neondb_owner:xxxx@ep-xxxxx.aws.neon.tech/neondb?sslmode=require
```

(Supabase and Railway Postgres URIs work the same way.)

## 2) Put it on your server

In `server/.env` (or your host’s env vars, e.g. Render):

```env
DATABASE_URL=postgresql://...your neon uri...
JWT_SECRET=some-long-random-secret
PORT=4000
```

Comment out Mongo if present:

```env
# MONGODB_URI=...
```

## 3) Install / restart

On the server:

```bat
cd server
npm install
npm start
```

You should see:

```text
TeamTask data store: PostgreSQL (shared cloud via DATABASE_URL)
```

First start creates the `appstate` table and seeds demo users if the DB is empty.

## 4) Priority

1. `DATABASE_URL` (or `POSTGRES_URI`) → Postgres  
2. `MONGODB_URI` → Mongo (legacy)  
3. neither → local `server/data/db.json`
