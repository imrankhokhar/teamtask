# TeamTask Web App — free setup (no paid server / domain / DB)

You do **not** buy a server or domain. Use free accounts:

| What | Free service | Cost |
|------|----------------|------|
| Website + API | [Render.com](https://render.com) | Free |
| Database | [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) | Free |
| Domain | `https://tt.exodevs.com` | Live TeamTask URL |
| App install feel | Browser “Add to Home Screen / Install” | Free |

After this, open the link on **phone and PC** — same shared data.

---

## Part A — Free database (10 minutes)

1. Go to https://www.mongodb.com/cloud/atlas → **Sign up** (Google is fine).
2. **Build a Database** → **M0 Free** → Create.
3. **Database Access** → Add user → save username + password.
4. **Network Access** → **Allow Access from Anywhere** (`0.0.0.0/0`).
5. **Connect** → **Drivers** → copy URI.  
   Change the end to include `/teamtask`, example:

```text
mongodb+srv://USER:PASSWORD@cluster0.abc123.mongodb.net/teamtask
```

Keep this URI for Part C.

---

## Part B — Put code on GitHub (10 minutes)

Render needs your code online.

1. Create a free account at https://github.com
2. Click **New repository** → name `teamtask` → **Create** (empty is fine).
3. On your PC, open **Command Prompt** and run (replace `YOUR_GITHUB_USERNAME`):

```bat
cd C:\Users\Mudassar\teamtask
git add -A
git commit -m "TeamTask web app ready for free cloud deploy"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/teamtask.git
git push -u origin main
```

If Git asks you to login, sign in with GitHub.

> If `git commit` says identity unknown, run once:
>
> ```bat
> git config --global user.email "you@example.com"
> git config --global user.name "Your Name"
> ```

---

## Part C — Free website on Render (10 minutes)

1. Go to https://render.com → **Sign up** (use GitHub login).
2. **New** → **Web Service**.
3. Connect the `teamtask` GitHub repo.
4. Settings:
   - **Runtime:** Docker  
   - **Dockerfile path:** `./Dockerfile`  
   - **Instance:** Free  
5. **Environment** variables:

| Key | Value |
|-----|--------|
| `MONGODB_URI` | your Atlas URI from Part A |
| `JWT_SECRET` | any long random text |
| `NODE_ENV` | `production` |

6. Click **Create Web Service** and wait until **Live**.
7. Live site: **https://tt.exodevs.com**

First open on free plan can take **30–60 seconds**.

---

## Part D — Use it like an app

### Desktop
1. Open **https://tt.exodevs.com** in Chrome/Edge.
2. Login with your TeamTask account.
3. Optional: browser menu → **Install TeamTask** / **Create shortcut**.

### Android APK (wraps the website)
Install `releases/TeamTask.apk` (built by `build-apk.cmd`). It opens **https://tt.exodevs.com** full-screen. Website deploys show up when you reopen the app.

### Mobile (install as an app — same URL as the website)
1. Open **https://tt.exodevs.com** in Chrome (Android) or Safari (iPhone).
2. Login with the same account.
3. Install:
   - Android Chrome → menu → **Add to Home screen** / **Install app**
   - iPhone Safari → Share → **Add to Home Screen**

The home-screen icon is the **same live web app**. After you `git push` and the server is rebuilt/restarted, pull-to-refresh (or reopen the icon) shows the new UI on **desktop and phone** — no Play Store / App Store rebuild.

> A store-built native APK/IPA would **not** auto-update on git push. This PWA wrap does, because it always loads from the server.

---

## Part E — Your team

1. In the app: **Users** → create accounts + roles.
2. Send them **only the Render link** + their login.
3. No EXE install required.

---

## Test on your PC before cloud (optional)

```bat
cd C:\Users\Mudassar\teamtask\server
npm start
```

Open http://localhost:4000 — local only (not shared). For shared data you still need Part A–C.

---

## What I prepared in this project

- Web UI built into `server/web`
- Docker + `render.yaml` for free Render deploy
- MongoDB support via `MONGODB_URI` (shared cloud DB)
- PWA-friendly web settings (install to home screen)

You only need to create the **3 free accounts** (MongoDB, GitHub, Render) and push once.
