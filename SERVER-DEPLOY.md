# TeamTask — complete server deploy guide

Everything you need to deploy on **your own server**.

---

## 1) What you need on the server

- Linux (Ubuntu recommended) or Windows Server
- **Node.js 20+** (`node -v`)
- **npm**
- Git
- Open firewall port (default **4000**)
- MongoDB Atlas URI (you already have this)

Optional: Nginx + domain for HTTPS

---

## 2) App code (where it is)

| Location | URL / path |
|----------|------------|
| GitHub | `https://github.com/imrankhokhar/teamtask` |
| Your PC | `C:\Users\Mudassar\teamtask` |

**On the server, only `server/` is required to run.**

---

## 3) Get code onto the server

```bash
cd /opt
sudo git clone https://github.com/imrankhokhar/teamtask.git
cd teamtask
```

Or upload the project folder (ZIP/SFTP) to the server.

Check web UI exists:

```bash
ls server/web/index.html
```

If missing, build it (needs Node on a machine):

```bash
cd /opt/teamtask/app
npx expo export --platform web
cd ..
rm -rf server/web && mkdir -p server/web
cp -R app/dist/. server/web/
```

---

## 4) Environment file (`.env`)

Create file: **`/opt/teamtask/server/.env`**

```env
# ========== REQUIRED ==========
PORT=4000
NODE_ENV=production
JWT_SECRET=change-me-to-a-long-random-secret-please

# MongoDB (use your real password)
MONGODB_URI=mongodb+srv://emypersonal425_db_user:YOUR_DB_PASSWORD@teamtask.gbcijyc.mongodb.net/teamtask?appName=teamtask

# ========== RECOMMENDED ==========
# Public address people will open in browser
TEAMTASK_PUBLIC_URL=http://YOUR_SERVER_IP:4000

# Web UI folder (relative to server/)
TEAMTASK_WEB_DIST=./web

# Uploads + local data folders
TEAMTASK_UPLOADS_DIR=./data/uploads
TEAMTASK_DATA_DIR=./data

# ========== OPTIONAL ==========
# MONGODB_DB=teamtask
# TEAMTASK_MONGODB_URI=   # alias of MONGODB_URI
```

### Env meaning

| Variable | Required | Default | Meaning |
|----------|----------|---------|---------|
| `PORT` | No | `4000` | HTTP port |
| `NODE_ENV` | Yes | — | Use `production` |
| `JWT_SECRET` | Yes | weak default | Login token secret — change it |
| `MONGODB_URI` | Yes | local file DB | Shared database |
| `MONGODB_DB` | No | `teamtask` | DB name if not in URI |
| `TEAMTASK_PUBLIC_URL` | Recommended | — | Public URL/IP |
| `TEAMTASK_WEB_DIST` | Recommended | auto | Path to `web` UI |
| `TEAMTASK_UPLOADS_DIR` | No | under data | Sound uploads |
| `TEAMTASK_DATA_DIR` | No | `./data` | Local fallback data |

**`.env` is NOT the run command.** It is config only.

Commands to create it:

```bash
cd /opt/teamtask/server
cp .env.example .env
nano .env
```

---

## 5) Port

- Default: **`4000`**
- Change with `PORT=...` in `.env`
- App listens on **`0.0.0.0:PORT`** (all interfaces)

Examples:
- `PORT=4000` → `http://SERVER_IP:4000`
- `PORT=8080` → `http://SERVER_IP:8080`

Firewall example (Ubuntu):

```bash
sudo ufw allow 4000/tcp
sudo ufw reload
```

---

## 6) Install dependencies

```bash
cd /opt/teamtask/server
npm install --omit=dev
mkdir -p data/uploads
```

---

## 7) Run command

```bash
cd /opt/teamtask/server
npm start
```

Same as:

```bash
cd /opt/teamtask/server
node src/index.js
```

### Keep running after logout (PM2)

```bash
sudo npm install -g pm2
cd /opt/teamtask/server
pm2 start src/index.js --name teamtask
pm2 save
pm2 startup
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs teamtask
pm2 restart teamtask
pm2 stop teamtask
```

---

## 8) How to open the app

Browser (phone or PC):

```text
http://YOUR_SERVER_IP:4000
```

If you set a domain + Nginx HTTPS:

```text
https://your-domain.com
```

### Default login (first start)

- Email: `admin@teamtask.local`
- Password: `admin123`

Change password / create real users after login.

---

## 9) Health check

```bash
curl http://127.0.0.1:4000/api/health
```

Expect: `"ok": true`

---

## 10) Optional Nginx (port 80/443 → app on 4000)

```nginx
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Then in `.env`:

```env
PORT=4000
TEAMTASK_PUBLIC_URL=https://your-domain.com
```

---

## 11) Full quick copy-paste (Ubuntu)

```bash
# 1) Code
cd /opt
sudo git clone https://github.com/imrankhokhar/teamtask.git
cd teamtask/server

# 2) Env
cp .env.example .env
nano .env
# paste PORT, JWT_SECRET, MONGODB_URI, TEAMTASK_PUBLIC_URL, etc.

# 3) Install
npm install --omit=dev
mkdir -p data/uploads

# 4) Firewall
sudo ufw allow 4000/tcp

# 5) Run forever
sudo npm install -g pm2
pm2 start src/index.js --name teamtask
pm2 save
pm2 startup
```

Open: `http://SERVER_IP:4000`

---

## 12) Folder map

```text
teamtask/
  server/                 ← run from here
    .env                  ← create this (secrets)
    package.json
    src/index.js          ← main app
    web/                  ← website UI (index.html)
    data/uploads/         ← created at runtime
  app/                    ← source UI (optional on server)
  SERVER-DEPLOY.md        ← this guide
```

---

## 13) Checklist

- [ ] Node 20+ installed
- [ ] Repo cloned
- [ ] `server/web/index.html` exists
- [ ] `server/.env` filled
- [ ] `MONGODB_URI` has real password + `/teamtask`
- [ ] `npm install` done
- [ ] `npm start` or `pm2 start` running
- [ ] Firewall allows `PORT`
- [ ] Browser opens `http://IP:PORT`
- [ ] Login works
