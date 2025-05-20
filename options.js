// Function to update the last logged tab count on the options page
async function displayLogData() {
  try {
    const storedData = await browser.storage.local.get(['lastTabCount', 'timestamp']);
    document.getElementById('lastCount').textContent = storedData.lastTabCount || 'N/A';
    document.getElementById('timestamp').textContent = storedData.timestamp ? new Date(storedData.timestamp).toLocaleString() : 'N/A';
  } catch (error) {
    console.error("Error retrieving stored data:", error);
  }
}

// Function to load saved preferences and update UI
async function loadPreferences() {
  const prefs = await browser.storage.local.get(['loggingIntervalValue', 'loggingIntervalUnit', 'isLoggingActive']);
  document.getElementById('intervalValue').value = prefs.loggingIntervalValue || 5;
  document.getElementById('intervalUnit').value = prefs.loggingIntervalUnit || 'minutes';
  updateLogStatus(prefs.isLoggingActive);
}

// Function to save preferences
async function savePreferences() {
  const intervalValue = document.getElementById('intervalValue').value;
  const intervalUnit = document.getElementById('intervalUnit').value;
  await browser.storage.local.set({
    loggingIntervalValue: parseInt(intervalValue),
    loggingIntervalUnit: intervalUnit
  });
}

// Function to update the logging status message
function updateLogStatus(isActive) {
  const statusElement = document.getElementById('logStatus');
  if (isActive) {
    statusElement.textContent = 'CSV Logging is currently active.';
    statusElement.style.color = 'green';
  } else {
    statusElement.textContent = 'CSV Logging is currently inactive.';
    statusElement.style.color = 'red';
  }
}

// Event Listeners for buttons
document.addEventListener('DOMContentLoaded', async () => {
  displayLogData();
  await loadPreferences();

  document.getElementById('startLogging').addEventListener('click', async () => {
    await savePreferences(); // Save current settings before starting
    await browser.runtime.sendMessage({ action: "startLogging" });
    updateLogStatus(true);
  });

  document.getElementById('stopLogging').addEventListener('click', async () => {
    await browser.runtime.sendMessage({ action: "stopLogging" });
    updateLogStatus(false);
  });

  // Listen for updates from the background script (e.g., when logging starts/stops)
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "updateLogStatus") {
      updateLogStatus(message.isLoggingActive);
    }
  });
});

// Update the display when local storage changes (e.g., from background script)
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && (changes.lastTabCount || changes.timestamp)) {
    displayLogData();
  }
});
