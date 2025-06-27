const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');
const pty = require('node-pty');
let shellPty = null;

// GPU Configuration
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('disable-vulkan');
app.commandLine.appendSwitch('disable-glsl-translator');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webgl: false,
      enablePreferredSizeMode: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  console.log("Registered IPC Handlers:", 
    ipcMain.eventNames().filter(k => typeof k === 'string')
  );
});

ipcMain.handle('run-command', async (event, cmd, password = '') => {
  try {
    if (cmd.startsWith("sudo")) {
      const sudoCmd = cmd.replace(/^sudo/, 'sudo -S');
      const result = spawnSync('/bin/bash', ['-c', sudoCmd], {
        input: password + '\n',
        encoding: 'utf8'
      });
      if (result.stderr && result.stderr.toLowerCase().includes('incorrect password')) {
        return "Incorrect password.";
      }
      return result.stdout + (result.stderr || "");
    } else {
      const output = execSync(cmd, { encoding: 'utf8' });
      return output;
    }
  } catch (err) {
    return err.stderr?.toString() || err.toString();
  }
});


// ---- PTY Terminal ----
ipcMain.handle('create-pty', (event) => {
  if (shellPty) {
    shellPty.kill();
    shellPty = null;
  }
  shellPty = pty.spawn(process.env.SHELL || 'bash', [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env
  });
  shellPty.onData(data => {
    event.sender.send('pty-data', data);
  });
});
ipcMain.on('pty-write', (event, data) => {
  if (shellPty) shellPty.write(data);
});

// ---- Package Manager Detection ----
function detectPackageManagers() {
  const managers = [
    { name: "apt", label: "Debian/Ubuntu", installed: false, compatible: false },
    { name: "dnf", label: "Fedora/RHEL", installed: false, compatible: false },
    { name: "pacman", label: "Arch/Manjaro", installed: false, compatible: false },
    { name: "zypper", label: "openSUSE", installed: false, compatible: false },
    { name: "flatpak", label: "Flatpak", installed: false, compatible: true },
    { name: "snap", label: "Snap", installed: false, compatible: true },
    { name: "nix", label: "Nix", installed: false, compatible: true }
  ];
  let osRelease = "";
  try { osRelease = execSync("cat /etc/os-release").toString(); } catch {}

  managers.forEach(mgr => {
    try { execSync(`which ${mgr.name}`, { stdio: 'ignore' }); mgr.installed = true; } catch {}
    if (
      (
        osRelease.match(/ID=(arch|manjaro|arcolinux|endeavouros|garuda)/i) ||
        osRelease.match(/ID_LIKE=.*arch.*/i)
      )
      && mgr.name === "pacman"
    ) mgr.compatible = true;
    if (osRelease.includes("Ubuntu") && mgr.name === "apt") mgr.compatible = true;
    if (osRelease.includes("Debian") && mgr.name === "apt") mgr.compatible = true;
    if (osRelease.includes("Fedora") && mgr.name === "dnf") mgr.compatible = true;
    if (osRelease.includes("openSUSE") && mgr.name === "zypper") mgr.compatible = true;
  });
  return managers;
}

ipcMain.handle('detect-managers', async () => detectPackageManagers());

// ---- Category Map ----
function getCategoryMap(manager) {
  let map = {};
  try {
    if (manager === 'pacman') {
      const lines = execSync('pacman -Sg').toString().split('\n');
      for (const line of lines) {
        const [group, pkg] = line.trim().split(/\s+/);
        if (group && pkg) {
          if (!map[pkg]) map[pkg] = [];
          map[pkg].push(group);
        }
      }
    } else if (manager === 'apt') {
      const pkgs = execSync('apt-cache dumpavail').toString().split('\n\n');
      pkgs.forEach(chunk => {
        const name = (chunk.match(/^Package: (.+)$/m) || [])[1];
        const section = (chunk.match(/^Section: (.+)$/m) || [])[1];
        if (name && section) map[name] = [section];
      });
    } else if (manager === 'flatpak') {
      const lines = execSync("flatpak remote-ls flathub --columns=application,category").toString().split('\n');
      lines.slice(1).forEach(line => {
        const [app, cat] = line.trim().split(/\s{2,}/);
        if (app && cat) map[app] = [cat];
      });
    } // Others can be added similarly
  } catch {}
  return map;
}
ipcMain.handle('get-category-map', async (event, manager) => getCategoryMap(manager));

// ---- Fetch Packages ----
function parseInstalled(manager) {
  try {
    switch (manager) {
      case "apt": return execSync("apt list --installed 2>/dev/null").toString().split('\n').map(line => line.split('/')[0]);
      case "pacman": return execSync("pacman -Qq").toString().split('\n');
      case "flatpak": return execSync("flatpak list --app --columns=application").toString().split('\n');
      case "snap": return execSync("snap list | awk 'NR>1 {print $1}'").toString().split('\n');
      default: return [];
    }
  } catch { return []; }
}
function fetchPackageList(manager) {
  let output = "";
  try {
    switch (manager) {
      case "apt":
        output = execSync("apt list --all-versions 2>/dev/null").toString();
        break;
      case "pacman":
        output = execSync("pacman -Sl").toString();
        break;
      case "flatpak":
        output = execSync("flatpak remote-ls flathub --columns=application,summary,developer,download-size").toString();
        break;
      case "snap":
        output = execSync("snap find '' --narrow | awk 'NR>1'").toString();
        break;
      default:
        output = "";
    }
  } catch (err) { return []; }
  const installedList = parseInstalled(manager).filter(Boolean);
  const pkgs = [];
  const lines = output.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    if (manager === "pacman") {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        pkgs.push({
          name: parts[1],
          description: "",
          version: parts[2],
          installed: line.includes("[installed]")
        });
      }
    } else if (manager === "apt") {
      const parts = line.split('/');
      if (parts[0]) {
        pkgs.push({
          name: parts[0],
          description: "",
          installed: installedList.includes(parts[0])
        });
      }
    } else if (manager === "flatpak") {
      const parts = line.split(/\s{2,}/);
      if (parts[0]) {
        pkgs.push({
          name: parts[0],
          description: parts[1] || "",
          author: parts[2] || "",
          size: parts[3] || "",
          installed: installedList.includes(parts[0])
        });
      }
    } else if (manager === "snap") {
      const parts = line.split(/\s{2,}/);
      if (parts[0]) {
        pkgs.push({
          name: parts[0],
          description: parts[1] || "",
          installed: installedList.includes(parts[0])
        });
      }
    }
  }
  return pkgs;
}
ipcMain.handle('fetch-packages', async (event, manager) => fetchPackageList(manager));

// ---- More Details ----
const getPkgDetails = {
  apt: (name) => execSync(`apt-cache show ${name}`).toString(),
  pacman: (name) => execSync(`pacman -Si ${name}`).toString(),
  flatpak: (name) => execSync(`flatpak remote-info flathub ${name}`).toString(),
  snap: (name) => execSync(`snap info ${name}`).toString(),
};
ipcMain.handle('fetch-package-details', async (event, manager, name) => {
  try {
    if (getPkgDetails[manager]) {
      return getPkgDetails[manager](name);
    }
    return "Details not available.";
  } catch (err) {
    return "Could not fetch details.\n" + (err.stderr?.toString() || err.toString());
  }
});

// ---- Install/Uninstall ----
ipcMain.handle('install-package', async (event, manager, name, password = '') => {
  console.log("Checking manager: "+manager);
  try {
    let installCmd = "";
    switch (manager) {
      case "apt": installCmd = `sudo -S apt install -y ${name}`; break;
      case "pacman": installCmd = `sudo -S pacman -S --noconfirm ${name}`; break;
      case "dnf": installCmd = `sudo -S dnf install -y ${name}`; break;
      case "flatpak": installCmd = `flatpak install -y flathub ${name}`; break;
      case "snap": installCmd = `sudo -S snap install ${name}`; break;
      default:
        console.log("Unknown manager:", manager);
        return false;
    }

    console.log("Running install: ", installCmd);

    if (installCmd.startsWith("sudo -S")) {
      const result = spawnSync('/bin/bash', ['-c', installCmd], {
        input: password + '\n',
        encoding: 'utf8'
      });
      console.log("stdout:", result.stdout);
      console.log("stderr:", result.stderr);
      console.log("exit code:", result.status);
      return result.status === 0;
    } else {
      execSync(installCmd, { stdio: 'inherit' });
      return true;
    }
  } catch (err) {
    console.error("Install failed:", err);
    return false;
  }
});
ipcMain.handle('uninstall-package', async (event, manager, name, password = '') => {
  try {
    let uninstallCmd = "";
    switch (manager) {
      case "apt": uninstallCmd = `sudo -S apt remove -y ${name}`; break;
      case "pacman": uninstallCmd = `sudo -S pacman -R --noconfirm ${name}`; break;
      case "flatpak": uninstallCmd = `flatpak uninstall -y ${name}`; break;
      case "snap": uninstallCmd = `sudo -S snap remove ${name}`; break;
      default: return false;
    }
    if (uninstallCmd.startsWith("sudo -S")) {
      const result = spawnSync('/bin/bash', ['-c', uninstallCmd], {
        input: password + '\n',
        encoding: 'utf8'
      });
      return result.status === 0;
    } else {
      execSync(uninstallCmd, { stdio: 'ignore' });
      return true;
    }
  } catch { return false; }
});

// ---- Drag-and-Drop and File Menu Install ----
ipcMain.handle('install-from-file', async (event, filePath, password = '') => {
  if (!fs.existsSync(filePath)) return { ok: false, msg: "File does not exist" };
  const ext = path.extname(filePath).toLowerCase();
  let cmd = "";
  if (ext === '.deb') {
    if (!detectPackageManagers().find(m => m.name === "apt" && m.installed))
      return { ok: false, msg: "Debian packages (.deb) are not supported on this system." };
    cmd = `sudo -S dpkg -i "${filePath}"`;
  } else if (ext === '.rpm') {
    if (!detectPackageManagers().find(m => m.name === "dnf" && m.installed))
      return { ok: false, msg: "RPM packages (.rpm) are not supported on this system." };
    cmd = `sudo -S rpm -i "${filePath}"`;
  } else if (ext === '.flatpakref') {
    if (!detectPackageManagers().find(m => m.name === "flatpak" && m.installed))
      return { ok: false, msg: "Flatpak refs are not supported on this system." };
    cmd = `flatpak install -y "${filePath}"`;
  } else if (ext === '.snap') {
    if (!detectPackageManagers().find(m => m.name === "snap" && m.installed))
      return { ok: false, msg: "Snap packages are not supported on this system." };
    cmd = `sudo -S snap install "${filePath}"`;
  } else {
    return { ok: false, msg: "Unsupported package type: " + ext };
  }
  try {
    if (cmd.startsWith("sudo -S")) {
      const result = spawnSync('/bin/bash', ['-c', cmd], {
        input: password + '\n',
        encoding: 'utf8'
      });
      if (result.status !== 0) throw new Error(result.stderr || "Unknown error");
      return { ok: true, msg: "Installed successfully." };
    } else {
      execSync(cmd, { stdio: 'ignore' });
      return { ok: true, msg: "Installed successfully." };
    }
  } catch (err) {
    return { ok: false, msg: err.stderr?.toString() || err.toString() };
  }
});

// ---- System Health Monitor ----
ipcMain.handle('get-system-health', () => {
  try {
    const disk = execSync('df -h /').toString().split('\n')[1].split(/\s+/);
    return {
      freemem: os.freemem(),
      totalmem: os.totalmem(),
      loadavg: os.loadavg(),
      disk: {
        size: disk[1],
        used: disk[2],
        avail: disk[3],
        percent: disk[4]
      }
    };
  } catch {
    return {
      freemem: os.freemem(),
      totalmem: os.totalmem(),
      loadavg: os.loadavg(),
      disk: {}
    };
  }
});
