// === AnyPkg Modern Renderer.js ===
window.onload = async () => {
  // --- DOM Elements ---
  // Topbar with settings, install file button
  const topbar = document.createElement('div');
  topbar.id = 'topbar';
  topbar.style.display = 'flex';
  topbar.style.justifyContent = 'space-between';
  topbar.style.alignItems = 'center';
  topbar.style.padding = '0.5em 1em';
  topbar.style.background = '#222';
  topbar.style.color = '#fff';
  topbar.style.fontSize = '1.1em';
  topbar.innerHTML = '<b>AnyPkg</b>';
  document.body.appendChild(topbar);

  // Install from file button
  const fileBtn = document.createElement('button');
  fileBtn.textContent = "Install from File";
  fileBtn.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      if (input.files && input.files[0]) {
        await handleInstallFromFile(input.files[0].path);
      }
    };
    input.click();
  };
  topbar.appendChild(fileBtn);

  // Theme toggle (optional)
  const themeToggle = document.createElement('button');
  themeToggle.textContent = 'Toggle Theme';
  themeToggle.style.marginLeft = '1em';
  themeToggle.onclick = () => {
    const dark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  };
  topbar.appendChild(themeToggle);

  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-theme');
  const themeStyle = document.createElement('style');
  themeStyle.textContent = `
    body.dark-theme { background: #181a20; color: #f3f3f3; }
    body.dark-theme input, body.dark-theme select, body.dark-theme button { background: #333; color: #eee; border: 1px solid #555; }
    body.dark-theme .package-entry { background: #292929; border: 1px solid #444; }
    .tab.active { background: #333 !important; border-radius: 6px 6px 0 0; }
    .tab.green { color: #41cf54; }
    .tab.yellow { color: #fa0; }
    .tab.red { color: #f45; }
    .category.selected { font-weight: bold; color: #41cf54; }
  `;
  document.head.appendChild(themeStyle);

  // Tabbar and main layout
  const tabbar = document.createElement('div');
  tabbar.className = 'tabbar';
  document.body.appendChild(tabbar);

  const tabs = []; //Tabs definition

  const main = document.createElement('div');
  main.className = 'main';
  main.style.display = 'flex';
  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';
  sidebar.style.minWidth = '220px';
  sidebar.style.maxWidth = '270px';
  sidebar.style.background = '#2223';
  const content = document.createElement('div');
  content.className = 'content';
  content.style.flex = '1 1 0%';
  main.appendChild(sidebar);
  main.appendChild(content);
  document.body.appendChild(main);

  // Install Queue
  let installQueue = [];
  const queuePanel = document.createElement('div');
  queuePanel.id = 'queuePanel';
  queuePanel.style = 'position:fixed; bottom:1em; right:1em; background:#222; color:#fff; padding:1em; border-radius:8px; max-height:200px; overflow:auto; font-size:0.9em; z-index:9999;';
  document.body.appendChild(queuePanel);
  const updateQueuePanel = () => {
    queuePanel.innerHTML = '<b>Install Queue</b><br>';
    installQueue.forEach(entry => {
      const line = document.createElement('div');
      line.textContent = `${entry.status} – ${entry.manager}:${entry.package}`;
      queuePanel.appendChild(line);
    });
  };

  // Logs
  const logs = [];
  function appendLog(entry) {
    logs.push(`[${(new Date()).toLocaleTimeString()}] ${entry}`);
    if (logs.length > 1000) logs.shift();
  }

  // ---- Drag-and-drop Install ----
  window.ondragover = (e) => { e.preventDefault(); document.body.classList.add('drag-hover'); };
  window.ondragleave = (e) => { e.preventDefault(); document.body.classList.remove('drag-hover'); };
  window.ondrop = async (e) => {
    e.preventDefault(); document.body.classList.remove('drag-hover');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      await handleInstallFromFile(e.dataTransfer.files[0].path);
    }
  };

  async function handleInstallFromFile(path) {
    const pw = await promptForPassword();
    const result = await window.api.installFromFile(path, pw);
    showPopup(result.ok ? "Install success: " + result.msg : "Install failed: " + result.msg, result.ok);
    appendLog(result.ok ? "File install success: " + path : "File install failed: " + path + " -- " + result.msg);
  }

  // ---- Tabs ----
  let managers = await window.api.detectManagers();
  let currentManager = null;
  let selectedPackages = [];

  // Package Manager Tabs
  managers.forEach(mgr => {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.textContent = mgr.name + (
      mgr.compatible ? (mgr.installed ? ' ✓' : ' ⚠') : ' ✗'
    );
    tab.className = 'tab ' + (mgr.compatible
      ? (mgr.installed ? 'green' : 'yellow')
      : 'red');
    tab.title = !mgr.compatible ? `${mgr.name} is not compatible with your system.` :
      !mgr.installed ? `${mgr.name} is compatible but not installed.` :
        `${mgr.name} is ready to use.`;
    tab.onclick = async () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentManager = mgr.name;
      await loadPkgTab(mgr);
    };
    tabbar.appendChild(tab);
    tabs.push(tab);
  });

  // Multi-Manager Search Tab
  const multiTab = document.createElement('div');
  multiTab.className = 'tab';
  multiTab.textContent = 'Multi-Search';
  multiTab.onclick = () => {
    tabs.forEach(t => t.classList.remove('active'));
    multiTab.classList.add('active');
    loadMultiSearchTab();
  };
  tabbar.appendChild(multiTab);
  tabs.push(multiTab);

  // Terminal Tab (real terminal)
  const cliTab = document.createElement('div');
  cliTab.className = 'tab';
  cliTab.textContent = 'Terminal';
  cliTab.onclick = () => {
    tabs.forEach(t => t.classList.remove('active'));
    cliTab.classList.add('active');
    loadTerminalTab();
  };
  tabbar.appendChild(cliTab);
  tabs.push(cliTab);

  // Logs Tab
  const logsTab = document.createElement('div');
  logsTab.className = 'tab';
  logsTab.textContent = 'Logs';
  logsTab.onclick = () => {
    tabs.forEach(t => t.classList.remove('active'));
    logsTab.classList.add('active');
    loadLogsTab();
  };
  tabbar.appendChild(logsTab);
  tabs.push(logsTab);

  // ---- Helper Functions ----
  function showPopup(text, success = true) {
    const popup = document.createElement('div');
    popup.textContent = text;
    popup.style.position = 'fixed';
    popup.style.bottom = '1em';
    popup.style.left = '50%';
    popup.style.transform = 'translateX(-50%)';
    popup.style.background = success ? '#41cf54' : '#e24d4d';
    popup.style.color = '#fff';
    popup.style.padding = '1em';
    popup.style.borderRadius = '8px';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 4000);
  }
  function promptForPassword() {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style = `
        position:fixed;top:0;left:0;width:100vw;height:100vh;
        background:#000a;z-index:99999;display:flex;align-items:center;justify-content:center;
      `;
      // Create modal box
      const box = document.createElement('div');
      box.style = `
        background:#222;color:#fff;padding:2em;border-radius:10px;min-width:320px;
        display:flex;flex-direction:column;gap:1em;box-shadow:0 8px 32px #000a;
      `;
      box.innerHTML = `<div>Enter your <b>sudo</b> password:</div>`;
      // Input
      const input = document.createElement('input');
      input.type = "password";
      input.autofocus = true;
      input.style = "width:100%;font-size:1.1em;padding:0.5em;margin-bottom:0.5em;";
      box.appendChild(input);
      // Button row
      const row = document.createElement('div');
      row.style = "display:flex;justify-content:flex-end;gap:1em;";
      const ok = document.createElement('button');
      ok.textContent = "OK";
      ok.onclick = () => {
        cleanup();
        resolve(input.value || "");
      };
      const cancel = document.createElement('button');
      cancel.textContent = "Cancel";
      cancel.onclick = () => {
        cleanup();
        resolve("");
      };
      row.appendChild(cancel);
      row.appendChild(ok);
      box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      input.focus();

      function cleanup() {
        overlay.remove();
      }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ok.onclick();
        if (e.key === 'Escape') cancel.onclick();
      });
    });
  }
  function showDetailsPopup(name, info) {
    const overlay = document.createElement('div');
    overlay.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000a;z-index:99999;';
    const box = document.createElement('div');
    box.style = 'background:#222;color:#fff;padding:2em;border-radius:10px;max-width:600px;max-height:80vh;overflow:auto;margin:10vh auto;';
    box.innerHTML = `<h2>${name}</h2><pre style="white-space:pre-wrap;">${info}</pre><br>
      <button onclick="document.body.removeChild(this.parentElement.parentElement)">Close</button>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
  async function installAndNotify(manager, pkgName) {
    const pw = await promptForPassword();
    console.log("Trying to install "+pkgName+" from "+manager+" with pw: "+pw);
    const result = await window.api.installPackage(manager, pkgName, pw);
    console.log("Success is "+result);
    if (result) {
      showPopup("Installed successfully.");
      appendLog(`Installed ${pkgName} via ${manager}`);
    } else {
      showPopup("Install failed.", false);
      appendLog(`Failed to install ${pkgName} via ${manager}`);
    }
  }

  async function uninstallAndNotify(manager, pkgName) {
    const pw = await promptForPassword();
    const result = await window.api.uninstallPackage(manager, pkgName, pw);
    if (result) {
      showPopup("Uninstalled successfully.");
      appendLog(`Uninstalled ${pkgName} via ${manager}`);
    } else {
      showPopup("Uninstall failed.", false);
      appendLog(`Failed to uninstall ${pkgName} via ${manager}`);
    }
  }

  async function installAndRefresh(manager) {
    const pw = await promptForPassword();
    let cmd = "";
    // Customize these as needed for your distro
    if (manager === "flatpak") cmd = "sudo -S pacman -S flatpak";
    if (manager === "snap") cmd = "sudo -S pacman -S snapd";
    if (manager === "apt") cmd = "sudo -S apt install apt";
    if (manager === "dnf") cmd = "sudo -S dnf install dnf";
    // You can expand more as needed
    if (!cmd) {
      showPopup(`Automatic install not available for ${manager}.`, false);
      return;
    }
    const result = await window.api.runCommand(cmd, pw);
    if (result && !result.toLowerCase().includes("error")) {
      showPopup(`${manager} installed! Please restart AnyPkg.`, true);
    } else {
      showPopup(`Install failed: ${result}`, false);
      appendLog(`Failed to install ${manager}`);
    }
  }

  // ---- Package Tab ----
  async function loadPkgTab(mgr) {
    sidebar.innerHTML = '';
    content.innerHTML = '';
    selectedPackages = [];
    // --- System Health Monitor ---
    const health = await window.api.getSystemHealth();
    const sysbox = document.createElement('div');
    sysbox.style = 'padding:0.4em 0.6em; background:#333; color:#fff; border-radius:5px; margin-bottom:0.9em; font-size:0.93em;';
    sysbox.innerHTML = `
      <b>System Health:</b> Free disk: ${health.disk.avail || '??'} (${health.disk.percent || '?'}) | RAM: ${Math.round(health.freemem / (1024 ** 2))} MB free | Load: ${health.loadavg.map(x=>x.toFixed(2)).join(', ')}`;
    sidebar.appendChild(sysbox);

    // --- Update All Button ---
    const updBtn = document.createElement('button');
    updBtn.textContent = "Update All";
    updBtn.style = "margin-bottom:0.7em;display:block;width:90%;";
    updBtn.onclick = async () => {
      const pw = await promptForPassword();
      let cmd = "";
      if (mgr.name === "apt") cmd = "sudo -S apt update && sudo -S apt upgrade -y";
      if (mgr.name === "pacman") cmd = "sudo -S pacman -Syu";
      if (mgr.name === "flatpak") cmd = "flatpak update -y";
      if (mgr.name === "snap") cmd = "sudo -S snap refresh";
      if (!cmd) { showPopup("Update not supported", false); return; }
      appendLog(`Updating all packages for ${mgr.name}...`);
      const result = await window.api.runCommand(cmd, pw);
      showPopup("Update complete. See logs for details.");
      appendLog(result);
    };
    sidebar.appendChild(updBtn);

    if (!mgr.compatible) {
      content.textContent = `Package manager not compatible with your system.`;
      return;
    }
    if (!mgr.installed) {
      content.innerHTML = `<p>${mgr.name} is compatible but not installed.</p>
        <button onclick="installAndRefresh('${mgr.name}')">Install ${mgr.name}</button>`;
      return;
    }
    // Fetch category map and packages
    const categoryMap = await window.api.fetchCategories(mgr.name);
    const allPkgs = await window.api.fetchPackages(mgr.name);

    // Sidebar: All / Installed / Categories
    function clearCatSelection() {
      sidebar.querySelectorAll('.category').forEach(c => c.classList.remove('selected'));
    }
    const catAll = document.createElement('div');
    catAll.className = 'category selected';
    catAll.textContent = 'All';
    catAll.onclick = () => { clearCatSelection(); catAll.classList.add('selected'); filterAndDraw(''); };
    sidebar.appendChild(catAll);

    const catInstalled = document.createElement('div');
    catInstalled.className = 'category';
    catInstalled.textContent = 'Installed';
    catInstalled.onclick = () => { clearCatSelection(); catInstalled.classList.add('selected'); filterAndDraw('', true); };
    sidebar.appendChild(catInstalled);

    const allCats = new Set();
    for (const cats of Object.values(categoryMap)) cats.forEach(cat => allCats.add(cat));
    if (allCats.size) {
      Array.from(allCats).sort().forEach(catName => {
        const cat = document.createElement('div');
        cat.className = 'category';
        cat.textContent = catName;
        cat.title = `View packages in ${catName}`;
        cat.onclick = () => {
          clearCatSelection(); cat.classList.add('selected'); filterAndDraw(catName);
        };
        sidebar.appendChild(cat);
      });
    } else {
      const noCat = document.createElement('div');
      noCat.textContent = 'No categories found';
      noCat.style.color = '#aaa';
      noCat.style.fontStyle = 'italic';
      sidebar.appendChild(noCat);
    }

    // Search
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search packages...';
    searchInput.style.width = '90%';
    searchInput.style.margin = '0.5em 0 0.5em 0';
    sidebar.appendChild(searchInput);

    function drawPackages(list) {
      content.innerHTML = '';
      list.forEach(pkg => {
        const div = document.createElement('div');
        div.className = 'package-entry';
        div.style = 'margin:0.7em 0;padding:1em;border-radius:8px;';
        // Multi-select checkbox
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.style.marginRight = '1em';
        cb.checked = selectedPackages.includes(pkg.name);
        cb.onchange = () => {
          if (cb.checked) selectedPackages.push(pkg.name);
          else selectedPackages = selectedPackages.filter(n => n !== pkg.name);
          updateInstallSelectedButton();
        };
        div.appendChild(cb);

        // Package details
        div.innerHTML += `
          <b>${pkg.name}</b><br>
          <span style="font-size:0.97em;">${pkg.description || ''}</span><br>
          ${pkg.author ? `<span><b>Author:</b> ${pkg.author}</span><br>` : ''}
          ${pkg.size ? `<span><b>Size:</b> ${pkg.size}</span><br>` : ''}
        `;
        // More details button
        const detailsBtn = document.createElement('button');
        detailsBtn.textContent = 'More details';
        detailsBtn.onclick = async () => {
          const info = await window.api.fetchPackageDetails(mgr.name, pkg.name);
          showDetailsPopup(pkg.name, info);
        };
        div.appendChild(detailsBtn);

        // Install/Uninstall buttons
        if (pkg.installed) {
          const unBtn = document.createElement('button');
          unBtn.textContent = 'Uninstall';
          unBtn.onclick = () => uninstallAndNotify(mgr.name, pkg.name);
          div.appendChild(unBtn);
        } else {
          const inBtn = document.createElement('button');
          inBtn.textContent = 'Install';
          inBtn.onclick = () => installAndNotify(mgr.name, pkg.name);
          div.appendChild(inBtn);
        }
        content.appendChild(div);
      });
      updateInstallSelectedButton();
    }

    function filterAndDraw(catOrQuery = '', onlyInstalled = false) {
      let filtered = [...allPkgs];
      if (onlyInstalled) filtered = filtered.filter(pkg => pkg.installed);
      else if (catOrQuery && catOrQuery !== 'All') {
        filtered = filtered.filter(pkg => categoryMap[pkg.name] && categoryMap[pkg.name].includes(catOrQuery));
      }
      const query = searchInput.value.trim();
      if (query.length > 0) filtered = filtered.filter(pkg => pkg.name.includes(query) || pkg.description.includes(query));
      drawPackages(filtered);
    }
    filterAndDraw('');

    // ---- Multi-Install Button ----
    function updateInstallSelectedButton() {
      let btn = document.getElementById('install-selected-btn');
      if (btn) btn.remove();
      if (selectedPackages.length > 0) {
        btn = document.createElement('button');
        btn.id = 'install-selected-btn';
        btn.style = 'position:fixed;bottom:2em;left:50%;transform:translateX(-50%);z-index:9999;background:#32a852;color:#fff;padding:1em 2em;border-radius:12px;';
        btn.textContent = `Install Selected (${selectedPackages.length})`;
        btn.onclick = async () => {
          const pw = await promptForPassword();
          for (const name of selectedPackages) {
            await window.api.installPackage(mgr.name, name, pw);
            appendLog(`Batch installed: ${name} [${mgr.name}]`);
          }
          selectedPackages = [];
          updateInstallSelectedButton();
          showPopup("Batch install finished. See logs for details.");
        };
        document.body.appendChild(btn);
      }
    }
  }

  // ---- Terminal Tab ----
  async function loadTerminalTab() {
    sidebar.innerHTML = '';
    content.innerHTML = '';
    const terminalContainer = document.createElement('div');
    terminalContainer.id = 'terminal-container';
    terminalContainer.style.width = '100%';
    terminalContainer.style.height = '70vh';
    terminalContainer.style.background = '#181a20';
    content.appendChild(terminalContainer);
    const term = new window.Terminal();
    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainer);
    fitAddon.fit();

    // Connect to backend PTY
    window.api.createPty();

    // Data flow
    window.api.onPtyData(data => term.write(data));
    term.onData(data => window.api.writePty(data));

    // Optional: Resize on container resize
    window.addEventListener('resize', () => fitAddon.fit());
  }

  // ---- Multi-Search Tab ----
  async function loadMultiSearchTab() {
    sidebar.innerHTML = '';
    content.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search across all installed managers';
    input.style.width = '100%';
    const results = document.createElement('div');
    results.style.marginTop = '1em';
    content.appendChild(input);
    content.appendChild(results);

    // Update All button for all managers
    const updBtn = document.createElement('button');
    updBtn.textContent = "Update All Managers";
    updBtn.style = "margin:0.7em 0;display:block;";
    updBtn.onclick = async () => {
      const pw = await promptForPassword();
      appendLog("Updating all package managers...");
      for (const mgr of managers.filter(m => m.installed)) {
        let cmd = "";
        if (mgr.name === "apt") cmd = "sudo -S apt update && sudo -S apt upgrade -y";
        if (mgr.name === "pacman") cmd = "sudo -S pacman -Syu";
        if (mgr.name === "flatpak") cmd = "flatpak update -y";
        if (mgr.name === "snap") cmd = "sudo -S snap refresh";
        if (!cmd) continue;
        appendLog(`Updating all packages for ${mgr.name}...`);
        const result = await window.api.runCommand(cmd, pw);
        appendLog(result);
      }
      showPopup("Multi-manager update complete. See logs for details.");
    };
    content.insertBefore(updBtn, results);

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        results.innerHTML = '<em>Searching...</em>';
        const queries = await Promise.all(
          managers.filter(m => m.installed).map(async (m) => {
            const pkgs = await window.api.fetchPackages(m.name);
            return pkgs.filter(p => p.name.includes(input.value) || (p.description && p.description.includes(input.value))).map(p => ({ ...p, manager: m.name }));
          })
        );
        const combined = queries.flat();
        results.innerHTML = '';
        if (combined.length === 0) {
          results.innerHTML = '<p>No results found.</p>';
          return;
        }
        combined.forEach(pkg => {
          const div = document.createElement('div');
          div.className = 'package-entry';
          div.innerHTML = `
            <b>${pkg.name}</b> (${pkg.manager})<br>
            ${pkg.description || ''}<br>
            <button onclick="installAndNotify('${pkg.manager}', '${pkg.name}')">Install</button>
            <button onclick="uninstallAndNotify('${pkg.manager}', '${pkg.name}')">Uninstall</button>
          `;
          content.appendChild(div);
        });
      }
    });
  }

  // ---- Logs Tab ----
  function loadLogsTab() {
    sidebar.innerHTML = '';
    content.innerHTML = '';
    const panel = document.createElement('div');
    panel.style.whiteSpace = 'pre-wrap';
    panel.style.overflowY = 'auto';
    panel.style.height = '80vh';
    panel.style.padding = '1em';
    panel.style.background = '#111';
    panel.style.color = '#eee';
    panel.style.border = '1px solid #444';
    panel.style.fontFamily = 'monospace';
    logs.forEach(log => {
      const line = document.createElement('div');
      line.textContent = log;
      panel.appendChild(line);
    });
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Download Logs';
    saveBtn.onclick = () => {
      const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'anypkg_logs.txt';
      a.click();
      URL.revokeObjectURL(url);
    };
    content.appendChild(panel);
    content.appendChild(saveBtn);
  }

  // Default to first tab
  if (tabs.length) tabs[0].onclick();
};
