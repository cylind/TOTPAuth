document.addEventListener('DOMContentLoaded', () => {
  const backupBtn = document.getElementById('backupBtn');
  const restoreFile = document.getElementById('restoreFile');
  const restoreBtn = document.getElementById('restoreBtn');

  // --- Backup ---
  backupBtn.addEventListener('click', async () => {
    try {
      const result = await chrome.storage.local.get(['entries']);
      const entries = result.entries || [];
      if (entries.length === 0) {
        alert("No entries to backup.");
        return;
      }

      const jsonData = JSON.stringify(entries, null, 2); // Pretty print JSON
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `totp_backup_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert("Backup successful!");
    } catch (error) {
      console.error("Backup failed:", error);
      alert("Backup failed. See console for details.");
    }
  });

  // --- Restore ---
  restoreBtn.addEventListener('click', () => {
    if (!restoreFile.files || restoreFile.files.length === 0) {
      alert("Please select a backup file to restore.");
      return;
    }

    if (!confirm("Restoring will overwrite all current entries. Are you sure?")) {
      return;
    }

    const file = restoreFile.files[0];
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const restoredEntries = JSON.parse(event.target.result);
        // Basic validation: check if it's an array
        if (!Array.isArray(restoredEntries)) {
          throw new Error("Invalid backup file format: Not an array.");
        }
        // Deeper validation could check for 'secret', 'domain' in each object
        restoredEntries.forEach(entry => {
            if (typeof entry.secret !== 'string' || typeof entry.domain !== 'string') {
                // Allow username to be missing or null
                if (entry.username !== undefined && entry.username !== null && typeof entry.username !== 'string') {
                    throw new Error("Invalid entry format in backup file.");
                }
            }
             // Ensure each entry has an ID or assign one
            if (!entry.id) {
                entry.id = Date.now().toString() + Math.random().toString(36).substring(2,7);
            }
        });

        await chrome.storage.local.set({ entries: restoredEntries });
        alert("Restore successful! Your entries have been updated.");
        restoreFile.value = ''; // Clear the file input
      } catch (error) {
        console.error("Restore failed:", error);
        alert(`Restore failed: ${error.message}. Make sure it's a valid JSON backup file.`);
      }
    };

    reader.onerror = () => {
        alert("Failed to read the backup file.");
    };

    reader.readAsText(file);
  });
    // --- Worker Sync Elements ---
  const workerUrlInput = document.getElementById('workerUrl');
  const apiTokenInput = document.getElementById('apiToken');
  const workerEnableAutoBackupInput = document.getElementById('workerEnableAutoBackup');
  const saveWorkerConfigBtn = document.getElementById('saveWorkerConfigBtn');
  const backupWorkerBtn = document.getElementById('backupWorkerBtn');
  const restoreWorkerBtn = document.getElementById('restoreWorkerBtn'); // Renamed
  const workerStatus = document.getElementById('workerStatus'); // Renamed

  const WORKER_CONFIG_KEY = 'workerConfig';

  // --- Load Worker Config ---
  async function loadWorkerConfig() {
    const result = await chrome.storage.local.get(WORKER_CONFIG_KEY);
    if (result.workerConfig) {
      workerUrlInput.value = result.workerConfig.url || '';
      apiTokenInput.value = result.workerConfig.token || ''; // Again, careful with displaying secrets
      workerEnableAutoBackupInput.checked = result.workerConfig.enableAutoBackup || false;
      console.log('Worker Config loaded (Token hidden in console)');
    }
  }

  // --- Save Worker Config ---
  saveWorkerConfigBtn.addEventListener('click', async () => {
    const config = {
      url: workerUrlInput.value.trim(),
      token: apiTokenInput.value.trim(), // Store the token locally (accep the risk or find more secure ways)
      enableAutoBackup: workerEnableAutoBackupInput.checked,
    };
    if (!config.url || !config.token) {
      workerStatus.textContent = '错误：请填写 Worker URL 和 API 令牌。';
      workerStatus.style.color = 'red';
      return;
    }
    // Basic URL validation
    try {
        new URL(config.url);
    } catch (_) {
        workerStatus.textContent = '错误：Worker URL 格式无效。';
        workerStatus.style.color = 'red';
        return;
    }

    await chrome.storage.local.set({ [WORKER_CONFIG_KEY]: config });
    workerStatus.textContent = 'Worker 配置已保存。';
    workerStatus.style.color = 'green';
  });

  // --- Helper: Fetch data from Worker ---
  async function fetchWorker(endpoint, method = 'GET', body = null) {
     const configResult = await chrome.storage.local.get(WORKER_CONFIG_KEY);
     const config = configResult.workerConfig;
     if (!config || !config.url || !config.token) {
         throw new Error("Worker 配置不完整或未保存。");
     }

     const options = {
         method: method,
         headers: {
             'X-API-Token': config.token, // Send token in header
         },
     };

     if (body) {
         options.headers['Content-Type'] = 'application/json';
         options.body = JSON.stringify(body);
     }

     // Ensure URL ends with a slash before appending endpoint
     const baseUrl = config.url.endsWith('/') ? config.url : config.url + '/';
     const fullUrl = baseUrl + endpoint;

     const response = await fetch(fullUrl, options);

     if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            // If response is not JSON
            errorData = { error: `HTTP error ${response.status}: ${response.statusText}`, details: await response.text() };
        }
        throw new Error(errorData.error || `HTTP error ${response.status}`);
     }

     // For GET requests that expect JSON response body
     if (method === 'GET' && response.headers.get('Content-Type')?.includes('application/json')) {
        return await response.json();
     }
      // For POST or other requests where success might just be 200 OK
      if (response.headers.get('Content-Type')?.includes('application/json')) {
         return await response.json(); // Return success message from worker if available
      } else {
         return { success: true }; // Assume success if response.ok and no JSON body
      }
  }

  // --- Backup via Worker ---
  backupWorkerBtn.addEventListener('click', async () => {
    workerStatus.textContent = '正在备份 (通过 Worker)...';
    workerStatus.style.color = 'orange';
    try {
      const entriesResult = await chrome.storage.local.get('entries');
      const entries = entriesResult.entries || [];

      const result = await fetchWorker('backup', 'POST', entries); // Send entries array as body
      workerStatus.textContent = '成功备份 (通过 Worker)!';
      workerStatus.style.color = 'green';
      console.log("Worker backup response:", result);
    } catch (error) {
      console.error("Error backing up via Worker:", error);
      workerStatus.textContent = `备份失败: ${error.message}`;
      workerStatus.style.color = 'red';
    }
  });

  // --- Restore via Worker ---
  restoreWorkerBtn.addEventListener('click', async () => { // Renamed button
    if (!confirm("从 Worker 恢复将覆盖当前所有本地条目。确定要继续吗？")) {
      return;
    }
    workerStatus.textContent = '正在从 Worker 恢复...';
    workerStatus.style.color = 'orange';
    try {
      const restoredEntries = await fetchWorker('restore', 'GET'); // Expects JSON array

      if (!Array.isArray(restoredEntries)) {
        throw new Error("从 Worker 收到的数据格式无效。");
      }

      await chrome.storage.local.set({ entries: restoredEntries });
      workerStatus.textContent = '成功从 Worker 恢复！';
      workerStatus.style.color = 'green';
      alert("恢复成功！关闭选项页后，请重新打开扩展程序图标以查看更新。");

    } catch (error) {
      console.error("Error restoring via Worker:", error);
      workerStatus.textContent = `恢复失败: ${error.message}`;
      workerStatus.style.color = 'red';
    }
  });

  // Load config on page load
  loadWorkerConfig();
});