// Screenshot-only shim: mocks chrome.storage.local so the real popup can run
// from file:// in headless Chrome. Never shipped with the extension.
(function () {
  "use strict";

  const scene = new URLSearchParams(window.location.search).get("scene") || "calc";

  const history = [
    {
      expression: "sin(pi/4)^2 + cos(pi/4)^2",
      normalizedExpression: "sin(pi/4)^2 + cos(pi/4)^2",
      resultValue: 1,
      resultText: "1",
      angleMode: "rad",
      ts: 1752264000000
    },
    {
      expression: "2*pi*6371",
      normalizedExpression: "2*pi*6371",
      resultValue: 40030.173592041145,
      resultText: "40030.1735920",
      angleMode: "rad",
      ts: 1752263940000
    },
    {
      expression: "sqrt(2)/2",
      normalizedExpression: "sqrt(2)/2",
      resultValue: 0.7071067811865476,
      resultText: "0.707106781187",
      angleMode: "rad",
      ts: 1752263880000
    },
    {
      expression: "log10(1e6)",
      normalizedExpression: "log10(1e6)",
      resultValue: 6,
      resultText: "6",
      angleMode: "rad",
      ts: 1752263820000
    }
  ];

  const scenes = {
    calc: {
      slateCalcTheme: "dark",
      slateCalcActiveView: "calculator",
      slateCalcExpressionDraft: "(1 + sqrt(5)) / 2",
      slateCalcHistory: history
    },
    graph: {
      slateCalcTheme: "dark",
      slateCalcActiveView: "graph",
      slateCalcGraphSettings: {
        expression: "sin(x)*exp(-x*x/36)",
        xMin: -12,
        xMax: 12,
        yMin: -1.2,
        yMax: 1.2,
        yAuto: true
      },
      slateCalcHistory: history
    },
    light: {
      slateCalcTheme: "light",
      slateCalcActiveView: "calculator",
      slateCalcExpressionDraft: "atan(1)*4",
      slateCalcHistory: history
    }
  };

  const data = Object.assign({}, scenes[scene] || scenes.calc);

  window.chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const wanted = Array.isArray(keys) ? keys : [keys];
          const payload = {};
          wanted.forEach((key) => {
            if (key in data) {
              payload[key] = data[key];
            }
          });
          setTimeout(() => callback(payload), 0);
        },
        set(items, callback) {
          Object.assign(data, items);
          if (callback) setTimeout(callback, 0);
        }
      }
    },
    runtime: {
      getURL: (path) => path
    }
  };
})();
