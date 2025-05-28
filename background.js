// TOP OF background.js
console.log("Background script loaded/reloaded at:", new Date().toLocaleString());

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

// Function to update the "Last Tab Count" for the options page display
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

// Function to send the current tab count directly to InfluxDB HTTP API
async function sendTabCountToInfluxDB() {
  try {
    const dbConfig = await browser.storage.local.get([
      'influxdbUrl',
      'influxdbOrg',
      'influxdbBucket',
      'influxdbToken'
    ]);

    const { influxdbUrl, influxdbOrg, influxdbBucket, influxdbToken } = dbConfig;

    if (!influxdbUrl || !influxdbOrg || !influxdbBucket || !influxdbToken) {
      console.error("InfluxDB settings not fully configured in extension options. Cannot send tab count.");
      return;
    }

    const allTabs = await browser.tabs.query({});
    const tabCount = allTabs.length;

    // Get current time in nanoseconds since epoch (InfluxDB Line Protocol default)
    const timestampNs = Date.now() * 1_000_000; // Convert milliseconds to nanoseconds

    // Construct the InfluxDB Line Protocol payload
    // Format: measurement,tag_key=tag_value field_key=field_value timestamp_ns
    // IMPORANT FIX: Added 'i' suffix to explicitly make 'count' an integer
    const lineProtocol = `tab_metrics,source=firefox_extension count=${tabCount}i ${timestampNs}`;

    // Construct the InfluxDB write API URL
    const writeUrl = `${influxdbUrl}/api/v2/write?org=${influxdbOrg}&bucket=${influxdbBucket}`;

    console.log(`Sending data to InfluxDB: ${lineProtocol} to ${writeUrl}`);

    const response = await fetch(writeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${influxdbToken}`,
        'Content-Type': 'text/plain; charset=utf-8',
        'Accept': 'application/json' // Request JSON response for errors
      },
      body: lineProtocol
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`InfluxDB responded with status ${response.status}: ${errorText}`);
      throw new Error(`InfluxDB write failed: ${response.status} - ${errorText}`);
    }

    console.log('Tab count sent successfully to InfluxDB.');

  } catch (error) {
    console.error("Failed to send tab count to InfluxDB:", error);
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

  // Perform an immediate send when starting
  await sendTabCountToInfluxDB();

  // Set the interval for subsequent sends
  loggingIntervalId = setInterval(async () => {
    // Check if logging is still active in storage before sending again
    const currentPrefs = await browser.storage.local.get('isLoggingActive');
    if (currentPrefs.isLoggingActive) {
        await sendTabCountToInfluxDB();
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
}

// Initial setup when background script starts
(async () => {
  console.log("Starting initial setup for background script.");

  // Update the "Last Tab Count" for the options page on startup
  await updateLastTabCountForDisplay();

  // Check for logging status and restart periodic logging if it was active
  const prefs = await browser.storage.local.get('isLoggingActive');
  if (prefs.isLoggingActive) {
    console.log("Logging was active on startup, attempting to restart periodic logging.");
    startPeriodicLogging();
  } else {
    console.log("Logging was inactive on startup.");
  }
})();

// --- Event Listeners for Tab Changes (only update last tab count for display) ---
// These are not directly tied to sending data to InfluxDB.
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
