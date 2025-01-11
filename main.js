// main.js
const { app, BrowserWindow, screen, ipcMain } = require('electron')
const Store = require('electron-store')
const store = new Store()

let overlayWindows = new Map()
let controlWindow = null

// Initialize settings with default values
const settings = {
  enabled: store.get('enabled', true),
  opacity: store.get('opacity', 0.3),
  color: store.get('color', '#000000'),
  activeDisplays: store.get('activeDisplays', []),
}

function createOverlayForDisplay(display) {
  const overlay = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    type: 'panel', // This helps with window layering
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  overlay.loadFile('overlay.html')
  overlay.setIgnoreMouseEvents(true)
  overlay.setVisibleOnAllWorkspaces(true)

  // Ensure overlay stays on top
  overlay.setAlwaysOnTop(true, 'screen-saver')

  overlay.webContents.on('did-finish-load', () => {
    overlay.webContents.send('apply-settings', settings)
    updateOverlayVisibility(display.id, overlay)
  })

  overlayWindows.set(display.id, overlay)
}

function updateOverlayVisibility(displayId, overlay) {
  if (!overlay) return

  const shouldShow =
    settings.enabled && settings.activeDisplays.includes(displayId)

  if (shouldShow) {
    overlay.show()
    overlay.setAlwaysOnTop(true, 'screen-saver')
  } else {
    overlay.hide()
  }
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 500,
    height: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'Video Dimmer Controls',
  })

  controlWindow.loadFile('control.html')

  controlWindow.webContents.on('did-finish-load', () => {
    const displays = screen.getAllDisplays().map((display) => ({
      id: display.id,
      name: `Display ${display.id} (${display.size.width}x${display.size.height})`,
    }))

    controlWindow.webContents.send('init-settings', { ...settings, displays })
  })

  controlWindow.show()
}

app.whenReady().then(() => {
  const displays = screen.getAllDisplays()
  console.log('Available displays:', displays)

  for (const display of displays) {
    createOverlayForDisplay(display)
  }
  createControlWindow()
})

ipcMain.on('update-settings', (event, newSettings) => {
  Object.assign(settings, newSettings)

  for (const [key, value] of Object.entries(newSettings)) {
    store.set(key, value)
  }

  overlayWindows.forEach((overlay, displayId) => {
    updateOverlayVisibility(displayId, overlay)
    if (settings.activeDisplays.includes(displayId)) {
      overlay.webContents.send('apply-settings', settings)
    }
  })
})

// Prevent app from closing when all windows are closed
app.on('window-all-closed', (e) => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (controlWindow === null) {
    createControlWindow()
  }
})
