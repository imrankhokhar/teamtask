# Free remote Postgres (optional — SQLite preferred for Cloudflare Tunnel)

TeamTask can use Postgres **or** SQLite.

For **Cloudflare + SQLite** (no Neon), see [CLOUDFLARE-SQLITE.md](./CLOUDFLARE-SQLITE.md).

## Postgres URI (Neon / Supabase / Railway)

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
```

Leave `MONGODB_URI` empty. Clear `TEAMTASK_SQLITE` when using Postgres.

## Priority

1. `TEAMTASK_SQLITE` → SQLite file  
2. `DATABASE_URL` (or `POSTGRES_URI`) → Postgres  
3. `MONGODB_URI` → Mongo (legacy)  
4. neither → local `server/data/db.json`
