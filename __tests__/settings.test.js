const path = require("path");

const { attachChromeStorage, createChromeStorageLocal } = require("./helpers/mockChromeStorage");

function loadSettingsModule() {
  jest.resetModules();
  delete window.CalculatorSettings;
  require(path.join(__dirname, "..", "settings.js"));
  return window.CalculatorSettings;
}

function createSettings(initialStore) {
  attachChromeStorage(initialStore);
  const Cls = loadSettingsModule();
  return { Cls, settings: new Cls(chrome.storage.local) };
}

describe("CalculatorSettings", () => {
  describe("construction", () => {
    test("throws when storage backend is missing get/set", () => {
      attachChromeStorage();
      const Cls = loadSettingsModule();
      expect(() => new Cls(null)).toThrow(/storage backend/);
      expect(() => new Cls({})).toThrow(/storage backend/);
      expect(() => new Cls({ get: () => {} })).toThrow(/storage backend/);
    });

    test("accepts any object with get and set functions", () => {
      const Cls = loadSettingsModule();
      const fake = createChromeStorageLocal();
      expect(() => new Cls(fake)).not.toThrow();
    });
  });

  describe("ready/get", () => {
    test("get throws before ready resolves", async () => {
      const { settings } = createSettings();
      expect(() => settings.get("angleMode")).toThrow(/ready/);
    });

    test("hydrates with defaults when storage is empty", async () => {
      const { settings } = createSettings();
      await settings.ready();

      expect(settings.get("angleMode")).toBe("rad");
      expect(settings.get("activeView")).toBe("calculator");
      expect(settings.get("expressionDraft")).toBe("");
      expect(settings.get("numberFormat")).toEqual({
        significantDigits: 12,
        sciNotationMagnitude: 6,
        notationStyle: "e"
      });
      expect(settings.get("graphView")).toEqual({
        expression: "",
        xMin: -10,
        xMax: 10,
        yMin: -10,
        yMax: 10,
        yAuto: true
      });
    });

    test("theme default uses prefers-color-scheme when available", async () => {
      window.matchMedia = jest.fn(() => ({ matches: true, addEventListener: jest.fn(), addListener: jest.fn() }));
      const { settings } = createSettings();
      await settings.ready();
      expect(settings.get("theme")).toBe("dark");

      window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), addListener: jest.fn() }));
      const { settings: s2 } = createSettings();
      await s2.ready();
      expect(s2.get("theme")).toBe("light");
    });

    test("hydrates valid stored values", async () => {
      const { settings } = createSettings({
        slateCalcAngleMode: "deg",
        slateCalcActiveView: "graph",
        slateCalcTheme: "neutral",
        slateCalcExpressionDraft: "2+2"
      });
      await settings.ready();

      expect(settings.get("angleMode")).toBe("deg");
      expect(settings.get("activeView")).toBe("graph");
      expect(settings.get("theme")).toBe("neutral");
      expect(settings.get("expressionDraft")).toBe("2+2");
    });

    test("hydrate falls back to default on invalid stored value and does not write back", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const local = attachChromeStorage({
        slateCalcAngleMode: "totally-invalid",
        slateCalcTheme: 42
      });
      const Cls = loadSettingsModule();
      const settings = new Cls(chrome.storage.local);
      await settings.ready();

      expect(settings.get("angleMode")).toBe("rad");
      // Invalid stored value is preserved in storage (no write-back during hydrate).
      expect(local.__store.slateCalcAngleMode).toBe("totally-invalid");
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test("get throws for unknown key", async () => {
      const { settings } = createSettings();
      await settings.ready();
      expect(() => settings.get("nope")).toThrow(/unknown key/);
    });

    test("ready is idempotent", async () => {
      const { settings } = createSettings();
      const first = settings.ready();
      const second = settings.ready();
      expect(first).toBe(second);
      await first;
      await second;
    });
  });

  describe("set", () => {
    test("updates cache synchronously and persists to storage", async () => {
      const { settings } = createSettings();
      await settings.ready();

      const writePromise = settings.set("angleMode", "deg");
      // Cache is updated synchronously before the write resolves.
      expect(settings.get("angleMode")).toBe("deg");

      await writePromise;
      expect(chrome.storage.local.__store.slateCalcAngleMode).toBe("deg");
    });

    test("throws synchronously when value fails validate", async () => {
      const { settings } = createSettings();
      await settings.ready();

      expect(() => settings.set("angleMode", "spinning")).toThrow(/angleMode/);
      expect(settings.get("angleMode")).toBe("rad");
    });

    test("normalizes composite values via validate", async () => {
      const { settings } = createSettings();
      await settings.ready();

      await settings.set("numberFormat", {
        significantDigits: 100,
        sciNotationMagnitude: 1,
        notationStyle: "bogus"
      });

      expect(settings.get("numberFormat")).toEqual({
        significantDigits: 12,
        sciNotationMagnitude: 3,
        notationStyle: "e"
      });
    });

    test("throws on unknown key", async () => {
      const { settings } = createSettings();
      await settings.ready();
      expect(() => settings.set("nope", 1)).toThrow(/unknown key/);
    });

    test("throws before ready", async () => {
      const { settings } = createSettings();
      expect(() => settings.set("angleMode", "deg")).toThrow(/ready/);
    });
  });

  describe("subscribe", () => {
    test("fires synchronously on set with the new value", async () => {
      const { settings } = createSettings();
      await settings.ready();
      const listener = jest.fn();
      settings.subscribe("angleMode", listener);

      settings.set("angleMode", "deg");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith("deg");
    });

    test("does not fire for other keys", async () => {
      const { settings } = createSettings();
      await settings.ready();
      const listener = jest.fn();
      settings.subscribe("angleMode", listener);

      settings.set("theme", "light");
      expect(listener).not.toHaveBeenCalled();
    });

    test("unsubscribe stops further notifications", async () => {
      const { settings } = createSettings();
      await settings.ready();
      const listener = jest.fn();
      const off = settings.subscribe("angleMode", listener);

      settings.set("angleMode", "deg");
      off();
      settings.set("angleMode", "rad");

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("isolates a throwing subscriber from others and from the write", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const { settings } = createSettings();
      await settings.ready();

      const bad = jest.fn(() => { throw new Error("boom"); });
      const good = jest.fn();
      settings.subscribe("angleMode", bad);
      settings.subscribe("angleMode", good);

      await settings.set("angleMode", "deg");

      expect(bad).toHaveBeenCalled();
      expect(good).toHaveBeenCalledWith("deg");
      expect(chrome.storage.local.__store.slateCalcAngleMode).toBe("deg");
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test("throws on unknown key", async () => {
      const { settings } = createSettings();
      await settings.ready();
      expect(() => settings.subscribe("nope", () => {})).toThrow(/unknown key/);
    });

    test("throws on non-function subscriber", async () => {
      const { settings } = createSettings();
      await settings.ready();
      expect(() => settings.subscribe("angleMode", null)).toThrow(/function/);
    });

    test("reentrant set inside a subscriber does not corrupt iteration", async () => {
      const { settings } = createSettings();
      await settings.ready();
      const calls = [];
      settings.subscribe("angleMode", (value) => {
        calls.push(["first", value]);
        if (value === "deg") {
          // Reentrant set on a different key — must not blow up.
          settings.set("theme", "light");
        }
      });
      settings.subscribe("angleMode", (value) => {
        calls.push(["second", value]);
      });

      settings.set("angleMode", "deg");

      expect(calls).toEqual([
        ["first", "deg"],
        ["second", "deg"]
      ]);
    });
  });

  describe("graphView composite", () => {
    test("validates and snaps invalid ranges to defaults", async () => {
      const { settings } = createSettings();
      await settings.ready();
      await settings.set("graphView", {
        expression: "x^2",
        xMin: 5,
        xMax: -5, // inverted
        yMin: 1,
        yMax: 1, // collapsed
        yAuto: false
      });

      const g = settings.get("graphView");
      expect(g.expression).toBe("x^2");
      expect(g.xMin).toBe(-10);
      expect(g.xMax).toBe(10);
      expect(g.yMin).toBe(-10);
      expect(g.yMax).toBe(10);
      expect(g.yAuto).toBe(false);
    });
  });
});
