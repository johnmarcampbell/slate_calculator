(function () {
  "use strict";

  const SCHEMA = {
    angleMode: {
      storageKey: "typedCalcAngleMode",
      default: "rad",
      validate(value) {
        if (value !== "rad" && value !== "deg") {
          throw new Error("angleMode must be 'rad' or 'deg'");
        }
        return value;
      }
    },
    theme: {
      storageKey: "typedCalcTheme",
      // Function default: detect system preference on hydrate.
      default() {
        if (typeof window !== "undefined" && window.matchMedia) {
          return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return "dark";
      },
      validate(value) {
        const allowed = ["light", "dark", "neutral"];
        if (!allowed.includes(value)) {
          throw new Error("theme must be one of " + allowed.join(", "));
        }
        return value;
      }
    },
    activeView: {
      storageKey: "typedCalcActiveView",
      default: "calculator",
      validate(value) {
        if (value !== "calculator" && value !== "graph") {
          throw new Error("activeView must be 'calculator' or 'graph'");
        }
        return value;
      }
    },
    expressionDraft: {
      storageKey: "typedCalcExpressionDraft",
      default: "",
      validate(value) {
        if (typeof value !== "string") {
          throw new Error("expressionDraft must be a string");
        }
        return value;
      }
    },
    numberFormat: {
      storageKey: "typedCalcNumberFormat",
      default: { significantDigits: 12, sciNotationMagnitude: 6, notationStyle: "e" },
      validate(value) {
        if (!value || typeof value !== "object") {
          throw new Error("numberFormat must be an object");
        }
        const sig = Number.isInteger(value.significantDigits)
          ? Math.max(3, Math.min(12, value.significantDigits))
          : 12;
        const mag = Number.isInteger(value.sciNotationMagnitude)
          ? Math.max(3, Math.min(20, value.sciNotationMagnitude))
          : 6;
        const style = value.notationStyle === "e" || value.notationStyle === "times10"
          ? value.notationStyle
          : "e";
        return { significantDigits: sig, sciNotationMagnitude: mag, notationStyle: style };
      }
    },
    graphView: {
      storageKey: "typedCalcGraphSettings",
      default: { expression: "", xMin: -10, xMax: 10, yMin: -10, yMax: 10, yAuto: true },
      validate(value) {
        if (!value || typeof value !== "object") {
          throw new Error("graphView must be an object");
        }
        const expression = String(value.expression || "");
        const rawXMin = Number(value.xMin);
        const rawXMax = Number(value.xMax);
        const rawYMin = Number(value.yMin);
        const rawYMax = Number(value.yMax);
        const xMin = Number.isFinite(rawXMin) ? rawXMin : -10;
        const xMax = Number.isFinite(rawXMax) ? rawXMax : 10;
        const yMin = Number.isFinite(rawYMin) ? rawYMin : -10;
        const yMax = Number.isFinite(rawYMax) ? rawYMax : 10;
        const safeX = xMax > xMin ? { xMin, xMax } : { xMin: -10, xMax: 10 };
        const safeY = yMax > yMin ? { yMin, yMax } : { yMin: -10, yMax: 10 };
        return {
          expression,
          xMin: safeX.xMin,
          xMax: safeX.xMax,
          yMin: safeY.yMin,
          yMax: safeY.yMax,
          yAuto: value.yAuto !== false
        };
      }
    }
  };

  function resolveDefault(entry) {
    return typeof entry.default === "function" ? entry.default() : entry.default;
  }

  function CalculatorSettings(storage) {
    if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") {
      throw new Error("CalculatorSettings requires a storage backend with get/set");
    }
    this._storage = storage;
    this._cache = {};
    this._subscribers = {};
    this._ready = false;
    this._readyPromise = null;
  }

  CalculatorSettings.prototype.ready = function () {
    if (this._readyPromise) {
      return this._readyPromise;
    }
    const self = this;
    const storageKeys = Object.values(SCHEMA).map((entry) => entry.storageKey);
    this._readyPromise = new Promise((resolve) => {
      self._storage.get(storageKeys, (payload) => {
        Object.keys(SCHEMA).forEach((key) => {
          const entry = SCHEMA[key];
          const stored = payload[entry.storageKey];
          if (stored === undefined) {
            self._cache[key] = resolveDefault(entry);
            return;
          }
          try {
            self._cache[key] = entry.validate(stored);
          } catch (error) {
            console.warn(
              "CalculatorSettings: invalid stored value for '" + key + "', using default",
              error
            );
            self._cache[key] = resolveDefault(entry);
          }
        });
        self._ready = true;
        resolve();
      });
    });
    return this._readyPromise;
  };

  CalculatorSettings.prototype.get = function (key) {
    if (!this._ready) {
      throw new Error("CalculatorSettings: ready() has not resolved yet (reading '" + key + "')");
    }
    if (!Object.prototype.hasOwnProperty.call(SCHEMA, key)) {
      throw new Error("CalculatorSettings: unknown key '" + key + "'");
    }
    return this._cache[key];
  };

  CalculatorSettings.prototype.set = function (key, value) {
    if (!this._ready) {
      throw new Error("CalculatorSettings: ready() has not resolved yet (writing '" + key + "')");
    }
    if (!Object.prototype.hasOwnProperty.call(SCHEMA, key)) {
      throw new Error("CalculatorSettings: unknown key '" + key + "'");
    }
    const entry = SCHEMA[key];
    const normalized = entry.validate(value);
    this._cache[key] = normalized;

    const subs = (this._subscribers[key] || []).slice();
    for (let i = 0; i < subs.length; i += 1) {
      try {
        subs[i](normalized);
      } catch (error) {
        console.error("CalculatorSettings: subscriber for '" + key + "' threw", error);
      }
    }

    const self = this;
    return new Promise((resolve, reject) => {
      try {
        self._storage.set({ [entry.storageKey]: normalized }, () => {
          if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError) {
            const err = chrome.runtime.lastError;
            console.error("CalculatorSettings: storage write failed for '" + key + "'", err);
            reject(err);
            return;
          }
          resolve(normalized);
        });
      } catch (error) {
        console.error("CalculatorSettings: storage write threw for '" + key + "'", error);
        reject(error);
      }
    });
  };

  CalculatorSettings.prototype.subscribe = function (key, fn) {
    if (!Object.prototype.hasOwnProperty.call(SCHEMA, key)) {
      throw new Error("CalculatorSettings: unknown key '" + key + "'");
    }
    if (typeof fn !== "function") {
      throw new Error("CalculatorSettings: subscriber must be a function");
    }
    if (!this._subscribers[key]) {
      this._subscribers[key] = [];
    }
    const subs = this._subscribers[key];
    subs.push(fn);
    return function unsubscribe() {
      const idx = subs.indexOf(fn);
      if (idx >= 0) {
        subs.splice(idx, 1);
      }
    };
  };

  window.CalculatorSettings = CalculatorSettings;
})();
