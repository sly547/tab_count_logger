let creationCount = 0;
let removalCount = 0;
let attachedCount = 0;
let detachedCount = 0;
let replacedCount = 0;

async function logTabCount(eventDetails) {
  try {
    const allTabs = await browser.tabs.query({});
    const tabCount = allTabs.length;
    console.log(`Current tab count: ${tabCount}`);

    await browser.storage.local.set({ lastTabCount: tabCount, timestamp: Date.now() });

    // Log event details for debugging
    if (eventDetails) {
      console.log("Tab event details:", eventDetails);
    }

  } catch (error) {
    console.error("Error querying tabs:", error);
  }
}

browser.tabs.onCreated.addListener((tab) => {
  creationCount++;
  console.log(`onCreated fired: ${creationCount}`);
  logTabCount(tab);
});

browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
  removalCount++;
  console.log(`onRemoved fired: ${removalCount}, Tab ID: ${tabId}, Remove Info:`, removeInfo);
  // We might need a slight delay here if the query is happening too fast
  setTimeout(logTabCount, 100, { tabId, removeInfo });
});

browser.tabs.onAttached.addListener((tabId, attachInfo) => {
  attachedCount++;
  console.log(`onAttached fired: ${attachedCount}, Tab ID: ${tabId}, Attach Info:`, attachInfo);
  logTabCount({ tabId, attachInfo });
});

browser.tabs.onDetached.addListener((tabId, detachInfo) => {
  detachedCount++;
  console.log(`onDetached fired: ${detachedCount}, Tab ID: ${tabId}, Detach Info:`, detachInfo);
  logTabCount({ tabId, detachInfo });
});

browser.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  replacedCount++;
  console.log(`onReplaced fired: ${replacedCount}, Added ID: ${addedTabId}, Removed ID: ${removedTabId}`);
  // It might be safer to query again after a replacement
  setTimeout(logTabCount, 150, { addedTabId, removedTabId });
});

// Initial log on browser start
logTabCount();
