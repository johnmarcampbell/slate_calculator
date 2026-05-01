const path = require("path");

const { createMockCanvas } = require("./helpers/mockCanvas");

function loadGrapher() {
  jest.resetModules();
  delete window.CalculatorGrapher;
  require(path.join(__dirname, "..", "grapher.js"));
  return window.CalculatorGrapher;
}

function createGraph(evaluateAtX, width, height) {
  const { canvas } = createMockCanvas(width || 300, height || 150);
  const grapher = loadGrapher();
  const graph = grapher.create(canvas, { evaluateAtX });
  return { graph, canvas };
}

describe("CalculatorGrapher", () => {
  test("draw returns idle state for empty expression", () => {
    const { graph } = createGraph(() => ({ ok: true, value: 0 }));

    const result = graph.draw();

    expect(result).toEqual({
      ok: true,
      status: "Enter f(x) and draw to begin.",
      hasPlot: false
    });
  });

  test("draw returns error for invalid x range", () => {
    const { graph } = createGraph(() => ({ ok: true, value: 0 }));
    graph.setView({ xMin: 1, xMax: 1, yMin: -1, yMax: 1, yAuto: false });

    const result = graph.draw();

    expect(result).toEqual({ ok: false, error: "Invalid x range" });
  });

  test("draw plots finite samples", () => {
    const { graph } = createGraph((expr, x) => ({ ok: true, value: x * x }));
    graph.setExpression("x^2");

    const result = graph.draw();

    expect(result.ok).toBe(true);
    expect(result.hasPlot).toBe(true);
    expect(result.status).toBe("Plot updated");
  });

  test("draw reports no finite points when evaluator fails", () => {
    const { graph } = createGraph(() => ({ ok: false, error: "bad" }));
    graph.setExpression("bad(x)");

    const result = graph.draw();

    expect(result.ok).toBe(true);
    expect(result.hasPlot).toBe(false);
    expect(result.status).toBe("No finite points in this view");
  });

  test("y auto scales around sampled data", () => {
    const { graph } = createGraph((expr, x) => ({ ok: true, value: 2 * x }));
    graph.setExpression("2*x");
    graph.setView({ xMin: -10, xMax: 10, yMin: -1, yMax: 1, yAuto: true });

    const result = graph.draw();

    expect(result.ok).toBe(true);
    expect(result.yMin).toBeCloseTo(-24, 1);
    expect(result.yMax).toBeCloseTo(24, 1);
  });

  test("setView and getView roundtrip", () => {
    const { graph } = createGraph(() => ({ ok: true, value: 0 }));

    graph.setView({ xMin: -2, xMax: 8, yMin: -3, yMax: 3, yAuto: false });

    expect(graph.getView()).toEqual({ xMin: -2, xMax: 8, yMin: -3, yMax: 3, yAuto: false });
  });

  test("zoomAtPixel shrinks range for scale < 1 in manual y mode", () => {
    const { graph } = createGraph(() => ({ ok: true, value: 0 }), 300, 150);
    graph.setView({ xMin: -10, xMax: 10, yMin: -6, yMax: 6, yAuto: false });

    graph.zoomAtPixel(0.5, 150, 75);

    const view = graph.getView();
    expect(view.xMax - view.xMin).toBeCloseTo(10, 6);
    expect(view.yMax - view.yMin).toBeCloseTo(6, 6);
  });

  test("panByPixels shifts only x while yAuto is true", () => {
    const { graph } = createGraph(() => ({ ok: true, value: 0 }), 200, 100);
    graph.setView({ xMin: -10, xMax: 10, yMin: -5, yMax: 5, yAuto: true });

    graph.panByPixels(20, 20);

    const view = graph.getView();
    expect(view.xMin).toBeCloseTo(-12, 6);
    expect(view.xMax).toBeCloseTo(8, 6);
    expect(view.yMin).toBeCloseTo(-5, 6);
    expect(view.yMax).toBeCloseTo(5, 6);
  });

  test("getWorldForPixel maps center pixel to near origin for default view", () => {
    const { graph } = createGraph(() => ({ ok: true, value: 0 }), 300, 150);

    const point = graph.getWorldForPixel(150, 75);

    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  test("setHoverPixel returns nearest sampled point and clearHover is safe", () => {
    const { graph } = createGraph((expr, x) => ({ ok: true, value: x }), 300, 150);
    graph.setExpression("x");
    graph.draw();

    const hovered = graph.setHoverPixel(150);
    expect(hovered).not.toBeNull();
    expect(typeof hovered.x).toBe("number");
    expect(typeof hovered.y).toBe("number");

    expect(() => graph.clearHover()).not.toThrow();
  });
});
