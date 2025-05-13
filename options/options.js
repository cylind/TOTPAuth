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
});