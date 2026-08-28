# Cloudflare + SQLite (Docker)

TeamTask’s API is **Node/Express** (WebSockets, uploads, cron). It does **not** run on Cloudflare Workers / D1 as-is.

**Best setup:** Docker + SQLite volume, Cloudflare Tunnel (or DNS) in front.

```
Internet → Cloudflare Tunnel → host:4000 → Docker (Node + SQLite)
```

## Docker (recommended)

From the repo root (needs Docker Desktop):

```bat
copy .env.docker.example .env
REM edit .env — set JWT_SECRET and TEAMTASK_PUBLIC_URL

docker compose up -d --build
```

Open http://localhost:4000

Data lives in Docker volume `teamtask-data` (`/app/data` → SQLite + uploads).

Useful commands:

```bat
docker compose logs -f
docker compose down
docker compose up -d --build
```

Backup (check volume name with `docker volume ls`):

```bat
docker run --rm -v teamtask_teamtask-data:/data -v %cd%:/backup alpine tar czf /backup/teamtask-data.tgz -C /data .
```

## Cloudflare Tunnel

1. Domain on Cloudflare DNS  
2. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)  
3. Route `https://your-domain.com` → `http://127.0.0.1:4000`  
4. Keep `docker compose up -d` running  

## Local without Docker

```env
TEAMTASK_SQLITE=1
# DATABASE_URL=
```

```bat
cd server
npm install
npm start
```

## What not to expect

| Idea | Reality |
|------|---------|
| Workers + D1 | Full API rewrite |
| SQLite on Workers | No durable disk |
| Neon | Optional; not needed with `TEAMTASK_SQLITE=1` |
