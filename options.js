document.addEventListener('DOMContentLoaded', restoreOptions);

const loggingIntervalValueInput = document.getElementById('loggingIntervalValue');
const loggingIntervalUnitSelect = document.getElementById('loggingIntervalUnit');
const serverUrlInput = document.getElementById('serverUrl');
const saveSettingsButton = document.getElementById('saveSettings');
const saveServerUrlButton = document.getElementById('saveServerUrl');
const startLoggingButton = document.getElementById('startLogging');
const stopLoggingButton = document.getElementById('stopLogging');
const loggingStatusText = document.getElementById('loggingStatus');
const lastTabCountDisplay = document.getElementById('lastTabCountDisplay');
const statusMessageDiv = document.getElementById('status');

// Restore options from storage
async function restoreOptions() {
  const items = await browser.storage.local.get([
    'loggingIntervalValue',
    'loggingIntervalUnit',
    'isLoggingActive',
    'lastTabCount',
    'timestamp',
    'serverUrl' // Load the new serverUrl
  ]);

  loggingIntervalValueInput.value = items.loggingIntervalValue || 1;
  loggingIntervalUnitSelect.value = items.loggingIntervalUnit || 'minutes';
  serverUrlInput.value = items.serverUrl || ''; // Populate the server URL input

  updateStatusDisplay(items.isLoggingActive);
  updateLastTabCountDisplay(items.lastTabCount, items.timestamp);
}

// Save logging interval settings
async function saveIntervalSettings() {
  await browser.storage.local.set({
    loggingIntervalValue: parseInt(loggingIntervalValueInput.value),
    loggingIntervalUnit: loggingIntervalUnitSelect.value
  });
  displayStatusMessage('Logging interval settings saved.', 'success');
}

// Save server URL
async function saveServerUrlSettings() {
  const url = serverUrlInput.value.trim();
  // Basic URL validation
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    displayStatusMessage('Please enter a valid HTTP/HTTPS URL for the server.', 'error');
    return;
  }
  await browser.storage.local.set({
    serverUrl: url
  });
  displayStatusMessage('Server URL saved.', 'success');
}


// Start Logging
function startLogging() {
  browser.runtime.sendMessage({ action: "startLogging" });
  displayStatusMessage('Logging started.', 'success');
}

// Stop Logging
function stopLogging() {
  browser.runtime.sendMessage({ action: "stopLogging" });
  displayStatusMessage('Logging stopped.', 'success');
}

// Update UI based on logging status
function updateStatusDisplay(isLoggingActive) {
  if (isLoggingActive) {
    loggingStatusText.textContent = 'Logging Status: Active';
    startLoggingButton.disabled = true;
    stopLoggingButton.disabled = false;
  } else {
    loggingStatusText.textContent = 'Logging Status: Inactive';
    startLoggingButton.disabled = false;
    stopLoggingButton.disabled = true;
  }
}

// Update last tab count display
function updateLastTabCountDisplay(count, timestamp) {
  if (count !== undefined && timestamp !== undefined) {
    const date = new Date(timestamp);
    lastTabCountDisplay.textContent = `Last Tab Count: ${count} (at ${date.toLocaleString()})`;
  } else {
    lastTabCountDisplay.textContent = 'Last Tab Count: N/A';
  }
}

// Display temporary status messages
let statusTimeout;
function displayStatusMessage(message, type) {
  statusMessageDiv.textContent = message;
  statusMessageDiv.className = `status-message ${type}-message`;
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusMessageDiv.textContent = '';
    statusMessageDiv.className = 'status-message';
  }, 3000); // Message disappears after 3 seconds
}

// Event Listeners
saveSettingsButton.addEventListener('click', saveIntervalSettings);
saveServerUrlButton.addEventListener('click', saveServerUrlSettings); // New button listener
startLoggingButton.addEventListener('click', startLogging);
stopLoggingButton.addEventListener('click', stopLogging);

// Listen for messages from background script to update UI
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "updateLogStatus") {
    updateStatusDisplay(message.isLoggingActive);
  } else if (message.action === "updateLastTabCountDisplay") {
    updateLastTabCountDisplay(message.lastTabCount, message.timestamp);
  }
});

// Also update last tab count display on initial load/restore
(async () => {
  const items = await browser.storage.local.get(['lastTabCount', 'timestamp']);
  updateLastTabCountDisplay(items.lastTabCount, items.timestamp);
})();
