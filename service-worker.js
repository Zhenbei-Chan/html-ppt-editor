chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    hpeInstalledAt: Date.now()
  });
});
