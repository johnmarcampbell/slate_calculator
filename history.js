(function () {
  "use strict";

  const HISTORY_KEY = "typedCalcHistory";
  const ANGLE_MODE_KEY = "typedCalcAngleMode";
  const GRAPH_SETTINGS_KEY = "typedCalcGraphSettings";
  const EXPRESSION_DRAFT_KEY = "typedCalcExpressionDraft";
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

  function getAngleMode() {
    return new Promise((resolve) => {
      getStorage().get([ANGLE_MODE_KEY], (payload) => {
        resolve(payload[ANGLE_MODE_KEY] === "deg" ? "deg" : "rad");
      });
    });
  }

  function setAngleMode(mode) {
    const safeMode = mode === "deg" ? "deg" : "rad";
    return new Promise((resolve) => {
      getStorage().set({ [ANGLE_MODE_KEY]: safeMode }, () => resolve(safeMode));
    });
  }

  function getGraphSettings() {
    return new Promise((resolve) => {
      getStorage().get([GRAPH_SETTINGS_KEY], (payload) => {
        const settings = payload[GRAPH_SETTINGS_KEY];
        resolve(settings && typeof settings === "object" ? settings : null);
      });
    });
  }

  function setGraphSettings(settings) {
    const safeSettings = settings && typeof settings === "object" ? settings : null;
    return new Promise((resolve) => {
      getStorage().set({ [GRAPH_SETTINGS_KEY]: safeSettings }, () => resolve(safeSettings));
    });
  }

  function getExpressionDraft() {
    return new Promise((resolve) => {
      getStorage().get([EXPRESSION_DRAFT_KEY], (payload) => {
        const draft = payload[EXPRESSION_DRAFT_KEY];
        resolve(typeof draft === "string" ? draft : "");
      });
    });
  }

  function setExpressionDraft(draft) {
    const safeDraft = String(draft || "");
    return new Promise((resolve) => {
      getStorage().set({ [EXPRESSION_DRAFT_KEY]: safeDraft }, () => resolve(safeDraft));
    });
  }

  window.CalculatorHistory = {
    getHistory,
    addHistoryEntry,
    clearHistory,
    getAngleMode,
    setAngleMode,
    getGraphSettings,
    setGraphSettings,
    getExpressionDraft,
    setExpressionDraft
  };
})();
