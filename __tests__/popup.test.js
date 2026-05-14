const fs = require("fs");
const path = require("path");

const { attachChromeStorage } = require("./helpers/mockChromeStorage");

function loadPopupScript() {
  jest.resetModules();

  const html = fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf8");
  document.documentElement.innerHTML = html;

  window.matchMedia = jest.fn(() => ({
    matches: true,
    addEventListener: jest.fn(),
    addListener: jest.fn()
  }));

  window.CalculatorEvaluator = {
    evaluate: jest.fn(() => ({ ok: true, normalized: "", value: 0 })),
    evaluateWithVariables: jest.fn(() => ({ ok: true, value: 0 }))
  };

  window.CalculatorFormatter = {
    formatResult: jest.fn(() => "0")
  };

  const graphApi = {
    setExpression: jest.fn(),
    setView: jest.fn(),
    draw: jest.fn(() => ({ ok: true, status: "Plot updated", hasPlot: false })),
    getView: jest.fn(() => ({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, yAuto: true })),
    setHoverPixel: jest.fn(() => null),
    clearHover: jest.fn(),
    zoomAtPixel: jest.fn(),
    panByPixels: jest.fn(),
    getWorldForPixel: jest.fn(() => ({ x: 0, y: 0 }))
  };

  window.CalculatorGrapher = {
    create: jest.fn(() => graphApi)
  };

  require(path.join(__dirname, "..", "history.js"));
  require(path.join(__dirname, "..", "popup.js"));
}

async function waitFor(condition, attempts) {
  const maxAttempts = Number.isInteger(attempts) && attempts > 0 ? attempts : 20;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for condition");
}

describe("popup mode persistence", () => {
  test("restores graph mode from saved active view", async () => {
    attachChromeStorage({
      typedCalcActiveView: "graph"
    });

    loadPopupScript();

    const graphView = document.getElementById("graphView");
    await waitFor(() => !graphView.classList.contains("hidden"));

    const calculatorView = document.getElementById("calculatorView");
    const graphModeButton = document.getElementById("graphModeButton");
    const calculatorModeButton = document.getElementById("calculatorModeButton");

    expect(graphView.classList.contains("hidden")).toBe(false);
    expect(calculatorView.classList.contains("hidden")).toBe(true);
    expect(graphModeButton.getAttribute("aria-checked")).toBe("true");
    expect(calculatorModeButton.getAttribute("aria-checked")).toBe("false");
  });

  test("persist active view when switching to graph mode", async () => {
    const local = attachChromeStorage({
      typedCalcActiveView: "calculator"
    });

    loadPopupScript();
    await waitFor(() => document.getElementById("calculatorModeButton").getAttribute("aria-checked") === "true");

    document.getElementById("graphModeButton").click();

    expect(local.__store.typedCalcActiveView).toBe("graph");
  });
});
