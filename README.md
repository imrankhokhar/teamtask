# TeamTask

Shared team tasks, checklists, roles, and notifications.

## Recommended: free web app (phone + desktop)

You do **not** need your own paid server, domain, or database.

Follow **[WEB-DEPLOY.md](WEB-DEPLOY.md)** step by step:

1. Free MongoDB Atlas (database)  
2. Free GitHub (code)  
3. Free Render (website + API)  
4. Open the `https://….onrender.com` link on mobile and desktop  
5. Optional: **Add to Home Screen / Install** for an app-like icon  

Demo login after first deploy: `admin@teamtask.local` / `admin123`

## Local test (this PC only)

```bat
start-web.cmd
```

Then open http://localhost:4000

## Optional Windows EXE

See `CLOUD-SHARED.md` and `build-windows.cmd` if you still want an installer that opens the same cloud URL.

## Docs

| File | Purpose |
|------|---------|
| `WEB-DEPLOY.md` | **Start here** — free shared web app |
| `CLOUD-SHARED.md` | Cloud + EXE bake-in |
| `prepare-cloud.cmd` | Build web UI into `server/web` before deploy |
