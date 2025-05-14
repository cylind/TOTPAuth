// background.js - Service Worker

const WORKER_CONFIG_KEY_BG = 'workerConfig'; // Use constants
const ENTRIES_KEY_BG = 'entries';

// Helper function to backup via Worker from background
// NOTE: This duplicates logic from options.js. Consider refactoring into a shared module if complexity grows.
// It also needs error handling.
async function backupViaWorkerInBackground() {
    console.log("Attempting background backup via Worker...");
    try {
        const configResult = await chrome.storage.local.get(WORKER_CONFIG_KEY_BG);
        const entriesResult = await chrome.storage.local.get(ENTRIES_KEY_BG);
        const config = configResult.workerConfig;
        const entries = entriesResult.entries;

        if (!config || !config.url || !config.token || !entries) {
            console.log("Background backup skipped: Worker config or entries missing.");
            return;
        }
        if (!config.enableAutoBackup) {
             console.log("Background backup skipped: Auto-backup disabled.");
             return;
        }


        const options = {
            method: 'POST',
            headers: {
                'X-API-Token': config.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(entries) // Send current entries
        };

        const baseUrl = config.url.endsWith('/') ? config.url : config.url + '/';
        const fullUrl = baseUrl + 'backup';

        const response = await fetch(fullUrl, options);

        if (!response.ok) {
            let errorText = `HTTP error ${response.status}`;
            try {
                 const errorData = await response.json();
                 errorText = errorData.error || errorText;
            } catch(e) { /* Ignore if response not JSON */ }
            throw new Error(errorText);
        }
        console.log("Background backup via Worker successful.");

    } catch (error) {
        console.error("Error during background backup via Worker:", error);
        // Maybe notify the user? Or just log.
        // chrome.notifications.create(...) // Requires "notifications" permission
    }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    // Check if 'entries' changed in 'local' storage
    if (namespace === 'local' && changes.entries) {
        console.log('Background: Detected change in entries. Triggering Worker backup check.');
        // Trigger backup check asynchronously
        backupViaWorkerInBackground();
    }
});

console.log("Background script loaded and listener attached."); // Confirm background script runs