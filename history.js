(function () {
  "use strict";

  const HISTORY_KEY = "slateCalcHistory";
  const DEFAULT_LIMIT = 80;

  function getStorage() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      throw new Error("chrome.storage.local is unavailable");
    }
    return chrome.storage.local;
  }

  function getHistory() {
    return new Promise((resolve) => {
      getStorage().get([HISTORY_KEY], (payload) => {
        resolve(Array.isArray(payload[HISTORY_KEY]) ? payload[HISTORY_KEY] : []);
      });
    });
  }

  function setHistory(entries) {
    return new Promise((resolve) => {
      getStorage().set({ [HISTORY_KEY]: entries }, () => resolve(entries));
    });
  }

  async function addHistoryEntry(entry, limit) {
    const maxItems = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
    const existing = await getHistory();
    const next = [entry].concat(existing).slice(0, maxItems);
    await setHistory(next);
    return next;
  }

  async function clearHistory() {
    await setHistory([]);
    return [];
  }

  window.CalculatorHistory = {
    getHistory,
    addHistoryEntry,
    clearHistory
  };
})();
