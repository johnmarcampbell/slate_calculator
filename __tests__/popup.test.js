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
  require(path.join(__dirname, "..", "settings.js"));
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

function waitForInit() {
  // The HTML's initial aria-checked values match the calculator-view default,
  // so wait for an effect that only happens after init actually runs:
  // redrawGraph -> persistGraphSettings writes to storage.
  return waitFor(() => chrome.storage.local.set.mock.calls.length > 0);
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

describe("theme switching", () => {
  test("clicking light theme updates data-theme and persists", async () => {
    const local = attachChromeStorage({ typedCalcTheme: "dark" });
    loadPopupScript();
    await waitForInit();

    document.getElementById("lightThemeButton").click();
    await waitFor(() =>
      document.getElementById("lightThemeButton").getAttribute("aria-checked") === "true"
    );

    expect(local.__store.typedCalcTheme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.getElementById("darkThemeButton").getAttribute("aria-checked")).toBe("false");
  });

  test("clicking neutral theme updates data-theme and persists", async () => {
    const local = attachChromeStorage({ typedCalcTheme: "dark" });
    loadPopupScript();
    await waitForInit();

    document.getElementById("neutralThemeButton").click();
    await waitFor(() =>
      document.getElementById("neutralThemeButton").getAttribute("aria-checked") === "true"
    );

    expect(local.__store.typedCalcTheme).toBe("neutral");
    expect(document.documentElement.getAttribute("data-theme")).toBe("neutral");
    expect(document.getElementById("darkThemeButton").getAttribute("aria-checked")).toBe("false");
  });
});

describe("angle mode switching", () => {
  test("clicking degrees updates buttons and persists", async () => {
    const local = attachChromeStorage({ typedCalcAngleMode: "rad" });
    loadPopupScript();
    await waitForInit();

    document.getElementById("degreesAngleButton").click();
    await waitFor(() => document.getElementById("degreesAngleButton").getAttribute("aria-checked") === "true");

    expect(local.__store.typedCalcAngleMode).toBe("deg");
    expect(document.getElementById("radiansAngleButton").getAttribute("aria-checked")).toBe("false");
  });

  test("clicking radians from degrees updates buttons and persists", async () => {
    const local = attachChromeStorage({ typedCalcAngleMode: "deg" });
    loadPopupScript();
    await waitFor(() => document.getElementById("degreesAngleButton").getAttribute("aria-checked") === "true");

    document.getElementById("radiansAngleButton").click();
    await waitFor(() => document.getElementById("radiansAngleButton").getAttribute("aria-checked") === "true");

    expect(local.__store.typedCalcAngleMode).toBe("rad");
  });
});

describe("menu behavior", () => {
  test("Escape key closes open mode menu", async () => {
    attachChromeStorage({});
    loadPopupScript();
    await waitForInit();

    document.getElementById("modeMenuButton").click();
    expect(document.getElementById("modeMenu").classList.contains("open")).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.getElementById("modeMenu").classList.contains("open")).toBe(false);
  });

  test("Escape key closes open settings menu", async () => {
    attachChromeStorage({});
    loadPopupScript();
    await waitForInit();

    document.getElementById("settingsMenuButton").click();
    expect(document.getElementById("settingsMenu").classList.contains("open")).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.getElementById("settingsMenu").classList.contains("open")).toBe(false);
  });

  test("clicking outside mode menu closes it", async () => {
    attachChromeStorage({});
    loadPopupScript();
    await waitForInit();

    document.getElementById("modeMenuButton").click();
    expect(document.getElementById("modeMenu").classList.contains("open")).toBe(true);

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("modeMenu").classList.contains("open")).toBe(false);
  });

  test("opening mode menu closes settings menu", async () => {
    attachChromeStorage({});
    loadPopupScript();
    await waitForInit();

    document.getElementById("settingsMenuButton").click();
    expect(document.getElementById("settingsMenu").classList.contains("open")).toBe(true);

    document.getElementById("modeMenuButton").click();
    expect(document.getElementById("modeMenu").classList.contains("open")).toBe(true);
    expect(document.getElementById("settingsMenu").classList.contains("open")).toBe(false);
  });
});

describe("number format settings", () => {
  test("sig digits slider updates display and persists", async () => {
    const local = attachChromeStorage({});
    loadPopupScript();
    await waitForInit();

    const slider = document.getElementById("sigDigitsSlider");
    slider.value = "8";
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      const stored = local.__store.typedCalcNumberFormat;
      return stored && stored.significantDigits === 8;
    });

    expect(local.__store.typedCalcNumberFormat.significantDigits).toBe(8);
    expect(document.getElementById("sigDigitsValue").textContent).toBe("8");
  });

  test("magnitude slider updates display and persists", async () => {
    const local = attachChromeStorage({});
    loadPopupScript();
    await waitForInit();

    const slider = document.getElementById("magnitudeSlider");
    slider.value = "10";
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      const stored = local.__store.typedCalcNumberFormat;
      return stored && stored.sciNotationMagnitude === 10;
    });

    expect(local.__store.typedCalcNumberFormat.sciNotationMagnitude).toBe(10);
    expect(document.getElementById("magnitudeValue").textContent).toBe("10");
  });
});

describe("history", () => {
  test("committing an expression adds it to the history list", async () => {
    attachChromeStorage({});
    loadPopupScript();
    await waitForInit();

    window.CalculatorEvaluator.evaluate.mockReturnValueOnce({
      ok: true,
      normalized: "2+2",
      value: 4
    });
    window.CalculatorFormatter.formatResult.mockReturnValue("4");

    const input = document.getElementById("expressionInput");
    input.value = "2+2";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await waitFor(() => document.querySelector(".history-expression") !== null);

    expect(document.querySelector(".history-expression").textContent).toBe("2+2");
    expect(document.querySelector(".history-result").textContent).toBe("= 4");
  });

  test("clearing history removes all entries", async () => {
    attachChromeStorage({
      typedCalcHistory: [
        { expression: "1+1", resultText: "2", resultValue: 2, angleMode: "rad", ts: 1 }
      ]
    });
    loadPopupScript();
    await waitFor(() => document.querySelector(".history-expression") !== null);

    document.getElementById("clearHistoryButton").click();
    await waitFor(() => document.querySelector(".empty-history") !== null);

    expect(document.querySelector(".history-expression")).toBeNull();
    expect(document.querySelector(".empty-history").textContent).toBe("No calculations yet.");
  });
});
