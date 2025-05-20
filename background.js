// TOP OF background.js
console.log("Background script loaded/reloaded at:", new Date().toLocaleString());

const CSV_HEADER = "Timestamp,TabCount\n";
let csvData = CSV_HEADER; // Will be initialized from storage on startup

// Flag to track if the alarm listener is already set up
let isAlarmListenerSetUp = false;

// Function to convert interval to minutes
function intervalToMinutes(value, unit) {
  switch (unit) {
    case 'minutes':
      return Math.max(1, value); // Enforce minimum 1 minute
    case 'hours':
      return value * 60;
    case 'days':
      return value * 60 * 24;
    default:
      return 5;
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
    // Add a very small artificial delay and a timestamp check
    // to prevent near-simultaneous calls from logging duplicates.
    // This is a last resort debounce if multiple listeners are firing.
    const now = Date.now();
    const lastLogTimestamp = (await browser.storage.local.get('lastCsvLogTime')).lastCsvLogTime || 0;
    
    // If less than 100ms since last CSV log entry, skip.
    // This is a safety net against very rapid duplicate calls.
    if (now - lastLogTimestamp < 100) {
        console.warn("Skipping very rapid duplicate CSV log entry.");
        return;
    }
    await browser.storage.local.set({ lastCsvLogTime: now }); // Record this log's time

    const allTabs = await browser.tabs.query({});
    const tabCount = allTabs.length;
    const timestamp = new Date().toLocaleString();

    csvData += `"${timestamp}",${tabCount}\n`;
    console.log(`Periodically logged tab count: ${tabCount} at ${timestamp}`);

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
    csvData = CSV_HEADER;
    await browser.storage.local.set({ accumulatedCsvData: CSV_HEADER });
    await browser.storage.local.remove('lastCsvLogTime'); // Clear debounce timer
  } catch (error) {
    console.error("Error downloading CSV file:", error);
  }
}

// --- Alarm and Logging Logic ---

// The dedicated alarm listener function
async function handleAlarm(alarm) {
  if (alarm.name === "logTabCountAlarm") {
    console.log("Alarm 'logTabCountAlarm' fired."); // Debug: See when alarm fires
    await periodicLogTabCountAndAppendToCsv();
  }
}

// Function to set up the alarm listener ONCE
function setUpAlarmListener() {
    if (!isAlarmListenerSetUp) {
        browser.alarms.onAlarm.addListener(handleAlarm);
        isAlarmListenerSetUp = true;
        console.log("Alarm listener set up.");
    } else {
        console.log("Alarm listener already set up, skipping.");
    }
}

// Function to start the periodic logging
async function startPeriodicLogging() {
  const prefs = await browser.storage.local.get(['loggingIntervalValue', 'loggingIntervalUnit']);
  const intervalValue = prefs.loggingIntervalValue || 5;
  const intervalUnit = prefs.loggingIntervalUnit || 'minutes';

  const periodInMinutes = intervalToMinutes(intervalValue, intervalUnit);

  // Clear any previously scheduled alarm to prevent duplicates if start is clicked repeatedly
  browser.alarms.clear("logTabCountAlarm");
  console.log("Cleared existing alarms.");

  // Create the new alarm: First alarm fires AFTER periodInMinutes.
  browser.alarms.create("logTabCountAlarm", {
    periodInMinutes: periodInMinutes
  });
  console.log(`Created alarm: logTabCountAlarm, period: ${periodInMinutes} min.`);

  // Debug: List all active alarms
  const allAlarms = await browser.alarms.getAll();
  console.log("Active alarms after creation:", allAlarms);


  await browser.storage.local.set({ isLoggingActive: true });
  console.log(`Periodic logging started. Interval: ${periodInMinutes} minutes.`);
  browser.runtime.sendMessage({ action: "updateLogStatus", isLoggingActive: true });

  // Manual immediate log upon starting, separate from alarm schedule
  await periodicLogTabCountAndAppendToCsv();
}

// Function to stop the periodic logging
async function stopPeriodicLogging() {
  browser.alarms.clear("logTabCountAlarm");
  console.log("Cleared alarms on stop.");
  await browser.storage.local.set({ isLoggingActive: false });
  console.log("Periodic logging stopped.");
  browser.runtime.sendMessage({ action: "updateLogStatus", isLoggingActive: false });
  await downloadCsvFile();
}

// Initial setup when background script starts
(async () => {
  console.log("Starting initial setup for background script.");
  // Ensure the alarm listener is set up once and only once.
  setUpAlarmListener(); // Call this immediately on script load.

  // 1. Load accumulated CSV data from storage (if any)
  const storedCsv = await browser.storage.local.get('accumulatedCsvData');
  csvData = storedCsv.accumulatedCsvData || CSV_HEADER;
  console.log("Loaded accumulated CSV data (first 100 chars):", csvData.substring(0, 100));

  // 2. Update the "Last Tab Count" for the options page on startup
  await updateLastTabCountForDisplay();

  // 3. Check for logging status and restart periodic logging if it was active
  const prefs = await browser.storage.local.get('isLoggingActive');
  if (prefs.isLoggingActive) {
    console.log("Logging was active, attempting to restart periodic logging.");
    startPeriodicLogging();
  } else {
    console.log("Logging was inactive.");
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
