const path = require("path");

const { attachChromeStorage } = require("./helpers/mockChromeStorage");

function loadHistory() {
  jest.resetModules();
  delete window.CalculatorHistory;
  require(path.join(__dirname, "..", "history.js"));
  return window.CalculatorHistory;
}

describe("CalculatorHistory", () => {
  test("getHistory returns empty array when missing", async () => {
    attachChromeStorage();
    const history = loadHistory();

    await expect(history.getHistory()).resolves.toEqual([]);
  });

  test("addHistoryEntry prepends newest entries", async () => {
    attachChromeStorage({
      typedCalcHistory: [{ expression: "1+1", resultText: "2" }]
    });
    const history = loadHistory();

    const next = await history.addHistoryEntry({ expression: "2+2", resultText: "4" });

    expect(next).toEqual([
      { expression: "2+2", resultText: "4" },
      { expression: "1+1", resultText: "2" }
    ]);
  });

  test("addHistoryEntry enforces provided limit", async () => {
    attachChromeStorage({
      typedCalcHistory: [
        { expression: "1", resultText: "1" },
        { expression: "2", resultText: "2" },
        { expression: "3", resultText: "3" }
      ]
    });
    const history = loadHistory();

    const next = await history.addHistoryEntry({ expression: "4", resultText: "4" }, 3);

    expect(next).toHaveLength(3);
    expect(next.map((item) => item.expression)).toEqual(["4", "1", "2"]);
  });

  test("clearHistory empties persisted history", async () => {
    const local = attachChromeStorage({
      typedCalcHistory: [{ expression: "1+1", resultText: "2" }]
    });
    const history = loadHistory();

    await expect(history.clearHistory()).resolves.toEqual([]);
    expect(local.__store.typedCalcHistory).toEqual([]);
  });

  test("history falls back to empty array for non-array payload", async () => {
    attachChromeStorage({ typedCalcHistory: "bad" });
    const history = loadHistory();

    await expect(history.getHistory()).resolves.toEqual([]);
  });

  test("rejects when chrome.storage.local is unavailable", async () => {
    delete global.chrome;
    const history = loadHistory();

    await expect(history.getHistory()).rejects.toThrow("chrome.storage.local is unavailable");
  });
});
