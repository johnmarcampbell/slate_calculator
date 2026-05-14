(function () {
  "use strict";

  const MIN_RANGE = 1e-6;
  const MAX_ABS_COORD = 1e9;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundLabel(value) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    const absValue = Math.abs(value);
    if (absValue !== 0 && (absValue >= 1e5 || absValue < 1e-4)) {
      return value.toExponential(2);
    }
    return Number(value.toPrecision(6)).toString();
  }

  function chooseTickStep(range) {
    if (!Number.isFinite(range) || range <= 0) {
      return 1;
    }

    const rough = range / 7;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const fraction = rough / power;

    if (fraction <= 1) {
      return 1 * power;
    }
    if (fraction <= 2) {
      return 2 * power;
    }
    if (fraction <= 5) {
      return 5 * power;
    }
    return 10 * power;
  }

  function create(canvas, options) {
    const ctx = canvas.getContext("2d");
    const evaluateAtX = options.evaluateAtX;

    function getThemeColor(variableName, fallback) {
      if (typeof document === "undefined" || !document.documentElement || typeof window.getComputedStyle !== "function") {
        return fallback;
      }

      const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName);
      const trimmed = String(value || "").trim();
      return trimmed || fallback;
    }

    const state = {
      expression: "",
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10,
      yAuto: true,
      samples: [],
      sampledSeries: [],
      hoverPoint: null,
      status: "Enter f(x) and draw to begin."
    };

    function getCanvasSize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(10, Math.round(rect.width * dpr));
      const height = Math.max(10, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      return { width, height, dpr };
    }

    function worldToScreenX(x, width) {
      return ((x - state.xMin) / (state.xMax - state.xMin)) * width;
    }

    function worldToScreenY(y, height) {
      return ((state.yMax - y) / (state.yMax - state.yMin)) * height;
    }

    function screenToWorld(px, py, width, height) {
      const x = state.xMin + (px / width) * (state.xMax - state.xMin);
      const y = state.yMax - (py / height) * (state.yMax - state.yMin);
      return { x, y };
    }

    function drawGrid(width, height, dpr) {
      const xRange = state.xMax - state.xMin;
      const yRange = state.yMax - state.yMin;
      const xStep = chooseTickStep(xRange);
      const yStep = chooseTickStep(yRange);
      const gridColor = getThemeColor("--graph-grid-color", "rgba(31, 31, 31, 0.12)");
      const axisColor = getThemeColor("--graph-axis-color", "rgba(31, 31, 31, 0.45)");
      const labelColor = getThemeColor("--graph-label-color", "rgba(31, 31, 31, 0.6)");
      const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
      const labelFontSize = Math.round(12 * scale);
      const pad = 4 * scale;
      const bottomPad = 6 * scale;
      const topBaseline = 12 * scale;
      const lowerBaseline = 18 * scale;
      const rightLabelOffset = 58 * scale;

      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = gridColor;
      ctx.fillStyle = labelColor;
      ctx.font = labelFontSize + "px Courier New";

      const xStart = Math.ceil(state.xMin / xStep) * xStep;
      for (let x = xStart; x <= state.xMax; x += xStep) {
        const px = worldToScreenX(x, width);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      }

      const yStart = Math.ceil(state.yMin / yStep) * yStep;
      for (let y = yStart; y <= state.yMax; y += yStep) {
        const py = worldToScreenY(y, height);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();
      }

      const xAxisPy = worldToScreenY(0, height);
      const yAxisPx = worldToScreenX(0, width);

      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 1.35;

      if (xAxisPy >= 0 && xAxisPy <= height) {
        ctx.beginPath();
        ctx.moveTo(0, xAxisPy);
        ctx.lineTo(width, xAxisPy);
        ctx.stroke();
      }

      if (yAxisPx >= 0 && yAxisPx <= width) {
        ctx.beginPath();
        ctx.moveTo(yAxisPx, 0);
        ctx.lineTo(yAxisPx, height);
        ctx.stroke();
      }

      ctx.fillText(roundLabel(state.xMin), pad, height - bottomPad);
      ctx.fillText(roundLabel(state.xMax), width - rightLabelOffset, height - bottomPad);
      ctx.fillText(roundLabel(state.yMax), pad, topBaseline);
      ctx.fillText(roundLabel(state.yMin), pad, height - lowerBaseline);
      ctx.restore();
    }

    function samplePoints(width) {
      const samples = [];
      const pointsCount = clamp(Math.round(width * 1.4), 280, 1400);
      const xRange = state.xMax - state.xMin;

      for (let i = 0; i < pointsCount; i += 1) {
        const t = pointsCount <= 1 ? 0 : i / (pointsCount - 1);
        const x = state.xMin + t * xRange;
        const result = evaluateAtX(state.expression, x);
        if (result.ok && Number.isFinite(result.value)) {
          samples.push({ x, y: result.value });
        } else {
          samples.push({ x, y: null });
        }
      }

      return samples;
    }

    function autoScaleY(samples) {
      let minY = Infinity;
      let maxY = -Infinity;

      samples.forEach((sample) => {
        if (sample.y === null) {
          return;
        }
        if (sample.y < minY) {
          minY = sample.y;
        }
        if (sample.y > maxY) {
          maxY = sample.y;
        }
      });

      if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
        state.yMin = -10;
        state.yMax = 10;
        return false;
      }

      if (Math.abs(maxY - minY) < MIN_RANGE) {
        const center = (minY + maxY) / 2;
        state.yMin = center - 1;
        state.yMax = center + 1;
        return true;
      }

      const padding = (maxY - minY) * 0.1;
      state.yMin = minY - padding;
      state.yMax = maxY + padding;
      return true;
    }

    function plotSamples(samples, width, height) {
      ctx.save();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = "#b84a2d";

      let hasPlotted = false;
      let previous = null;

      ctx.beginPath();
      for (let i = 0; i < samples.length; i += 1) {
        const point = samples[i];
        if (point.y === null) {
          previous = null;
          continue;
        }

        const px = worldToScreenX(point.x, width);
        const py = worldToScreenY(point.y, height);
        point.px = px;
        point.py = py;

        if (!Number.isFinite(py) || py < -height * 4 || py > height * 4) {
          previous = null;
          continue;
        }

        if (!previous) {
          ctx.moveTo(px, py);
          previous = point;
          hasPlotted = true;
          continue;
        }

        if (Math.abs(py - previous.py) > height * 2) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }

        previous = point;
      }

      if (hasPlotted) {
        ctx.stroke();
      }

      ctx.restore();
      return hasPlotted;
    }

    function drawHover(point, width, height) {
      if (!point) {
        return;
      }

      const px = point.px;
      const py = point.py;
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        return;
      }

      ctx.save();
      ctx.strokeStyle = "rgba(14, 127, 91, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();

      ctx.fillStyle = "#0e7f5b";
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function renderFromSampledSeries() {
      const { width, height, dpr } = getCanvasSize();
      ctx.clearRect(0, 0, width, height);
      drawGrid(width, height, dpr);

      const hasPlot = plotSamples(state.sampledSeries, width, height);
      if (state.hoverPoint) {
        const nearest = findNearestByPixel(state.hoverPoint.px);
        state.hoverPoint = nearest;
        drawHover(nearest, width, height);
      }

      return hasPlot;
    }

    function draw() {
      const { width, height, dpr } = getCanvasSize();

      if (!Number.isFinite(state.xMin) || !Number.isFinite(state.xMax) || state.xMax - state.xMin < MIN_RANGE) {
        state.status = "Invalid x range";
        return {
          ok: false,
          error: state.status
        };
      }

      ctx.clearRect(0, 0, width, height);
      drawGrid(width, height, dpr);

      const trimmedExpression = String(state.expression || "").trim();
      if (!trimmedExpression) {
        state.samples = [];
        state.sampledSeries = [];
        state.status = "Enter f(x) and draw to begin.";
        return {
          ok: true,
          status: state.status,
          hasPlot: false
        };
      }

      const sampled = samplePoints(width);
      if (state.yAuto) {
        autoScaleY(sampled);
      }

      state.samples = sampled.filter((sample) => sample.y !== null);
      state.sampledSeries = sampled;
      const hasPlot = renderFromSampledSeries();

      if (hasPlot) {
        state.status = "Plot updated";
      } else {
        state.status = "No finite points in this view";
      }
      return {
        ok: true,
        status: state.status,
        hasPlot,
        yMin: state.yMin,
        yMax: state.yMax
      };
    }

    function findNearestByPixel(px) {
      if (!state.samples.length) {
        return null;
      }

      let best = null;
      let bestDist = Infinity;
      state.samples.forEach((sample) => {
        if (!Number.isFinite(sample.px) || !Number.isFinite(sample.py)) {
          return;
        }
        const distance = Math.abs(sample.px - px);
        if (distance < bestDist) {
          bestDist = distance;
          best = sample;
        }
      });

      return best;
    }

    function setHoverPixel(px) {
      if (!Number.isFinite(px)) {
        state.hoverPoint = null;
        renderFromSampledSeries();
        return null;
      }

      const nearest = findNearestByPixel(px);
      state.hoverPoint = nearest;
      renderFromSampledSeries();
      return nearest;
    }

    function clearHover() {
      state.hoverPoint = null;
      renderFromSampledSeries();
    }

    function zoomAtPixel(scale, px, py) {
      const { width, height } = getCanvasSize();
      const safeScale = clamp(scale, 0.2, 5);
      const world = screenToWorld(px, py, width, height);

      const xRange = state.xMax - state.xMin;
      const yRange = state.yMax - state.yMin;

      const nextXRange = clamp(xRange * safeScale, MIN_RANGE, MAX_ABS_COORD);
      const nextYRange = clamp(yRange * safeScale, MIN_RANGE, MAX_ABS_COORD);

      const xRatio = (world.x - state.xMin) / xRange;
      const yRatio = (state.yMax - world.y) / yRange;

      state.xMin = world.x - xRatio * nextXRange;
      state.xMax = state.xMin + nextXRange;

      if (!state.yAuto) {
        state.yMax = world.y + yRatio * nextYRange;
        state.yMin = state.yMax - nextYRange;
      }
    }

    function panByPixels(dx, dy) {
      const { width, height } = getCanvasSize();
      const xPerPx = (state.xMax - state.xMin) / width;
      const yPerPx = (state.yMax - state.yMin) / height;

      const shiftX = dx * xPerPx;
      state.xMin -= shiftX;
      state.xMax -= shiftX;

      if (!state.yAuto) {
        const shiftY = dy * yPerPx;
        state.yMin += shiftY;
        state.yMax += shiftY;
      }
    }

    function setView(view) {
      state.xMin = Number(view.xMin);
      state.xMax = Number(view.xMax);
      state.yMin = Number(view.yMin);
      state.yMax = Number(view.yMax);
      state.yAuto = Boolean(view.yAuto);
    }

    function getView() {
      return {
        xMin: state.xMin,
        xMax: state.xMax,
        yMin: state.yMin,
        yMax: state.yMax,
        yAuto: state.yAuto
      };
    }

    function setExpression(expression) {
      state.expression = String(expression || "");
    }

    function getWorldForPixel(px, py) {
      const { width, height } = getCanvasSize();
      return screenToWorld(px, py, width, height);
    }

    return {
      setView,
      getView,
      setExpression,
      draw,
      setHoverPixel,
      clearHover,
      zoomAtPixel,
      panByPixels,
      getWorldForPixel
    };
  }

  window.CalculatorGrapher = {
    create
  };
})();
