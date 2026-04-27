(function () {
  "use strict";

  const HISTORY_LIMIT = 80;
  const PREVIEW_DEBOUNCE_MS = 120;
  const GRAPH_PREVIEW_DEBOUNCE_MS = 140;
  const DEFAULT_GRAPH_SETTINGS = {
    expression: "",
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    yAuto: true
  };

  let angleMode = "rad";
  let historyEntries = [];
  let activeView = "calculator";
  let graphSettings = Object.assign({}, DEFAULT_GRAPH_SETTINGS);
  let previewTimer = null;
  let graphPreviewTimer = null;
  let lastSelectionStart = 0;
  let lastSelectionEnd = 0;
  let hasShownValidResult = false;
  let lastValidResultText = "";
  let grapher = null;
  let dragState = null;
  const isDetachedWindow = new URLSearchParams(window.location.search).get("detached") === "1";

  const expressionInput = document.getElementById("expressionInput");
  const resultText = document.getElementById("resultText");
  const historyList = document.getElementById("historyList");
  const clearHistoryButton = document.getElementById("clearHistoryButton");
  const popoutButton = document.getElementById("popoutButton");
  const modeMenuButton = document.getElementById("modeMenuButton");
  const modeMenu = document.getElementById("modeMenu");
  const calculatorModeButton = document.getElementById("calculatorModeButton");
  const graphModeButton = document.getElementById("graphModeButton");
  const radiansAngleButton = document.getElementById("radiansAngleButton");
  const degreesAngleButton = document.getElementById("degreesAngleButton");
  const calculatorView = document.getElementById("calculatorView");
  const graphView = document.getElementById("graphView");

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
    if (!Number.isFinite(value)) {
      return "Error: Result is not finite";
    }

    if (Object.is(value, -0)) {
      return "0";
    }

    const absValue = Math.abs(value);
    if (absValue !== 0 && (absValue >= 1e10 || absValue < 1e-6)) {
      return value.toExponential(9);
    }

    return Number(value.toPrecision(12)).toString();
  }

  function setResultMessage(message, isError) {
    resultText.textContent = message;
    resultText.classList.toggle("error", Boolean(isError));
    resultText.classList.toggle("success", !isError);
    expressionInput.classList.toggle("error", Boolean(isError));
  }

  function setGraphStatus(message, isError) {
    graphStatusText.textContent = message;
    graphStatusText.classList.toggle("error", Boolean(isError));
  }

  function sanitizeGraphSettings(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    const safe = {
      expression: String(source.expression || ""),
      xMin: Number.isFinite(Number(source.xMin)) ? Number(source.xMin) : DEFAULT_GRAPH_SETTINGS.xMin,
      xMax: Number.isFinite(Number(source.xMax)) ? Number(source.xMax) : DEFAULT_GRAPH_SETTINGS.xMax,
      yMin: Number.isFinite(Number(source.yMin)) ? Number(source.yMin) : DEFAULT_GRAPH_SETTINGS.yMin,
      yMax: Number.isFinite(Number(source.yMax)) ? Number(source.yMax) : DEFAULT_GRAPH_SETTINGS.yMax,
      yAuto: source.yAuto !== false
    };

    if (safe.xMax <= safe.xMin) {
      safe.xMin = DEFAULT_GRAPH_SETTINGS.xMin;
      safe.xMax = DEFAULT_GRAPH_SETTINGS.xMax;
    }

    if (safe.yMax <= safe.yMin) {
      safe.yMin = DEFAULT_GRAPH_SETTINGS.yMin;
      safe.yMax = DEFAULT_GRAPH_SETTINGS.yMax;
    }

    return safe;
  }

  function updateGraphInputsFromState() {
    graphExpressionInput.value = graphSettings.expression;
    xMinInput.value = graphSettings.xMin;
    xMaxInput.value = graphSettings.xMax;
    yMinInput.value = graphSettings.yMin;
    yMaxInput.value = graphSettings.yMax;
    yAutoCheckbox.checked = graphSettings.yAuto;
    yMinInput.disabled = graphSettings.yAuto;
    yMaxInput.disabled = graphSettings.yAuto;
  }

  function readGraphSettingsFromInputs() {
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
      next.yMin = graphSettings.yMin;
      next.yMax = graphSettings.yMax;
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

  async function persistGraphSettings() {
    await window.CalculatorHistory.setGraphSettings(graphSettings);
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

    graphSettings = parsed.value;
    grapher.setExpression(graphSettings.expression);
    grapher.setView(graphSettings);

    const drawResult = grapher.draw();
    if (!drawResult.ok) {
      if (showErrors) {
        setGraphStatus("Error: " + drawResult.error, true);
      }
      return;
    }

    if (graphSettings.yAuto) {
      const nextView = grapher.getView();
      graphSettings.yMin = nextView.yMin;
      graphSettings.yMax = nextView.yMax;
      yMinInput.value = graphSettings.yMin;
      yMaxInput.value = graphSettings.yMax;
    }

    setGraphStatus(drawResult.status, false);
    await persistGraphSettings();
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

  function closeModeMenu() {
    modeMenu.classList.remove("open");
    modeMenuButton.setAttribute("aria-expanded", "false");
  }

  function toggleModeMenu(forceOpen) {
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !modeMenu.classList.contains("open");
    modeMenu.classList.toggle("open", shouldOpen);
    modeMenuButton.setAttribute("aria-expanded", String(shouldOpen));
  }

  function setActiveView(viewName) {
    activeView = viewName === "graph" ? "graph" : "calculator";
    const graphActive = activeView === "graph";

    calculatorView.classList.toggle("hidden", graphActive);
    graphView.classList.toggle("hidden", !graphActive);
    calculatorModeButton.classList.toggle("active", !graphActive);
    graphModeButton.classList.toggle("active", graphActive);
    calculatorModeButton.setAttribute("aria-checked", String(!graphActive));
    graphModeButton.setAttribute("aria-checked", String(graphActive));
    closeModeMenu();

    if (graphActive) {
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
  }

  async function setAngleMode(nextMode, shouldPersist) {
    angleMode = nextMode === "deg" ? "deg" : "rad";
    const degreesActive = angleMode === "deg";
    radiansAngleButton.classList.toggle("active", !degreesActive);
    degreesAngleButton.classList.toggle("active", degreesActive);
    radiansAngleButton.setAttribute("aria-checked", String(!degreesActive));
    degreesAngleButton.setAttribute("aria-checked", String(degreesActive));
    if (shouldPersist !== false) {
      await window.CalculatorHistory.setAngleMode(angleMode);
    }
    triggerPreview();
    if (activeView === "graph") {
      queueGraphRedraw(false);
    }
  }

  function setupGraphInteractions() {
    grapher = window.CalculatorGrapher.create(graphCanvas, {
      evaluateAtX: (expression, x) => {
        return window.CalculatorEvaluator.evaluateWithVariables(expression, angleMode, { x });
      }
    });

    graphCanvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const { px, py } = getCanvasRelativePoint(event);
      const scale = event.deltaY < 0 ? 0.9 : 1.1;
      grapher.zoomAtPixel(scale, px, py);
      const nextView = grapher.getView();
      graphSettings.xMin = nextView.xMin;
      graphSettings.xMax = nextView.xMax;
      if (!graphSettings.yAuto) {
        graphSettings.yMin = nextView.yMin;
        graphSettings.yMax = nextView.yMax;
      }
      updateGraphInputsFromState();
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
        graphSettings.xMin = nextView.xMin;
        graphSettings.xMax = nextView.xMax;
        if (!graphSettings.yAuto) {
          graphSettings.yMin = nextView.yMin;
          graphSettings.yMax = nextView.yMax;
        }
        updateGraphInputsFromState();
        queueGraphRedraw(false);
        return;
      }

      const { px } = getCanvasRelativePoint(event);
      const nearest = grapher.setHoverPixel(px);
      updateCoordsMessage(nearest);
    });

    graphCanvas.addEventListener("pointerup", async (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      graphCanvas.releasePointerCapture(event.pointerId);
      dragState = null;
      await persistGraphSettings();
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
      graphSettings = Object.assign({}, DEFAULT_GRAPH_SETTINGS, {
        expression: graphExpressionInput.value.trim()
      });
      updateGraphInputsFromState();
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
    const evaluation = window.CalculatorEvaluator.evaluate(expression, angleMode);

    if (!evaluation.ok) {
      if (showErrors) {
        setResultMessage("Error: " + evaluation.error, true);
      } else {
        if (hasShownValidResult) {
          setResultMessage(lastValidResultText, false);
        } else {
          setResultMessage("", false);
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
      resultText: formatted,
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
        setResultMessage("Type an expression to begin", false);
        expressionInput.classList.remove("error");
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

    expressionInput.value = "";
    hasShownValidResult = false;
    lastValidResultText = "";
    setResultMessage("Type an expression to begin", false);
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
      insertTextAtCaret(entry.resultText);
    });
    resultLine.appendChild(resultButton);
    resultLine.appendChild(createCopyButton(entry.resultText));

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

    const [savedAngleMode, savedHistory, savedGraphSettings] = await Promise.all([
      window.CalculatorHistory.getAngleMode(),
      window.CalculatorHistory.getHistory(),
      window.CalculatorHistory.getGraphSettings()
    ]);

    await setAngleMode(savedAngleMode, false);

    historyEntries = savedHistory;
    renderHistory();

    graphSettings = sanitizeGraphSettings(savedGraphSettings || DEFAULT_GRAPH_SETTINGS);
    updateGraphInputsFromState();
    setupGraphInteractions();
    await redrawGraph(false);

    expressionInput.focus();
    expressionInput.setSelectionRange(expressionInput.value.length, expressionInput.value.length);
    updateCaretSnapshot();
  }

  modeMenuButton.addEventListener("click", () => {
    toggleModeMenu();
  });

  calculatorModeButton.addEventListener("click", () => {
    setActiveView("calculator");
  });

  graphModeButton.addEventListener("click", () => {
    setActiveView("graph");
  });

  radiansAngleButton.addEventListener("click", async () => {
    await setAngleMode("rad");
    closeModeMenu();
  });

  degreesAngleButton.addEventListener("click", async () => {
    await setAngleMode("deg");
    closeModeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!modeMenu.classList.contains("open")) {
      return;
    }

    if (modeMenu.contains(event.target) || modeMenuButton.contains(event.target)) {
      return;
    }

    closeModeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modeMenu.classList.contains("open")) {
      closeModeMenu();
      modeMenuButton.focus();
    }
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
