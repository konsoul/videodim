// main.js
const { app, BrowserWindow, screen, ipcMain } = require('electron')
const Store = require('electron-store')
const store = new Store()

// Handle Windows squirrel events
try {
  if (process.platform === 'win32' && require('electron-squirrel-startup'))
    app.quit()
} catch (e) {
  // Squirrel startup check not available, skipping
}

let overlayWindows = new Map()
let controlWindow = null

const settings = {
  enabled: store.get('enabled', true),
  opacity: store.get('opacity', 0.3),
  color: store.get('color', '#000000'),
  activeDisplays: store.get('activeDisplays', []),
}

function getPlatformSpecificConfig() {
  switch (process.platform) {
    case 'win32':
      return {
        type: 'toolbar',
        setVisibility: (window) => window.setSkipTaskbar(true),
      }
    case 'linux':
      return {
        type: 'dock',
        setVisibility: (window) => {
          window.setSkipTaskbar(true)
          window.setAlwaysOnTop(true, 'pop-up-menu')
        },
      }
    default: // macOS
      return {
        type: 'panel',
        setVisibility: (window) =>
          window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }),
      }
  }
}

function createOverlayForDisplay(display) {
  const platformConfig = getPlatformSpecificConfig()

  const overlay = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    type: platformConfig.type,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  overlay.loadFile('overlay.html')
  overlay.setIgnoreMouseEvents(true)

  // Apply platform-specific configurations
  platformConfig.setVisibility(overlay)

  // Set always on top with platform-specific level
  const topLevel =
    process.platform === 'win32'
      ? 'screen-saver'
      : process.platform === 'linux'
      ? 'pop-up-menu'
      : 'screen-saver'
  overlay.setAlwaysOnTop(true, topLevel)

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
    const topLevel =
      process.platform === 'win32'
        ? 'screen-saver'
        : process.platform === 'linux'
        ? 'pop-up-menu'
        : 'screen-saver'
    overlay.setAlwaysOnTop(true, topLevel)
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

// Initialize app
app.whenReady().then(() => {
  if (process.platform === 'linux') {
    app.setName('Video Dimmer')
  }

  const displays = screen.getAllDisplays()
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
