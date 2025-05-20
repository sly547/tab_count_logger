const CSV_HEADER = "Timestamp,TabCount\n";
let csvData = CSV_HEADER; // Will be initialized from storage on startup

// Function to convert interval to minutes
function intervalToMinutes(value, unit) {
  switch (unit) {
    case 'minutes':
      // Firefox alarms min period is 1 minute, even if delay is less.
      // So, if value is < 1, enforce 1.
      return Math.max(1, value);
    case 'hours':
      return value * 60;
    case 'days':
      return value * 60 * 24;
    default:
      return 5; // Default to 5 minutes if unit is unknown
  }
}

// Function to update the "Last Tab Count" for the options page
async function updateLastTabCountForDisplay() {
  try {
    const allTabs = await browser.tabs.query({});
    const tabCount = allTabs.length;
    await browser.storage.local.set({ lastTabCount: tabCount, timestamp: Date.now() });
    // console.log(`Last Tab Count for display updated: ${tabCount}`); // Keep for dev, remove for production
  } catch (error) {
    console.error("Error updating last tab count for display:", error);
  }
}

// Function to log the current tab count periodically and append to CSV
async function periodicLogTabCountAndAppendToCsv() {
  try {
    const allTabs = await browser.tabs.query({});
    const tabCount = allTabs.length;
    const timestamp = new Date().toLocaleString();

    // Append to CSV data
    csvData += `"${timestamp}",${tabCount}\n`;
    console.log(`Periodically logged tab count: ${tabCount} at ${timestamp}`);

    // Save current accumulated CSV data to storage for persistence
    await browser.storage.local.set({ accumulatedCsvData: csvData });

  } catch (error) {
    console.error("Error during periodic CSV logging:", error);
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
    // Reset csvData in memory and storage after successful download
    csvData = CSV_HEADER;
    await browser.storage.local.set({ accumulatedCsvData: CSV_HEADER }); // Reset storage as well
  } catch (error) {
    console.error("Error downloading CSV file:", error);
  }
}

// --- Alarm and Logging Logic ---

// Listener for alarms
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "logTabCountAlarm") {
    await periodicLogTabCountAndAppendToCsv();
  }
});

// Function to start the periodic logging
async function startPeriodicLogging() {
  const prefs = await browser.storage.local.get(['loggingIntervalValue', 'loggingIntervalUnit']);
  const intervalValue = prefs.loggingIntervalValue || 5;
  const intervalUnit = prefs.loggingIntervalUnit || 'minutes';

  const periodInMinutes = intervalToMinutes(intervalValue, intervalUnit);

  browser.alarms.clear("logTabCountAlarm"); // Clear any existing alarm

  // Create alarm: First alarm fires AFTER one full period, then every period.
  // This ensures exactly one entry per interval.
  browser.alarms.create("logTabCountAlarm", {
    periodInMinutes: periodInMinutes
  });
  await browser.storage.local.set({ isLoggingActive: true });
  console.log(`Periodic logging started. Interval: ${periodInMinutes} minutes.`);
  browser.runtime.sendMessage({ action: "updateLogStatus", isLoggingActive: true });
  // Add an initial log entry immediately upon starting if desired
  await periodicLogTabCountAndAppendToCsv(); // Manual initial log for immediate feedback
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

// Initial setup when background script starts
(async () => {
  // 1. Load accumulated CSV data from storage (if any)
  const storedCsv = await browser.storage.local.get('accumulatedCsvData');
  csvData = storedCsv.accumulatedCsvData || CSV_HEADER;
  console.log("Loaded accumulated CSV data:", csvData);

  // 2. Update the "Last Tab Count" for the options page on startup
  await updateLastTabCountForDisplay();

  // 3. Check for logging status and restart periodic logging if it was active
  const prefs = await browser.storage.local.get('isLoggingActive');
  if (prefs.isLoggingActive) {
    // If logging was active, restart the alarm.
    // This will cause the first log entry after restart to occur after `periodInMinutes`
    // unless you want an immediate log on browser restart too.
    startPeriodicLogging();
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

// --- Message Listener from Options Page ---
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "startLogging") {
    startPeriodicLogging();
  } else if (message.action === "stopLogging") {
    stopPeriodicLogging();
  }
});
