(function () {
  "use strict";

  const HISTORY_LIMIT = 80;
  const PREVIEW_DEBOUNCE_MS = 120;
  const GRAPH_PREVIEW_DEBOUNCE_MS = 140;

  const settings = new window.CalculatorSettings(chrome.storage.local);

  let historyEntries = [];
  let previewTimer = null;
  let graphPreviewTimer = null;
  let lastSelectionStart = 0;
  let lastSelectionEnd = 0;
  let hasShownValidResult = false;
  let lastValidResultText = "";
  let grapher = null;
  let dragState = null;
  const isDetachedWindow = new URLSearchParams(window.location.search).get("detached") === "1";

  // --- DOM refs ---

  const expressionInput = document.getElementById("expressionInput");
  const calculationPanel = expressionInput.closest(".calculation-panel");
  const resultText = document.getElementById("resultText");
  const historyList = document.getElementById("historyList");
  const clearHistoryButton = document.getElementById("clearHistoryButton");
  const popoutButton = document.getElementById("popoutButton");
  const modeMenuButton = document.getElementById("modeMenuButton");
  const modeMenu = document.getElementById("modeMenu");
  const settingsMenuButton = document.getElementById("settingsMenuButton");
  const settingsMenu = document.getElementById("settingsMenu");
  const calculatorModeButton = document.getElementById("calculatorModeButton");
  const graphModeButton = document.getElementById("graphModeButton");
  const radiansAngleButton = document.getElementById("radiansAngleButton");
  const degreesAngleButton = document.getElementById("degreesAngleButton");
  const themeMenuButton = document.getElementById("themeMenuButton");
  const themeSubmenu = document.getElementById("themeSubmenu");
  const lightThemeButton = document.getElementById("lightThemeButton");
  const darkThemeButton = document.getElementById("darkThemeButton");
  const neutralThemeButton = document.getElementById("neutralThemeButton");
  const calculatorView = document.getElementById("calculatorView");
  const graphView = document.getElementById("graphView");

  const numberFormatButton = document.getElementById("numberFormatButton");
  const numberFormatPanel = document.getElementById("numberFormatPanel");
  const numberFormatCloseButton = document.getElementById("numberFormatCloseButton");
  const sigDigitsSlider = document.getElementById("sigDigitsSlider");
  const sigDigitsValue = document.getElementById("sigDigitsValue");
  const magnitudeSlider = document.getElementById("magnitudeSlider");
  const magnitudeValue = document.getElementById("magnitudeValue");
  const notationStyleE = document.getElementById("notationStyleE");
  const notationStyleTimes10 = document.getElementById("notationStyleTimes10");
  const previewTiny = document.getElementById("previewTiny");
  const previewSmall = document.getElementById("previewSmall");
  const previewInteger = document.getElementById("previewInteger");
  const previewLarge = document.getElementById("previewLarge");
  const previewHuge = document.getElementById("previewHuge");
  const previewPi = document.getElementById("previewPi");

  const graphExpressionInput = document.getElementById("graphExpressionInput");
  const xMinInput = document.getElementById("xMinInput");
  const xMaxInput = document.getElementById("xMaxInput");
  const yMinInput = document.getElementById("yMinInput");
  const yMaxInput = document.getElementById("yMaxInput");
  const yAutoCheckbox = document.getElementById("yAutoCheckbox");
  const graphCanvas = document.getElementById("graphCanvas");
  const graphStatusText = document.getElementById("graphStatusText");
  const graphCoordsText = document.getElementById("graphCoordsText");
  const graphRedrawButton = document.getElementById("graphRedrawButton");
  const graphResetButton = document.getElementById("graphResetButton");

  // --- Formatting helpers ---

  function renderFormatted(formatted, container) {
    if (typeof formatted === "object" && formatted !== null && formatted.html) {
      container.innerHTML = formatted.html;
    } else {
      container.textContent = formatted;
    }
  }

  function getFormattedText(formatted) {
    if (typeof formatted === "object" && formatted !== null && formatted.text) {
      return formatted.text;
    }
    return formatted;
  }

  // --- Menu helpers ---

  function createMenu(menuEl, buttonEl) {
    return {
      close() {
        menuEl.classList.remove("open");
        buttonEl.setAttribute("aria-expanded", "false");
      },
      toggle(forceOpen) {
        const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !menuEl.classList.contains("open");
        menuEl.classList.toggle("open", shouldOpen);
        buttonEl.setAttribute("aria-expanded", String(shouldOpen));
        return shouldOpen;
      },
      isOpen() {
        return menuEl.classList.contains("open");
      },
      contains(el) {
        return menuEl.contains(el);
      }
    };
  }

  const modeMenuCtrl = createMenu(modeMenu, modeMenuButton);
  const settingsMenuCtrl = createMenu(settingsMenu, settingsMenuButton);
  const themeSubmenuCtrl = createMenu(themeSubmenu, themeMenuButton);

  // --- Core functions ---

  function openDetachedWindow() {
    const url = chrome.runtime.getURL("popup.html?detached=1");

    if (chrome.windows && chrome.windows.create) {
      chrome.windows.create({
        url,
        type: "popup",
        width: 460,
        height: 700
      }, () => {
        if (!isDetachedWindow) {
          window.close();
        }
      });
      return;
    }

    window.open(url, "typed-calculator-popout", "popup,width=460,height=700");
    if (!isDetachedWindow) {
      window.close();
    }
  }

  function formatResult(value) {
    return window.CalculatorFormatter.formatResult(value, settings.get("numberFormat"));
  }

  function formatResultParseable(value) {
    const formatted = window.CalculatorFormatter.formatResult(value, settings.get("numberFormat"));
    return getFormattedText(formatted).replace(/×/g, "*");
  }

  function setResultMessage(message, isError) {
    renderFormatted(message, resultText);
    resultText.classList.toggle("error", Boolean(isError));
    resultText.classList.toggle("success", !isError);
    calculationPanel.classList.toggle("error", Boolean(isError));
  }

  function setGraphStatus(message, isError) {
    graphStatusText.textContent = message;
    graphStatusText.classList.toggle("error", Boolean(isError));
  }

  function toggleNumberFormatPanel() {
    const isOpen = numberFormatPanel.classList.toggle("open");
    numberFormatPanel.setAttribute("aria-hidden", String(!isOpen));
    if (isOpen) {
      updatePreview();
    }
    modeMenuCtrl.close();
    settingsMenuCtrl.close();
  }

  function updateNumberFormatUIFromSettings() {
    const nf = settings.get("numberFormat");
    sigDigitsSlider.value = nf.significantDigits;
    sigDigitsValue.textContent = nf.significantDigits;
    magnitudeSlider.value = nf.sciNotationMagnitude;
    magnitudeValue.textContent = nf.sciNotationMagnitude;

    if (nf.notationStyle === "times10") {
      notationStyleTimes10.checked = true;
    } else {
      notationStyleE.checked = true;
    }
  }

  function updatePreview() {
    const nf = settings.get("numberFormat");
    const testValues = [
      { el: previewTiny, value: 0.00000453245 },
      { el: previewSmall, value: 0.123456789 },
      { el: previewInteger, value: 42 },
      { el: previewLarge, value: 123456789012 },
      { el: previewHuge, value: 9.87654321e25 },
      { el: previewPi, value: 3.14159265359 }
    ];

    testValues.forEach(({ el, value }) => {
      renderFormatted(window.CalculatorFormatter.formatResult(value, nf), el);
    });
  }

  function onNumberFormatChange(key, value) {
    const current = settings.get("numberFormat");
    const next = Object.assign({}, current, { [key]: value });
    settings.set("numberFormat", next).catch((error) => {
      console.error("Failed to persist number format", error);
    });
    updatePreview();
  }

  function updateGraphInputsFromState() {
    const g = settings.get("graphView");
    graphExpressionInput.value = g.expression;
    xMinInput.value = g.xMin;
    xMaxInput.value = g.xMax;
    yMinInput.value = g.yMin;
    yMaxInput.value = g.yMax;
    yAutoCheckbox.checked = g.yAuto;
    yMinInput.disabled = g.yAuto;
    yMaxInput.disabled = g.yAuto;
  }

  function readGraphSettingsFromInputs() {
    const current = settings.get("graphView");
    const next = {
      expression: graphExpressionInput.value.trim(),
      xMin: Number(xMinInput.value),
      xMax: Number(xMaxInput.value),
      yMin: Number(yMinInput.value),
      yMax: Number(yMaxInput.value),
      yAuto: yAutoCheckbox.checked
    };

    if (!Number.isFinite(next.xMin) || !Number.isFinite(next.xMax) || next.xMax <= next.xMin) {
      return { ok: false, error: "x range must be valid and x max must be greater than x min" };
    }

    if (!next.yAuto && (!Number.isFinite(next.yMin) || !Number.isFinite(next.yMax) || next.yMax <= next.yMin)) {
      return { ok: false, error: "y range must be valid and y max must be greater than y min" };
    }

    if (next.yAuto) {
      next.yMin = current.yMin;
      next.yMax = current.yMax;
    }

    return { ok: true, value: next };
  }

  function getCanvasRelativePoint(event) {
    const rect = graphCanvas.getBoundingClientRect();
    const scaleX = graphCanvas.width / Math.max(rect.width, 1);
    const scaleY = graphCanvas.height / Math.max(rect.height, 1);
    return {
      px: (event.clientX - rect.left) * scaleX,
      py: (event.clientY - rect.top) * scaleY
    };
  }

  function updateCoordsMessage(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      graphCoordsText.textContent = "x: -, y: -";
      return;
    }

    const xLabel = formatResult(point.x);
    const yLabel = formatResult(point.y);
    graphCoordsText.textContent = "x: " + xLabel + ", y: " + yLabel;
  }

  async function redrawGraph(showErrors) {
    if (!grapher) {
      return;
    }

    const parsed = readGraphSettingsFromInputs();
    if (!parsed.ok) {
      if (showErrors) {
        setGraphStatus("Error: " + parsed.error, true);
      }
      return;
    }

    let nextGraphView = parsed.value;
    grapher.setExpression(nextGraphView.expression);
    grapher.setView(nextGraphView);

    const drawResult = grapher.draw();
    if (!drawResult.ok) {
      if (showErrors) {
        setGraphStatus("Error: " + drawResult.error, true);
      }
      return;
    }

    if (nextGraphView.yAuto) {
      const view = grapher.getView();
      nextGraphView = Object.assign({}, nextGraphView, { yMin: view.yMin, yMax: view.yMax });
      yMinInput.value = nextGraphView.yMin;
      yMaxInput.value = nextGraphView.yMax;
    }

    setGraphStatus(drawResult.status, false);
    await settings.set("graphView", nextGraphView);
  }

  function queueGraphRedraw(showErrors) {
    if (!grapher) {
      return;
    }

    window.clearTimeout(graphPreviewTimer);
    graphPreviewTimer = window.setTimeout(() => {
      redrawGraph(showErrors).catch((error) => {
        console.error(error);
        setGraphStatus("Error: failed to draw graph", true);
      });
    }, GRAPH_PREVIEW_DEBOUNCE_MS);
  }

  // --- View rendering (pure DOM, no side effects) ---

  function renderAngleMode(mode) {
    const degreesActive = mode === "deg";
    radiansAngleButton.classList.toggle("active", !degreesActive);
    degreesAngleButton.classList.toggle("active", degreesActive);
    radiansAngleButton.setAttribute("aria-checked", String(!degreesActive));
    degreesAngleButton.setAttribute("aria-checked", String(degreesActive));
  }

  function renderTheme(theme) {
    lightThemeButton.classList.toggle("active", theme === "light");
    darkThemeButton.classList.toggle("active", theme === "dark");
    neutralThemeButton.classList.toggle("active", theme === "neutral");
    lightThemeButton.setAttribute("aria-checked", String(theme === "light"));
    darkThemeButton.setAttribute("aria-checked", String(theme === "dark"));
    neutralThemeButton.setAttribute("aria-checked", String(theme === "neutral"));
    document.documentElement.setAttribute("data-theme", theme);
  }

  function renderActiveView(viewName) {
    const graphActive = viewName === "graph";
    calculatorView.classList.toggle("hidden", graphActive);
    graphView.classList.toggle("hidden", !graphActive);
    calculatorModeButton.classList.toggle("active", !graphActive);
    graphModeButton.classList.toggle("active", graphActive);
    calculatorModeButton.setAttribute("aria-checked", String(!graphActive));
    graphModeButton.setAttribute("aria-checked", String(graphActive));
  }

  // --- State setters (render + persist + side effects) ---

  function setAngleMode(nextMode) {
    const safe = nextMode === "deg" ? "deg" : "rad";
    renderAngleMode(safe);
    settings.set("angleMode", safe).catch((error) => {
      console.error("Failed to persist angle mode", error);
    });
    triggerPreview();
    if (settings.get("activeView") === "graph") {
      queueGraphRedraw(false);
    }
  }

  function setTheme(theme) {
    const validThemes = ["light", "dark", "neutral"];
    const safeTheme = validThemes.includes(theme) ? theme : "dark";
    renderTheme(safeTheme);
    settings.set("theme", safeTheme).catch((error) => {
      console.error("Failed to persist theme", error);
    });
    if (settings.get("activeView") === "graph") {
      redrawGraph(false).catch((error) => {
        console.error(error);
        setGraphStatus("Error: failed to draw graph", true);
      });
    }
  }

  function setActiveView(viewName) {
    const safe = viewName === "graph" ? "graph" : "calculator";
    renderActiveView(safe);
    modeMenuCtrl.close();
    settingsMenuCtrl.close();

    if (safe === "graph") {
      if (!graphExpressionInput.value.trim() && expressionInput.value.trim()) {
        graphExpressionInput.value = expressionInput.value.trim();
      }
      queueGraphRedraw(false);
      graphExpressionInput.focus();
      graphExpressionInput.setSelectionRange(graphExpressionInput.value.length, graphExpressionInput.value.length);
    } else {
      expressionInput.focus();
      updateCaretSnapshot();
    }

    settings.set("activeView", safe).catch((error) => {
      console.error("Failed to persist active view", error);
    });
  }

  function setupGraphInteractions() {
    grapher = window.CalculatorGrapher.create(graphCanvas, {
      evaluateAtX: (expression, x) => {
        return window.CalculatorEvaluator.evaluateWithVariables(expression, settings.get("angleMode"), { x });
      }
    });

    graphCanvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const { px, py } = getCanvasRelativePoint(event);
      const scale = event.deltaY < 0 ? 0.9 : 1.1;
      grapher.zoomAtPixel(scale, px, py);
      const nextView = grapher.getView();
      xMinInput.value = nextView.xMin;
      xMaxInput.value = nextView.xMax;
      if (!yAutoCheckbox.checked) {
        yMinInput.value = nextView.yMin;
        yMaxInput.value = nextView.yMax;
      }
      queueGraphRedraw(false);
    });

    graphCanvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      graphCanvas.setPointerCapture(event.pointerId);
      dragState = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };
    });

    graphCanvas.addEventListener("pointermove", (event) => {
      if (dragState && dragState.pointerId === event.pointerId) {
        const rect = graphCanvas.getBoundingClientRect();
        const scaleX = graphCanvas.width / Math.max(rect.width, 1);
        const scaleY = graphCanvas.height / Math.max(rect.height, 1);
        const dx = (event.clientX - dragState.x) * scaleX;
        const dy = (event.clientY - dragState.y) * scaleY;
        dragState.x = event.clientX;
        dragState.y = event.clientY;

        grapher.panByPixels(dx, dy);
        const nextView = grapher.getView();
        xMinInput.value = nextView.xMin;
        xMaxInput.value = nextView.xMax;
        if (!yAutoCheckbox.checked) {
          yMinInput.value = nextView.yMin;
          yMaxInput.value = nextView.yMax;
        }
        queueGraphRedraw(false);
        return;
      }

      const { px } = getCanvasRelativePoint(event);
      const nearest = grapher.setHoverPixel(px);
      updateCoordsMessage(nearest);
    });

    graphCanvas.addEventListener("pointerup", (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      graphCanvas.releasePointerCapture(event.pointerId);
      dragState = null;
      // redrawGraph (already queued by pointermove) persists the new view.
    });

    graphCanvas.addEventListener("pointercancel", () => {
      dragState = null;
    });

    graphCanvas.addEventListener("pointerleave", () => {
      if (dragState) {
        return;
      }
      grapher.clearHover();
      updateCoordsMessage(null);
    });

    graphExpressionInput.addEventListener("input", () => {
      queueGraphRedraw(false);
    });

    [xMinInput, xMaxInput, yMinInput, yMaxInput].forEach((input) => {
      input.addEventListener("input", () => {
        queueGraphRedraw(false);
      });
    });

    yAutoCheckbox.addEventListener("change", () => {
      yMinInput.disabled = yAutoCheckbox.checked;
      yMaxInput.disabled = yAutoCheckbox.checked;
      queueGraphRedraw(true);
    });

    graphRedrawButton.addEventListener("click", () => {
      redrawGraph(true).catch((error) => {
        console.error(error);
        setGraphStatus("Error: failed to draw graph", true);
      });
    });

    graphResetButton.addEventListener("click", () => {
      const defaults = { expression: graphExpressionInput.value.trim(), xMin: -10, xMax: 10, yMin: -10, yMax: 10, yAuto: true };
      xMinInput.value = defaults.xMin;
      xMaxInput.value = defaults.xMax;
      yMinInput.value = defaults.yMin;
      yMaxInput.value = defaults.yMax;
      yAutoCheckbox.checked = defaults.yAuto;
      yMinInput.disabled = defaults.yAuto;
      yMaxInput.disabled = defaults.yAuto;
      queueGraphRedraw(true);
    });
  }

  function updateCaretSnapshot() {
    if (document.activeElement !== expressionInput) {
      return;
    }

    lastSelectionStart = expressionInput.selectionStart || 0;
    lastSelectionEnd = expressionInput.selectionEnd || lastSelectionStart;
  }

  function insertTextAtCaret(textToInsert) {
    const insertion = String(textToInsert ?? "");
    const currentValue = expressionInput.value;

    let start = lastSelectionStart;
    let end = lastSelectionEnd;

    if (typeof start !== "number" || start < 0 || start > currentValue.length) {
      start = currentValue.length;
    }
    if (typeof end !== "number" || end < start || end > currentValue.length) {
      end = start;
    }

    const nextValue = currentValue.slice(0, start) + insertion + currentValue.slice(end);
    expressionInput.value = nextValue;

    const nextCaret = start + insertion.length;
    expressionInput.focus();
    expressionInput.setSelectionRange(nextCaret, nextCaret);
    updateCaretSnapshot();
    settings.set("expressionDraft", nextValue).catch((error) => {
      console.error("Failed to save expression draft", error);
    });
    triggerPreview();
  }

  async function copyToClipboard(value) {
    const text = String(value ?? "");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const tmp = document.createElement("textarea");
    tmp.value = text;
    tmp.setAttribute("readonly", "");
    tmp.style.position = "absolute";
    tmp.style.left = "-9999px";
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand("copy");
    document.body.removeChild(tmp);
  }

  function createCopyButton(textToCopy) {
    const copyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 1H4C2.9 1 2 1.9 2 3v12h2V3h12V1zm3 4H8C6.9 5 6 5.9 6 7v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    const copiedIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "ghost-button icon-button history-copy";
    copyButton.title = "Copy";
    copyButton.setAttribute("aria-label", "Copy");
    copyButton.innerHTML = copyIcon;

    let resetTimer = null;

    function resetCopiedState() {
      copyButton.classList.remove("copied");
      copyButton.innerHTML = copyIcon;
      copyButton.title = "Copy";
      copyButton.setAttribute("aria-label", "Copy");
      if (resetTimer) {
        window.clearTimeout(resetTimer);
        resetTimer = null;
      }
    }

    copyButton.addEventListener("click", async () => {
      try {
        await copyToClipboard(textToCopy);
        copyButton.classList.add("copied");
        copyButton.innerHTML = copiedIcon;
        copyButton.title = "Copied";
        copyButton.setAttribute("aria-label", "Copied");
        if (resetTimer) {
          window.clearTimeout(resetTimer);
        }
        resetTimer = window.setTimeout(() => {
          resetCopiedState();
        }, 900);
      } catch (error) {
        console.error("Clipboard copy failed", error);
      }
    });

    return copyButton;
  }

  function evaluateCurrentExpression(showErrors) {
    const expression = expressionInput.value;
    const angleMode = settings.get("angleMode");
    const evaluation = window.CalculatorEvaluator.evaluate(expression, angleMode);

    if (!evaluation.ok) {
      if (showErrors) {
        setResultMessage("Error: " + evaluation.error, true);
      } else {
        if (hasShownValidResult) {
          setResultMessage(lastValidResultText, false);
        } else {
          setResultMessage("0.0", false);
        }
      }
      return null;
    }

    const formatted = formatResult(evaluation.value);
    setResultMessage(formatted, false);
    hasShownValidResult = true;
    lastValidResultText = formatted;

    return {
      expression,
      normalizedExpression: evaluation.normalized,
      resultValue: evaluation.value,
      resultText: getFormattedText(formatted),
      angleMode,
      ts: Date.now()
    };
  }

  function triggerPreview() {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      if (!expressionInput.value.trim()) {
        hasShownValidResult = false;
        lastValidResultText = "";
        setResultMessage("0.0", false);
        calculationPanel.classList.remove("error");
        return;
      }
      evaluateCurrentExpression(false);
    }, PREVIEW_DEBOUNCE_MS);
  }

  async function commitCalculationFromInput() {
    const entry = evaluateCurrentExpression(true);
    if (!entry) {
      return;
    }

    historyEntries = await window.CalculatorHistory.addHistoryEntry(entry, HISTORY_LIMIT);
    renderHistory();
    await settings.set("expressionDraft", "");

    expressionInput.value = "";
    hasShownValidResult = false;
    lastValidResultText = "";
    setResultMessage("0.0", false);
    expressionInput.focus();
    expressionInput.setSelectionRange(0, 0);
    updateCaretSnapshot();
  }

  function createHistoryRow(entry) {
    const item = document.createElement("li");
    item.className = "history-item";

    const expressionLine = document.createElement("div");
    expressionLine.className = "history-line";

    const expressionButton = document.createElement("button");
    expressionButton.type = "button";
    expressionButton.className = "history-expression";
    expressionButton.title = "Insert expression at cursor";
    expressionButton.textContent = entry.expression;
    expressionButton.addEventListener("click", () => {
      insertTextAtCaret(entry.expression);
    });
    expressionLine.appendChild(expressionButton);
    expressionLine.appendChild(createCopyButton(entry.expression));

    const resultLine = document.createElement("div");
    resultLine.className = "history-line";

    const resultButton = document.createElement("button");
    resultButton.type = "button";
    resultButton.className = "history-result";
    resultButton.title = "Insert result at cursor";
    resultButton.textContent = "= " + entry.resultText;
    resultButton.addEventListener("click", () => {
      const parseableValue = formatResultParseable(entry.resultValue);
      insertTextAtCaret(parseableValue);
    });
    resultLine.appendChild(resultButton);
    resultLine.appendChild(createCopyButton(formatResultParseable(entry.resultValue)));

    item.appendChild(expressionLine);
    item.appendChild(resultLine);
    return item;
  }

  function renderHistory() {
    historyList.innerHTML = "";
    if (!historyEntries.length) {
      const empty = document.createElement("p");
      empty.className = "empty-history";
      empty.textContent = "No calculations yet.";
      historyList.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    historyEntries.forEach((entry) => {
      fragment.appendChild(createHistoryRow(entry));
    });
    historyList.appendChild(fragment);
  }

  async function initializeState() {
    if (isDetachedWindow) {
      document.body.classList.add("detached");
    }

    await settings.ready();

    historyEntries = await window.CalculatorHistory.getHistory();
    renderHistory();

    renderTheme(settings.get("theme"));
    renderAngleMode(settings.get("angleMode"));
    updateNumberFormatUIFromSettings();

    updateGraphInputsFromState();
    setupGraphInteractions();
    await redrawGraph(false);

    const savedDraft = settings.get("expressionDraft");
    expressionInput.value = savedDraft;
    if (savedDraft.trim()) {
      evaluateCurrentExpression(false);
    }

    setActiveView(settings.get("activeView"));
  }

  // --- Event listeners ---

  modeMenuButton.addEventListener("click", () => {
    const opening = modeMenuCtrl.toggle();
    if (opening) settingsMenuCtrl.close();
  });

  settingsMenuButton.addEventListener("click", () => {
    const opening = settingsMenuCtrl.toggle();
    if (opening) modeMenuCtrl.close();
  });

  calculatorModeButton.addEventListener("click", () => {
    setActiveView("calculator");
  });

  graphModeButton.addEventListener("click", () => {
    setActiveView("graph");
  });

  radiansAngleButton.addEventListener("click", () => {
    setAngleMode("rad");
    settingsMenuCtrl.close();
  });

  degreesAngleButton.addEventListener("click", () => {
    setAngleMode("deg");
    settingsMenuCtrl.close();
  });

  themeMenuButton.addEventListener("click", () => {
    themeSubmenuCtrl.toggle();
  });

  lightThemeButton.addEventListener("click", () => {
    setTheme("light");
    themeSubmenuCtrl.close();
    settingsMenuCtrl.close();
  });

  darkThemeButton.addEventListener("click", () => {
    setTheme("dark");
    themeSubmenuCtrl.close();
    settingsMenuCtrl.close();
  });

  neutralThemeButton.addEventListener("click", () => {
    setTheme("neutral");
    themeSubmenuCtrl.close();
    settingsMenuCtrl.close();
  });

  numberFormatButton.addEventListener("click", () => {
    toggleNumberFormatPanel();
  });

  numberFormatCloseButton.addEventListener("click", () => {
    numberFormatPanel.classList.remove("open");
    numberFormatPanel.setAttribute("aria-hidden", "true");
  });

  sigDigitsSlider.addEventListener("input", () => {
    const value = parseInt(sigDigitsSlider.value, 10);
    sigDigitsValue.textContent = value;
    onNumberFormatChange("significantDigits", value);
  });

  magnitudeSlider.addEventListener("input", () => {
    const value = parseInt(magnitudeSlider.value, 10);
    magnitudeValue.textContent = value;
    onNumberFormatChange("sciNotationMagnitude", value);
  });

  notationStyleE.addEventListener("change", () => {
    if (notationStyleE.checked) onNumberFormatChange("notationStyle", "e");
  });

  notationStyleTimes10.addEventListener("change", () => {
    if (notationStyleTimes10.checked) onNumberFormatChange("notationStyle", "times10");
  });

  document.addEventListener("click", (event) => {
    if (!modeMenuCtrl.isOpen()) return;
    if (modeMenuCtrl.contains(event.target) || modeMenuButton.contains(event.target)) return;
    modeMenuCtrl.close();
  });

  document.addEventListener("click", (event) => {
    if (!settingsMenuCtrl.isOpen()) return;

    if (settingsMenuCtrl.contains(event.target) || settingsMenuButton.contains(event.target)) {
      if (themeSubmenuCtrl.isOpen() && !themeSubmenuCtrl.contains(event.target) && !themeMenuButton.contains(event.target)) {
        themeSubmenuCtrl.close();
      }
      return;
    }

    settingsMenuCtrl.close();
    themeSubmenuCtrl.close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (themeSubmenuCtrl.isOpen()) {
        themeSubmenuCtrl.close();
        themeMenuButton.focus();
      } else if (modeMenuCtrl.isOpen()) {
        modeMenuCtrl.close();
        modeMenuButton.focus();
      } else if (settingsMenuCtrl.isOpen()) {
        settingsMenuCtrl.close();
        settingsMenuButton.focus();
      } else if (numberFormatPanel.classList.contains("open")) {
        numberFormatPanel.classList.remove("open");
        numberFormatPanel.setAttribute("aria-hidden", "true");
        settingsMenuButton.focus();
      }
    }
  });

  document.addEventListener("click", (event) => {
    if (!numberFormatPanel.classList.contains("open")) return;
    if (numberFormatPanel.contains(event.target) || numberFormatButton.contains(event.target)) return;
    numberFormatPanel.classList.remove("open");
    numberFormatPanel.setAttribute("aria-hidden", "true");
  });

  clearHistoryButton.addEventListener("click", async () => {
    historyEntries = await window.CalculatorHistory.clearHistory();
    renderHistory();
  });

  if (popoutButton) {
    popoutButton.addEventListener("click", () => {
      openDetachedWindow();
    });
  }

  expressionInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await commitCalculationFromInput();
    }
  });

  expressionInput.addEventListener("input", () => {
    updateCaretSnapshot();
    settings.set("expressionDraft", expressionInput.value).catch((error) => {
      console.error("Failed to save expression draft", error);
    });
    triggerPreview();
  });

  expressionInput.addEventListener("click", updateCaretSnapshot);
  expressionInput.addEventListener("keyup", updateCaretSnapshot);
  expressionInput.addEventListener("select", updateCaretSnapshot);
  expressionInput.addEventListener("blur", updateCaretSnapshot);

  initializeState().catch((error) => {
    setResultMessage("Error: failed to initialize storage", true);
    console.error(error);
  });
})();
