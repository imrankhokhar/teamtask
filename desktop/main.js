const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const Module = require('module');

const BOOT_LOG = 'C:\\g\\teamtask-boot.log';
function bootLog(line) {
  try {
    fs.mkdirSync('C:\\g', { recursive: true });
    fs.appendFileSync(BOOT_LOG, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // ignore
  }
}
bootLog('main.js loaded');

let PORT = Number(process.env.PORT || 4000);
let mainWindow = null;
let logPath = null;
let cloudApiUrl = null;

function appendLog(line) {
  try {
    if (!logPath) return;
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // ignore
  }
}

function readCloudConfig() {
  const candidates = [
    path.join(__dirname, 'cloud-config.json'),
    app.isPackaged
      ? path.join(process.resourcesPath, 'cloud-config.json')
      : path.join(__dirname, '..', 'cloud-config.json'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const url = String(raw.apiUrl || raw.url || '').trim().replace(/\/$/, '');
      if (url.startsWith('http://') || url.startsWith('https://')) {
        bootLog(`cloud config from ${file}: ${url}`);
        return url;
      }
    } catch (e) {
      bootLog(`cloud config read failed ${file}: ${e.message}`);
    }
  }
  return null;
}

function serverDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server');
  }
  return path.join(__dirname, '..', 'server');
}

function webDistDir() {
  if (app.isPackaged) {
    const inServer = path.join(process.resourcesPath, 'server', 'web');
    if (fs.existsSync(path.join(inServer, 'index.html'))) return inServer;
    return path.join(process.resourcesPath, 'web');
  }
  const serverWeb = path.join(__dirname, '..', 'server', 'web');
  if (fs.existsSync(path.join(serverWeb, 'index.html'))) return serverWeb;
  return path.join(__dirname, '..', 'app', 'dist');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function pickPort(start = 4000) {
  for (let p = start; p < start + 20; p += 1) {
    if (await isPortFree(p)) return p;
  }
  throw new Error('No free port found between 4000-4019. Close old TeamTask/Node and retry.');
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : http;
    lib
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

async function waitForUrlReady(baseUrl) {
  const healthUrl = `${baseUrl}/api/health`;
  const rootUrl = `${baseUrl}/`;
  for (let i = 0; i < 60; i += 1) {
    try {
      const health = await httpGet(healthUrl);
      if (health.status === 200) {
        const root = await httpGet(rootUrl);
        if (root.status === 200) return;
      }
      appendLog(`waiting cloud health=${health.status}`);
    } catch (e) {
      appendLog(`waiting cloud error=${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Cannot reach shared cloud server:\n${baseUrl}\n\nCheck internet and that the cloud app is deployed (see CLOUD-SHARED.md).`
  );
}

async function waitForLocalReady() {
  const healthUrl = `http://127.0.0.1:${PORT}/api/health`;
  const rootUrl = `http://127.0.0.1:${PORT}/`;
  for (let i = 0; i < 40; i += 1) {
    try {
      const health = await httpGet(healthUrl);
      const root = await httpGet(rootUrl);
      if (health.status === 200 && root.status === 200 && root.body.includes('<!DOCTYPE html>')) {
        return;
      }
      appendLog(`waiting health=${health.status} root=${root.status}`);
    } catch (e) {
      appendLog(`waiting error=${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const logTail = logPath && fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').slice(-1200)
    : '(no log)';
  throw new Error(`TeamTask server did not become ready.\n\nLog:\n${logTail}`);
}

function startServerInProcess() {
  const cwd = serverDir();
  const userData = app.getPath('userData');
  const web = webDistDir();
  const deps = path.join(cwd, 'deps');

  logPath = path.join(userData, 'server-start.log');
  fs.writeFileSync(logPath, '');
  appendLog(`in-process server cwd=${cwd}`);
  appendLog(`deps=${deps} exists=${fs.existsSync(deps)}`);
  appendLog(`web=${web}`);
  appendLog(`port=${PORT}`);

  if (!fs.existsSync(path.join(deps, 'express'))) {
    throw new Error(`Missing server dependencies at ${deps}`);
  }
  if (!fs.existsSync(path.join(web, 'index.html'))) {
    throw new Error(`Missing web UI at ${web}`);
  }

  process.env.PORT = String(PORT);
  process.env.TEAMTASK_WEB_DIST = web;
  process.env.TEAMTASK_USER_DATA = userData;
  process.env.TEAMTASK_DATA_DIR = path.join(userData, 'teamtask-data');
  process.env.TEAMTASK_UPLOADS_DIR = path.join(userData, 'teamtask-data', 'uploads');
  process.env.NODE_PATH = [deps, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();

  require(path.join(cwd, 'src', 'index.js'));
  appendLog('server module loaded');
}

function createWindow(loadUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0F1C17',
    title: cloudApiUrl ? 'TeamTask (Shared Cloud)' : 'TeamTask',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(loadUrl);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  bootLog('app.whenReady');
  const userData = app.getPath('userData');
  logPath = path.join(userData, 'server-start.log');
  try {
    fs.writeFileSync(logPath, '');
  } catch {
    // ignore
  }

  try {
    cloudApiUrl = readCloudConfig();
    if (cloudApiUrl) {
      bootLog(`shared cloud mode → ${cloudApiUrl}`);
      appendLog(`shared cloud mode → ${cloudApiUrl}`);
      await waitForUrlReady(cloudApiUrl);
      createWindow(cloudApiUrl);
    } else {
      bootLog('local hub mode');
      PORT = await pickPort(4000);
      bootLog(`picked port ${PORT}`);
      startServerInProcess();
      bootLog('server started, waiting ready');
      await waitForLocalReady();
      bootLog('ready, creating window');
      createWindow(`http://127.0.0.1:${PORT}`);
    }
  } catch (err) {
    const msg = err && err.stack ? err.stack : String(err);
    bootLog(`FATAL ${msg}`);
    appendLog(`FATAL ${msg}`);
    dialog.showErrorBox('TeamTask failed to start', err.message || String(err));
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(cloudApiUrl || `http://127.0.0.1:${PORT}`);
    }
  });
});

process.on('uncaughtException', (err) => {
  bootLog(`uncaughtException ${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (err) => {
  bootLog(`unhandledRejection ${err && err.stack ? err.stack : err}`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
