const CSV_HEADER = "Timestamp,TabCount\n";
let csvData = CSV_HEADER; // Initialize CSV data with header

// Function to convert interval to minutes
function intervalToMinutes(value, unit) {
  switch (unit) {
    case 'minutes':
      return value;
    case 'hours':
      return value * 60;
    case 'days':
      return value * 60 * 24;
    default:
      return 5; // Default to 5 minutes if unit is unknown
  }
}

// Function to log the current tab count and append to CSV
async function logTabCountAndAppendToCsv() {
  try {
    const allTabs = await browser.tabs.query({});
    const tabCount = allTabs.length;
    const timestamp = new Date().toLocaleString();

    console.log(`Current tab count: ${tabCount} at ${timestamp}`); // Keep this main log

    // Store the latest count for options page
    await browser.storage.local.set({ lastTabCount: tabCount, timestamp: Date.now() });

    // Append to CSV data
    csvData += `"${timestamp}",${tabCount}\n`;

  } catch (error) {
    console.error("Error querying tabs or storing data:", error);
  }
}

// Function to download the CSV file
async function downloadCsvFile() {
  if (csvData === CSV_HEADER) {
    console.log("No new data to download.");
    return; // Don't download if only header exists
  }

  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const filename = `tab_count_log_${Date.now()}.csv`;

  try {
    await browser.downloads.download({
      url: URL.createObjectURL(blob),
      filename: filename,
      saveAs: true // Prompt user for download location
    });
    console.log(`CSV file "${filename}" downloaded.`);
    // Reset csvData after successful download to start a new log
    csvData = CSV_HEADER;
  } catch (error) {
    console.error("Error downloading CSV file:", error);
  }
}

// --- Alarm and Logging Logic ---

// Listener for alarms
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "logTabCountAlarm") {
    await logTabCountAndAppendToCsv();
  }
});

// Function to start the periodic logging
async function startPeriodicLogging() {
  const prefs = await browser.storage.local.get(['loggingIntervalValue', 'loggingIntervalUnit']);
  const intervalValue = prefs.loggingIntervalValue || 5;
  const intervalUnit = prefs.loggingIntervalUnit || 'minutes';

  const periodInMinutes = intervalToMinutes(intervalValue, intervalUnit);

  browser.alarms.clear("logTabCountAlarm"); // Clear any existing alarm
  browser.alarms.create("logTabCountAlarm", {
    delayInMinutes: 0.1, // Start almost immediately for first run
    periodInMinutes: periodInMinutes
  });
  await browser.storage.local.set({ isLoggingActive: true });
  console.log(`Periodic logging started. Interval: ${periodInMinutes} minutes.`);
  browser.runtime.sendMessage({ action: "updateLogStatus", isLoggingActive: true });
  // Perform an immediate log when starting
  await logTabCountAndAppendToCsv();
}

// Function to stop the periodic logging
async function stopPeriodicLogging() {
  browser.alarms.clear("logTabCountAlarm");
  await browser.storage.local.set({ isLoggingActive: false });
  console.log("Periodic logging stopped.");
  browser.runtime.sendMessage({ action: "updateLogStatus", isLoggingActive: false });
  // Offer to download the accumulated data
  await downloadCsvFile();
}

// Initial check for logging status on browser start
(async () => {
  const prefs = await browser.storage.local.get('isLoggingActive');
  if (prefs.isLoggingActive) {
    startPeriodicLogging();
  }
  // Initial log on browser start (for non-periodic tracking)
  logTabCountAndAppendToCsv();
})();

// --- Event Listeners for Tab Changes ---
// These will still trigger logTabCountAndAppendToCsv to update the last logged count and CSV data
browser.tabs.onCreated.addListener((tab) => {
  logTabCountAndAppendToCsv(tab);
});

browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
  setTimeout(logTabCountAndAppendToCsv, 100, { tabId, removeInfo });
});

browser.tabs.onAttached.addListener((tabId, attachInfo) => {
  logTabCountAndAppendToCsv({ tabId, attachInfo });
});

browser.tabs.onDetached.addListener((tabId, detachInfo) => {
  logTabCountAndAppendToCsv({ tabId, detachInfo });
});

browser.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  setTimeout(logTabCountAndAppendToCsv, 150, { addedTabId, removedTabId });
});

// --- Message Listener from Options Page ---
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "startLogging") {
    startPeriodicLogging();
  } else if (message.action === "stopLogging") {
    stopPeriodicLogging();
  }
});
