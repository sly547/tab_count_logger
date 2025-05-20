async function displayLogData() {
  try {
    const storedData = await browser.storage.local.get(['lastTabCount', 'timestamp']);
    document.getElementById('lastCount').textContent = storedData.lastTabCount || 'N/A';
    document.getElementById('timestamp').textContent = storedData.timestamp ? new Date(storedData.timestamp).toLocaleString() : 'N/A';
  } catch (error) {
    console.error("Error retrieving stored data:", error);
  }
}

displayLogData();
