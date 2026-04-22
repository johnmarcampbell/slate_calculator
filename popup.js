(function () {
  "use strict";

  const HISTORY_LIMIT = 80;
  const PREVIEW_DEBOUNCE_MS = 120;

  let angleMode = "rad";
  let historyEntries = [];
  let previewTimer = null;
  let lastSelectionStart = 0;
  let lastSelectionEnd = 0;
  let hasShownValidResult = false;
  let lastValidResultText = "";
  const isDetachedWindow = new URLSearchParams(window.location.search).get("detached") === "1";

  const expressionInput = document.getElementById("expressionInput");
  const resultText = document.getElementById("resultText");
  const historyList = document.getElementById("historyList");
  const angleModeSelect = document.getElementById("angleMode");
  const clearHistoryButton = document.getElementById("clearHistoryButton");
  const popoutButton = document.getElementById("popoutButton");

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

    const expressionButton = document.createElement("button");
    expressionButton.type = "button";
    expressionButton.className = "history-expression";
    expressionButton.title = "Insert expression at cursor";
    expressionButton.textContent = entry.expression;
    expressionButton.addEventListener("click", () => {
      insertTextAtCaret(entry.expression);
    });

    const resultButton = document.createElement("button");
    resultButton.type = "button";
    resultButton.className = "history-result";
    resultButton.title = "Insert result at cursor";
    resultButton.textContent = "= " + entry.resultText;
    resultButton.addEventListener("click", () => {
      insertTextAtCaret(entry.resultText);
    });

    item.appendChild(expressionButton);
    item.appendChild(resultButton);
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

    const [savedAngleMode, savedHistory] = await Promise.all([
      window.CalculatorHistory.getAngleMode(),
      window.CalculatorHistory.getHistory()
    ]);

    angleMode = savedAngleMode;
    angleModeSelect.value = angleMode;

    historyEntries = savedHistory;
    renderHistory();

    expressionInput.focus();
    expressionInput.setSelectionRange(expressionInput.value.length, expressionInput.value.length);
    updateCaretSnapshot();
  }

  angleModeSelect.addEventListener("change", async () => {
    angleMode = angleModeSelect.value === "deg" ? "deg" : "rad";
    await window.CalculatorHistory.setAngleMode(angleMode);
    triggerPreview();
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
