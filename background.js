// TOP OF background.js
console.log("Background script loaded/reloaded at:", new Date().toLocaleString());

const CSV_HEADER = "Timestamp,TabCount\n";
let csvData = CSV_HEADER; // Will be initialized from storage on startup
let loggingIntervalId = null; // Store the ID for the setInterval

// Function to convert interval to milliseconds
function intervalToMilliseconds(value, unit) {
  switch (unit) {
    case 'minutes':
      return Math.max(1, value) * 60 * 1000; // Minimum 1 minute (60,000 ms)
    case 'hours':
      return value * 60 * 60 * 1000;
    case 'days':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 5 * 60 * 1000; // Default to 5 minutes
  }
}

async function updateLastTabCountForDisplay() {
  try {
    const allTabs = await browser.tabs.query({});
    const tabCount = allTabs.length;
    await browser.storage.local.set({ lastTabCount: tabCount, timestamp: Date.now() });
    // console.log(`Last Tab Count for display updated: ${tabCount}`);
  } catch (error) {
    console.error("Error updating last tab count for display:", error);
  }
}

async function periodicLogTabCountAndAppendToCsv() {
  try {
    const allTabs = await browser.tabs.query({});
    const tabCount = allTabs.length;
    const timestamp = new Date().toLocaleString();

    csvData += `"${timestamp}",${tabCount}\n`;
    console.log(`Periodically logged tab count: ${tabCount} at ${timestamp}`);

    // *** IMPORTANT: Persist csvData immediately after adding a new entry ***
    await browser.storage.local.set({ accumulatedCsvData: csvData });

  } catch (error) {
    console.error("Error during periodic CSV logging:", error);
  }
}

async function downloadCsvFile() {
  if (csvData === CSV_HEADER) {
    console.log("No new data to download.");
    return;
  }

  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const filename = `tab_count_log_${Date.now()}.csv`;

  try {
    await browser.downloads.download({
      url: URL.createObjectURL(blob),
      filename: filename,
      saveAs: true
    });
    console.log(`CSV file "${filename}" downloaded.`);
    // Reset csvData in memory and storage ONLY AFTER successful download on user request
    csvData = CSV_HEADER;
    await browser.storage.local.set({ accumulatedCsvData: CSV_HEADER });
    await browser.storage.local.remove('lastCsvLogTime'); // Clean up old debounce timer (if any)
  } catch (error) {
    console.error("Error downloading CSV file:", error);
  }
}

// --- Logging Control Logic ---

async function startPeriodicLogging() {
  // Clear any existing interval to prevent duplicates
  if (loggingIntervalId !== null) {
    clearInterval(loggingIntervalId);
    console.log("Cleared existing logging interval before starting new one.");
  }

  const prefs = await browser.storage.local.get(['loggingIntervalValue', 'loggingIntervalUnit']);
  const intervalValue = prefs.loggingIntervalValue || 1; // Default to 1 min
  const intervalUnit = prefs.loggingIntervalUnit || 'minutes';

  const periodInMilliseconds = intervalToMilliseconds(intervalValue, intervalUnit);

  await browser.storage.local.set({ isLoggingActive: true });
  console.log(`Periodic logging started. Interval: ${periodInMilliseconds / 1000 / 60} minutes.`);
  browser.runtime.sendMessage({ action: "updateLogStatus", isLoggingActive: true });

  // Perform an immediate log when starting
  await periodicLogTabCountAndAppendToCsv();

  // Set the interval for subsequent logs
  loggingIntervalId = setInterval(async () => {
    // Check if logging is still active in storage before logging again
    // This handles cases where the script might reload but logging was stopped,
    // preventing the interval from continuing indefinitely if not explicitly cleared.
    const currentPrefs = await browser.storage.local.get('isLoggingActive');
    if (currentPrefs.isLoggingActive) {
        await periodicLogTabCountAndAppendToCsv();
    } else {
        // If it's somehow inactive, clear the interval
        clearInterval(loggingIntervalId);
        loggingIntervalId = null;
        console.log("Interval cleared because logging became inactive in storage.");
    }
  }, periodInMilliseconds);

  console.log(`Interval ID created: ${loggingIntervalId}`);
}

async function stopPeriodicLogging() {
  if (loggingIntervalId !== null) {
    clearInterval(loggingIntervalId);
    loggingIntervalId = null;
    console.log("Cleared logging interval on explicit stop.");
  }
  await browser.storage.local.set({ isLoggingActive: false });
  console.log("Periodic logging stopped.");
  browser.runtime.sendMessage({ action: "updateLogStatus", isLoggingActive: false });
  
  // *** ONLY DOWNLOAD CSV HERE ON USER'S REQUEST ***
  await downloadCsvFile();
}

// Initial setup when background script starts
(async () => {
  console.log("Starting initial setup for background script.");

  // 1. Load accumulated CSV data from storage (if any)
  const storedCsv = await browser.storage.local.get('accumulatedCsvData');
  csvData = storedCsv.accumulatedCsvData || CSV_HEADER;
  console.log("Loaded accumulated CSV data (first 100 chars):", csvData.substring(0, 100));

  // 2. Update the "Last Tab Count" for the options page on startup
  await updateLastTabCountForDisplay();

  // 3. Check for logging status and restart periodic logging if it was active
  const prefs = await browser.storage.local.get('isLoggingActive');
  if (prefs.isLoggingActive) {
    console.log("Logging was active on startup, attempting to restart periodic logging.");
    startPeriodicLogging();
  } else {
    console.log("Logging was inactive on startup.");
  }
})();

// --- Event Listeners for Tab Changes (only update last tab count for display) ---
browser.tabs.onCreated.addListener(() => {
  updateLastTabCountForDisplay();
});

browser.tabs.onRemoved.addListener(() => {
  setTimeout(updateLastTabCountForDisplay, 100);
});

browser.tabs.onAttached.addListener(() => {
  updateLastTabCountForDisplay();
});

browser.tabs.onDetached.addListener(() => {
  updateLastTabCountForDisplay();
});

browser.tabs.onReplaced.addListener(() => {
  setTimeout(updateLastTabCountForDisplay, 150);
});

// *** REMOVED: browser.runtime.onSuspend.addListener (to stop automatic downloads) ***
/*
browser.runtime.onSuspend.addListener(async () => {
    console.log("Extension is suspending. No automatic download on suspend.");
    // Data is already persisted to storage.local by periodicLogTabCountAndAppendToCsv().
});
*/

// --- Message Listener from Options Page ---
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "startLogging") {
    startPeriodicLogging();
  } else if (message.action === "stopLogging") {
    stopPeriodicLogging();
  }
});
