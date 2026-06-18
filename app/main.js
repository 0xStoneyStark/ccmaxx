const { app, BrowserWindow, ipcMain, screen, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DYNAMIC_DIR = path.join(os.homedir(), '.ccmaxx');

let win;

function create() {
  const { width: SW } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: 380,
    height: 620,
    x: Math.max(20, SW - 400),
    y: 52,
    frame: false,
    resizable: true, // required so win.setSize() works for minimize↔bubble↔restore (frameless = no visible handles)
    alwaysOnTop: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    roundedCorners: true,
    hasShadow: true,
    backgroundColor: '#1b1714', // solid editorial background
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // allow preload to read cheats.json via fs
      spellcheck: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // macOS: behave like a floating utility — no dock icon, visible on every Space incl. fullscreen
  if (process.platform === 'darwin') {
    try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
  }
  win.loadFile(path.join(__dirname, 'index.html'));
  // hot-reload: when `ccmaxx scan/refresh` regenerates cheats_dynamic.json, tell the renderer
  try {
    fs.mkdirSync(DYNAMIC_DIR, { recursive: true });
    let deb;
    fs.watch(DYNAMIC_DIR, (_ev, fn) => {
      if (fn && !String(fn).includes('cheats_dynamic')) return;
      clearTimeout(deb);
      deb = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('cheats-updated'); }, 400);
    });
  } catch {}
  if (process.env.CC_CAPTURE) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const mode = process.env.CC_CAPTURE;
          if (mode === 'cheats') { await win.webContents.executeJavaScript("document.getElementById('tabChe').click();"); await new Promise((r) => setTimeout(r, 500)); }
          else if (mode === 'min') { await win.webContents.executeJavaScript("document.getElementById('minBtn').click();"); await new Promise((r) => setTimeout(r, 600)); }
          else if (mode === 'close') { await win.webContents.executeJavaScript("document.getElementById('closeBtn').click();"); await new Promise((r) => setTimeout(r, 600)); }
          else if (mode === 'minexpand') { await win.webContents.executeJavaScript("document.getElementById('minBtn').click();"); await new Promise((r) => setTimeout(r, 500)); await win.webContents.executeJavaScript("document.getElementById('bubble').click();"); await new Promise((r) => setTimeout(r, 500)); }
          const [cw, ch] = win.getSize();
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(__dirname, '_capture.png'), img.toPNG());
          fs.writeFileSync(path.join(__dirname, '_capture_size.txt'), cw + 'x' + ch);
        } catch (e) {}
      }, 1000);
    });
  }
  // capture the REAL composited screen (acrylic + desktop) so I can verify the actual look
  if (process.env.CC_DESKTOP) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const { desktopCapturer, screen } = require('electron');
          const sz = screen.getPrimaryDisplay().size;
          const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: sz.width, height: sz.height } });
          require('fs').writeFileSync(path.join(__dirname, '_desktop.png'), sources[0].thumbnail.toPNG());
        } catch (e) {
          require('fs').writeFileSync(path.join(__dirname, '_desktop_err.txt'), String(e));
        }
      }, 1400);
    });
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) { try { app.dock.hide(); } catch {} }
  create();
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('copy', (_e, text) => {
  try { clipboard.writeText(String(text == null ? '' : text)); return true; }
  catch (e) { return false; }
});

ipcMain.on('set-state', (_e, { w, h, corner }) => {
  if (!win) return;
  w = Math.round(w); h = Math.round(h);
  win.setSize(w, h);
  if (corner === 'br') {
    const wa = screen.getPrimaryDisplay().workAreaSize;
    win.setPosition(Math.max(0, wa.width - w - 18), Math.max(0, wa.height - h - 18));
  }
});

ipcMain.on('set-on-top', (_e, v) => { if (win) win.setAlwaysOnTop(!!v, 'screen-saver'); });
ipcMain.on('quit', () => app.quit());
