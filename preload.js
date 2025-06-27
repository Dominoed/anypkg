const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  detectManagers: () => ipcRenderer.invoke('detect-managers'),
  fetchPackages: (manager) => ipcRenderer.invoke('fetch-packages', manager),
  fetchCategories: (manager) => ipcRenderer.invoke('get-category-map', manager),
  installPackage: (manager, name, pw) => ipcRenderer.invoke('install-package', manager, name, pw),
  uninstallPackage: (manager, name, pw) => ipcRenderer.invoke('uninstall-package', manager, name, pw),
  fetchPackageDetails: (manager, name) => ipcRenderer.invoke('fetch-package-details', manager, name),
  getSystemHealth: () => ipcRenderer.invoke('get-system-health'),
  // Terminal PTY
  createPty: () => ipcRenderer.invoke('create-pty'),
  writePty: (data) => ipcRenderer.send('pty-write', data),
  onPtyData: (cb) => ipcRenderer.on('pty-data', (event, data) => cb(data)),
  // Drag-and-drop/file install
  installFromFile: (file, pw) => ipcRenderer.invoke('install-from-file', file, pw),
  runCommand: (cmd, pw) => ipcRenderer.invoke('run-command', cmd, pw)
});
