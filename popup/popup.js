document.addEventListener('DOMContentLoaded', () => {
  const entriesList = document.getElementById('entriesList');
  const addEntryBtn = document.getElementById('addEntryBtn');
  const editEntryView = document.getElementById('editEntryView');
  const entryIdInput = document.getElementById('entryId');
  const secretInput = document.getElementById('secret');
  const domainInput = document.getElementById('domain');
  const usernameInput = document.getElementById('username');
  const saveEntryBtn = document.getElementById('saveEntryBtn');
  const deleteEntryBtn = document.getElementById('deleteEntryBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const openOptionsLink = document.getElementById('openOptionsLink');

  let currentEntries = [];
  let currentTabHostname = '';

  // --- Views ---
  function showListView() {
    entriesList.style.display = 'block';
    document.querySelector('.header h1').textContent = 'TOTP Codes';
    editEntryView.style.display = 'none';
    loadAndDisplayEntries();
  }

  function showEditView(entry = null) {
    entriesList.style.display = 'none';
    editEntryView.style.display = 'block';
    document.querySelector('.header h1').textContent = entry ? 'Edit Entry' : 'Add Entry';

    if (entry) {
      entryIdInput.value = entry.id;
      secretInput.value = entry.secret;
      domainInput.value = entry.domain;
      usernameInput.value = entry.username;
      deleteEntryBtn.style.display = 'inline-block';
    } else {
      entryIdInput.value = ''; // For new entry
      secretInput.value = '';
      domainInput.value = '';
      usernameInput.value = '';
      deleteEntryBtn.style.display = 'none';
    }
  }

  // --- OTP Generation ---
  function generateTotp(secret) {
    try {
      const totp = new OTPAuth.TOTP({
        issuer: "MyExtension", // Optional
        label: "OTPAuth",     // Optional
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret.replace(/\s/g, '').toUpperCase()) // Sanitize secret
      });
      return totp.generate();
    } catch (e) {
      console.error("Error generating TOTP:", e);
      return "Error";
    }
  }

  // --- Data Storage (using chrome.storage.local) ---
  async function getStoredEntries() {
    const result = await chrome.storage.local.get(['entries']);
    return result.entries || [];
  }

  async function storeEntries(entries) {
    await chrome.storage.local.set({ entries });
  }

  // --- Display Logic ---
  async function loadAndDisplayEntries() {
    currentEntries = await getStoredEntries();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        const url = new URL(tab.url);
        currentTabHostname = url.hostname;
      }
    } catch (e) {
      console.warn("Could not get current tab URL:", e);
      currentTabHostname = ''; // Or handle differently
    }

    renderEntries();
  }

  function renderEntries() {
    entriesList.innerHTML = ''; // Clear existing
    if (!currentEntries.length) {
        entriesList.innerHTML = '<p>No entries yet. Click "+" to add one.</p>';
        return;
    }

    const filteredEntries = currentEntries.filter(entry => {
      if (!currentTabHostname || !entry.domain) return true; // Show all if no tab or entry domain
      const entryDomain = entry.domain.toLowerCase();
      const tabHost = currentTabHostname.toLowerCase();
      // Match domain or subdomains (e.g., "google.com" matches "mail.google.com")
      return tabHost === entryDomain || tabHost.endsWith('.' + entryDomain);
    });

    if (!filteredEntries.length && currentEntries.length > 0) {
         entriesList.innerHTML = `<p>No entries match <strong>${currentTabHostname}</strong>. <a href="#" id="showAllEntriesLink">Show all</a>.</p>`;
         const showAllLink = document.getElementById('showAllEntriesLink');
         if (showAllLink) {
             showAllLink.addEventListener('click', (e) => {
                 e.preventDefault();
                 currentTabHostname = ''; // Clear filter
                 renderEntries(); // Re-render with all entries
             });
         }
         return;
    }


    filteredEntries.forEach((entry, index) => {
      const totpCode = generateTotp(entry.secret);
      const entryDiv = document.createElement('div');
      entryDiv.className = 'entry';
      entryDiv.innerHTML = `
        <div class="entry-info">
          <span class="domain">${entry.domain || 'N/A'}</span>
          <span class="username">${entry.username || 'N/A'}</span>
        </div>
        <div class="entry-code">
          <span class="totp-code">${totpCode}</span>
        </div>
        <div class="entry-actions">
          <button class="fill-btn" data-code="${totpCode}">Fill</button>
          <button class="edit-btn" data-id="${entry.id}">Edit</button>
        </div>
      `;
      entriesList.appendChild(entryDiv);
    });

    // Add event listeners for new buttons
    document.querySelectorAll('.fill-btn').forEach(button => {
      button.addEventListener('click', handleFillCode);
    });
    document.querySelectorAll('.edit-btn').forEach(button => {
      button.addEventListener('click', handleEditEntry);
    });

    // Auto-update codes every few seconds
    // Simple way: re-render. More complex: update only codes.
    // For simplicity, we'll stick to re-rendering when the popup opens or data changes.
    // A setInterval could be added here for live updates, but clear it on popup close.
  }

  // --- Event Handlers ---
  addEntryBtn.addEventListener('click', () => {
    showEditView();
  });

  cancelEditBtn.addEventListener('click', () => {
    showListView();
  });

  saveEntryBtn.addEventListener('click', async () => {
    const secret = secretInput.value.trim();
    const domain = domainInput.value.trim().toLowerCase(); // Store domain in lowercase for easier matching
    const username = usernameInput.value.trim();
    const id = entryIdInput.value;

    if (!secret || !domain) {
      alert('Secret and Domain are required!');
      return;
    }

    // Validate secret (basic) - OTPAuth library will throw error on bad secret
    try {
        new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret.replace(/\s/g, '').toUpperCase()) });
    } catch (e) {
        alert('Invalid Secret format. It should be a Base32 string.');
        return;
    }


    let entries = await getStoredEntries();
    if (id) { // Editing existing
      const entryIndex = entries.findIndex(e => e.id === id);
      if (entryIndex > -1) {
        entries[entryIndex] = { ...entries[entryIndex], secret, domain, username };
      }
    } else { // Adding new
      entries.push({ id: Date.now().toString(), secret, domain, username });
    }
    await storeEntries(entries);
    showListView();
  });

  deleteEntryBtn.addEventListener('click', async () => {
    const idToDelete = entryIdInput.value;
    if (!idToDelete || !confirm('Are you sure you want to delete this entry?')) {
      return;
    }
    let entries = await getStoredEntries();
    entries = entries.filter(e => e.id !== idToDelete);
    await storeEntries(entries);
    showListView();
  });

  function handleEditEntry(event) {
    const entryId = event.target.dataset.id;
    const entryToEdit = currentEntries.find(e => e.id === entryId);
    if (entryToEdit) {
      showEditView(entryToEdit);
    }
  }

  async function handleFillCode(event) {
    const code = event.target.dataset.code;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content_scripts/autofill.js']
      }, () => {
        // After script is injected, send message with the code
        chrome.tabs.sendMessage(tab.id, { action: "fillCode", code: code });
        window.close(); // Close popup after attempting to fill
      });
    }
  }

  if (openOptionsLink) {
    openOptionsLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  // Initial load
  showListView();

  // Update codes periodically while popup is open (optional, can consume battery)
  // This is a very basic way; more optimized would be to update only the code text.
  const updateInterval = setInterval(() => {
      if (entriesList.style.display !== 'none') { // Only update if list view is active
        renderEntries(); // This will re-generate and re-render
      }
  }, 15000); // Update every 15 seconds

  // Clear interval when popup closes (important!)
  // This is tricky as popup.js unloads. A background script could manage this,
  // or we accept it runs only when popup is open.
  // For Manifest V3, popup closing unloads its scripts.
});