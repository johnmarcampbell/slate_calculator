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

  test("angle mode defaults to rad and persists deg", async () => {
    attachChromeStorage();
    const history = loadHistory();

    await expect(history.getAngleMode()).resolves.toBe("rad");
    await expect(history.setAngleMode("deg")).resolves.toBe("deg");
    await expect(history.getAngleMode()).resolves.toBe("deg");
  });

  test("invalid angle mode persists as rad", async () => {
    attachChromeStorage();
    const history = loadHistory();

    await expect(history.setAngleMode("invalid")).resolves.toBe("rad");
    await expect(history.getAngleMode()).resolves.toBe("rad");
  });

  test("active view defaults to calculator and persists graph", async () => {
    attachChromeStorage();
    const history = loadHistory();

    await expect(history.getActiveView()).resolves.toBe("calculator");
    await expect(history.setActiveView("graph")).resolves.toBe("graph");
    await expect(history.getActiveView()).resolves.toBe("graph");
  });

  test("invalid active view persists as calculator", async () => {
    attachChromeStorage();
    const history = loadHistory();

    await expect(history.setActiveView("invalid")).resolves.toBe("calculator");
    await expect(history.getActiveView()).resolves.toBe("calculator");
  });

  test("graph settings roundtrip with object", async () => {
    attachChromeStorage();
    const history = loadHistory();

    const settings = { xMin: -5, xMax: 5, yMin: -2, yMax: 2, yAuto: false };

    await expect(history.setGraphSettings(settings)).resolves.toEqual(settings);
    await expect(history.getGraphSettings()).resolves.toEqual(settings);
  });

  test("graph settings returns null for invalid payload", async () => {
    attachChromeStorage({ typedCalcGraphSettings: "bad" });
    const history = loadHistory();

    await expect(history.getGraphSettings()).resolves.toBeNull();
  });

  test("expression draft defaults to empty string and persists text", async () => {
    attachChromeStorage();
    const history = loadHistory();

    await expect(history.getExpressionDraft()).resolves.toBe("");
    await expect(history.setExpressionDraft("2+2")).resolves.toBe("2+2");
    await expect(history.getExpressionDraft()).resolves.toBe("2+2");
  });

  test("expression draft falls back to empty string for non-string payload", async () => {
    attachChromeStorage({ typedCalcExpressionDraft: { value: "2+2" } });
    const history = loadHistory();

    await expect(history.getExpressionDraft()).resolves.toBe("");
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

  test("number format settings defaults with all required fields", async () => {
    attachChromeStorage();
    const history = loadHistory();

    const defaults = await history.getNumberFormatSettings();
    expect(defaults).toEqual({
      significantDigits: 12,
      sciNotationMagnitude: 6,
      notationStyle: "e"
    });
  });

  test("number format settings roundtrip with valid object", async () => {
    attachChromeStorage();
    const history = loadHistory();

    const settings = {
      significantDigits: 6,
      sciNotationMagnitude: 9,
      notationStyle: "times10"
    };

    await expect(history.setNumberFormatSettings(settings)).resolves.toEqual(settings);
    await expect(history.getNumberFormatSettings()).resolves.toEqual(settings);
  });

  test("number format settings clamps significantDigits to valid range", async () => {
    attachChromeStorage();
    const history = loadHistory();

    const tooLow = { significantDigits: 1, sciNotationMagnitude: 6, notationStyle: "e" };
    await history.setNumberFormatSettings(tooLow);
    const resultLow = await history.getNumberFormatSettings();
    expect(resultLow.significantDigits).toBe(3);

    const tooHigh = { significantDigits: 20, sciNotationMagnitude: 6, notationStyle: "e" };
    await history.setNumberFormatSettings(tooHigh);
    const resultHigh = await history.getNumberFormatSettings();
    expect(resultHigh.significantDigits).toBe(12);
  });

  test("number format settings clamps sciNotationMagnitude to valid range", async () => {
    attachChromeStorage();
    const history = loadHistory();

    const tooLow = { significantDigits: 6, sciNotationMagnitude: 1, notationStyle: "e" };
    await history.setNumberFormatSettings(tooLow);
    const resultLow = await history.getNumberFormatSettings();
    expect(resultLow.sciNotationMagnitude).toBe(3);

    const tooHigh = { significantDigits: 6, sciNotationMagnitude: 25, notationStyle: "e" };
    await history.setNumberFormatSettings(tooHigh);
    const resultHigh = await history.getNumberFormatSettings();
    expect(resultHigh.sciNotationMagnitude).toBe(20);
  });

  test("number format settings validates notationStyle", async () => {
    attachChromeStorage();
    const history = loadHistory();

    const invalid = { significantDigits: 6, sciNotationMagnitude: 6, notationStyle: "invalid" };
    await history.setNumberFormatSettings(invalid);
    const result = await history.getNumberFormatSettings();
    expect(result.notationStyle).toBe("e");
  });

  test("number format settings returns defaults for invalid payload", async () => {
    attachChromeStorage({ typedCalcNumberFormat: "bad" });
    const history = loadHistory();

    const result = await history.getNumberFormatSettings();
    expect(result).toEqual({
      significantDigits: 12,
      sciNotationMagnitude: 6,
      notationStyle: "e"
    });
  });
});
