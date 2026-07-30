# TeamTask — shared cloud data (no local hub)

Everyone installs the same EXE. All devices use **one cloud server**, so teams/tasks/users are shared automatically. No LAN hub PC required.

## One-time setup (you do this once)

### 1) Free MongoDB Atlas (keeps data safe)

1. Create a free account at https://www.mongodb.com/cloud/atlas  
2. Create a **free M0** cluster  
3. Database Access → add user + password  
4. Network Access → allow `0.0.0.0/0` (or Render IPs)  
5. Connect → Drivers → copy the URI  
   Example: `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/teamtask`

### 2) Free Render web service

1. Push this repo to GitHub (or deploy from the `server` folder)  
2. On https://render.com → **New → Web Service**  
3. Connect the repo  
4. Settings:
   - **Root Directory:** `server` (or use the included `Dockerfile` at repo root)
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
   - **Instance:** Free
5. Environment variables:
   - `MONGODB_URI` = your Atlas URI  
   - `JWT_SECRET` = any long random string  
   - `NODE_ENV` = `production`
6. Deploy → copy the public URL, e.g. `https://teamtask-xxxx.onrender.com`

> First open may take ~30–60s on the free plan (cold start).

### 3) Bake the URL into the Windows EXE

1. Edit `cloud-config.json` in the project root:

```json
{
  "apiUrl": "https://teamtask-xxxx.onrender.com"
}
```

2. Run `build-windows.cmd`  
3. Send everyone `releases\TeamTask-Setup-1.0.0.exe`

When `apiUrl` is set, the EXE **does not** start a local hub. It opens the shared cloud app directly. Everyone shares the same login data, teams, and tasks.

### 4) Logins

Default after first cloud start (empty DB seeds once):

- Admin: `admin@teamtask.local` / `admin123`

Create real users under **Users** and assign roles. Those accounts work from any device that has the EXE (or opens the same cloud URL in a browser).

## Phones / browsers

Open the same cloud URL in a browser, or set that URL in the mobile app under Server connection.

## Switching back to local-only hub

Set `apiUrl` to `""` in `cloud-config.json`, rebuild, and the EXE returns to the old local-hub mode.
