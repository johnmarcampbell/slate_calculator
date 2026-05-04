const path = require("path");

function loadEvaluator() {
  jest.resetModules();
  delete window.CalculatorEvaluator;
  require(path.join(__dirname, "..", "evaluator.js"));
  return window.CalculatorEvaluator;
}

function evaluateWithMockAst(ast, expression) {
  const evaluator = loadEvaluator();
  const originalJsep = global.jsep;
  global.jsep = jest.fn(() => ast);

  try {
    return evaluator.evaluate(expression || "x", "rad");
  } finally {
    global.jsep = originalJsep;
  }
}

describe("CalculatorEvaluator.evaluate", () => {
  test("evaluates arithmetic with precedence", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("2+3*4", "rad")).toMatchObject({ ok: true, value: 14 });
    expect(evaluator.evaluate("(2+3)*4", "rad")).toMatchObject({ ok: true, value: 20 });
  });

  test("supports exponent operators ^ and **", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("2^3", "rad")).toMatchObject({ ok: true, value: 8 });
    expect(evaluator.evaluate("2**3", "rad")).toMatchObject({ ok: true, value: 8 });
  });

  test("normalizes pi symbol and aliases", () => {
    const evaluator = loadEvaluator();

    const fromUnicode = evaluator.evaluate("2*π", "rad");
    const fromUpper = evaluator.evaluate("2*PI", "rad");
    const logAlias = evaluator.evaluate("log_10(100)", "rad");

    expect(fromUnicode).toMatchObject({ ok: true, value: 2 * Math.PI, normalized: "2*pi" });
    expect(fromUpper).toMatchObject({ ok: true, value: 2 * Math.PI, normalized: "2*pi" });
    expect(logAlias).toMatchObject({ ok: true, value: 2, normalized: "log10(100)" });
  });

  test("strips commas and dollar signs before evaluation", () => {
    const evaluator = loadEvaluator();

    const result = evaluator.evaluate("$1,200 + 30", "rad");

    expect(result).toMatchObject({ ok: true, value: 1230, normalized: "1200 + 30" });
  });

  test("ignores inline comments starting with #", () => {
    const evaluator = loadEvaluator();

    const result = evaluator.evaluate("2 + 3 # this should be ignored", "rad");

    expect(result).toMatchObject({ ok: true, value: 5, normalized: "2 + 3 " });
  });

  test("ignores comment lines and keeps following expression", () => {
    const evaluator = loadEvaluator();

    const result = evaluator.evaluate("# first line comment\n4*5", "rad");

    expect(result.ok).toBe(true);
    expect(result.value).toBe(20);
  });

  test("returns empty expression when input only has comments", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("# only comment", "rad")).toEqual({
      ok: false,
      error: "Expression is empty"
    });
  });

  test("handles trig in radians", () => {
    const evaluator = loadEvaluator();

    const result = evaluator.evaluate("sin(pi/2)", "rad");
    expect(result.ok).toBe(true);
    expect(result.value).toBeCloseTo(1, 10);
  });

  test("handles trig in degrees", () => {
    const evaluator = loadEvaluator();

    const result = evaluator.evaluate("sin(90)", "deg");
    expect(result.ok).toBe(true);
    expect(result.value).toBeCloseTo(1, 10);
  });

  test("covers additional trig functions and inverse trig in degrees", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("cos(60)", "deg")).toMatchObject({ ok: true });
    expect(evaluator.evaluate("tan(45)", "deg")).toMatchObject({ ok: true });
    expect(evaluator.evaluate("atan(1)", "deg")).toMatchObject({ ok: true, value: 45 });

    const asinDeg = evaluator.evaluate("asin(0.5)", "deg");
    const acosDeg = evaluator.evaluate("acos(0.5)", "deg");

    expect(asinDeg.ok).toBe(true);
    expect(asinDeg.value).toBeCloseTo(30, 10);
    expect(acosDeg.ok).toBe(true);
    expect(acosDeg.value).toBeCloseTo(60, 10);
  });

  test("covers inverse trig in radians without conversion", () => {
    const evaluator = loadEvaluator();

    const atanRad = evaluator.evaluate("atan(1)", "rad");
    expect(atanRad.ok).toBe(true);
    expect(atanRad.value).toBeCloseTo(Math.PI / 4, 10);
  });

  test("covers arithmetic and utility success branches", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("7-4", "rad")).toMatchObject({ ok: true, value: 3 });
    expect(evaluator.evaluate("7%4", "rad")).toMatchObject({ ok: true, value: 3 });
    expect(evaluator.evaluate("+5", "rad")).toMatchObject({ ok: true, value: 5 });
    expect(evaluator.evaluate("sqrt(9)", "rad")).toMatchObject({ ok: true, value: 3 });
    expect(evaluator.evaluate("ln(e)", "rad")).toMatchObject({ ok: true, value: 1 });
    expect(evaluator.evaluate("abs(-8)", "rad")).toMatchObject({ ok: true, value: 8 });
  });

  test("returns error for empty expression", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("   ", "rad")).toEqual({ ok: false, error: "Expression is empty" });
  });

  test("returns parser error for malformed expression", () => {
    const evaluator = loadEvaluator();

    const result = evaluator.evaluate("2+", "rad");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Expected expression|Unexpected end/i);
  });

  test("returns domain errors for sqrt/ln/log10", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("sqrt(-1)", "rad")).toEqual({
      ok: false,
      error: "sqrt is undefined for negative values"
    });
    expect(evaluator.evaluate("ln(0)", "rad")).toEqual({
      ok: false,
      error: "ln is only defined for x > 0"
    });
    expect(evaluator.evaluate("log10(-5)", "rad")).toEqual({
      ok: false,
      error: "log10 is only defined for x > 0"
    });
  });

  test("returns domain errors for asin/acos out of range", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("asin(2)", "rad")).toEqual({ ok: false, error: "asin expects values in [-1, 1]" });
    expect(evaluator.evaluate("acos(2)", "rad")).toEqual({ ok: false, error: "acos expects values in [-1, 1]" });
  });

  test("returns errors for division and modulo by zero", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("1/0", "rad")).toEqual({ ok: false, error: "Division by zero" });
    expect(evaluator.evaluate("5%0", "rad")).toEqual({ ok: false, error: "Modulo by zero" });
  });

  test("returns unknown symbol and unknown function errors", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("z + 1", "rad")).toEqual({ ok: false, error: "Unknown symbol: z" });
    expect(evaluator.evaluate("foo(1)", "rad")).toEqual({ ok: false, error: "Unknown function: foo" });
  });

  test("returns not finite error on overflow result", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluate("exp(1000)", "rad")).toEqual({ ok: false, error: "Result is not finite" });
  });

  test("returns error when jsep is unavailable", () => {
    jest.resetModules();
    delete window.CalculatorEvaluator;

    const originalJsep = global.jsep;
    delete global.jsep;

    try {
      require(path.join(__dirname, "..", "evaluator.js"));
      const result = window.CalculatorEvaluator.evaluate("1+1", "rad");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/jsep is not defined/i);
    } finally {
      global.jsep = originalJsep;
    }
  });

  test("uses generic evaluation error fallback for non-Error throws", () => {
    const evaluator = loadEvaluator();
    const originalJsep = global.jsep;
    global.jsep = jest.fn(() => {
      throw null;
    });

    try {
      expect(evaluator.evaluate("1+1", "rad")).toEqual({ ok: false, error: "Evaluation error" });
    } finally {
      global.jsep = originalJsep;
    }
  });

  test("returns error for null AST", () => {
    const result = evaluateWithMockAst(null);
    expect(result).toEqual({ ok: false, error: "Could not parse expression" });
  });

  test("returns error for unsupported unary operator", () => {
    const result = evaluateWithMockAst({
      type: "UnaryExpression",
      operator: "!",
      argument: { type: "Literal", value: 1 }
    });

    expect(result).toEqual({ ok: false, error: "Unsupported unary operator: !" });
  });

  test("returns error for unsupported binary operator", () => {
    const result = evaluateWithMockAst({
      type: "BinaryExpression",
      operator: "//",
      left: { type: "Literal", value: 1 },
      right: { type: "Literal", value: 2 }
    });

    expect(result).toEqual({ ok: false, error: "Unsupported operator: //" });
  });

  test("returns error for non-identifier function call", () => {
    const result = evaluateWithMockAst({
      type: "CallExpression",
      callee: { type: "MemberExpression" },
      arguments: []
    });

    expect(result).toEqual({ ok: false, error: "Only named function calls are supported" });
  });

  test("returns error for unsupported AST node type", () => {
    const result = evaluateWithMockAst({
      type: "ConditionalExpression"
    });

    expect(result).toEqual({ ok: false, error: "Unsupported expression node: ConditionalExpression" });
  });
});

describe("CalculatorEvaluator.evaluateWithVariables", () => {
  test("evaluates expression with provided variables", () => {
    const evaluator = loadEvaluator();

    const result = evaluator.evaluateWithVariables("x^2 + y", "rad", { x: 3, y: 4 });
    expect(result).toMatchObject({ ok: true, value: 13 });
  });

  test("handles variables with trig and degree mode", () => {
    const evaluator = loadEvaluator();

    const result = evaluator.evaluateWithVariables("sin(x)", "deg", { x: 30 });
    expect(result.ok).toBe(true);
    expect(result.value).toBeCloseTo(0.5, 10);
  });

  test("errors on undefined variable", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluateWithVariables("x + y", "rad", { x: 1 })).toEqual({
      ok: false,
      error: "Unknown symbol: y"
    });
  });

  test("errors on non-finite variable", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluateWithVariables("x + 1", "rad", { x: Infinity })).toEqual({
      ok: false,
      error: "Variable x is not finite"
    });
  });

  test("ignores non-object variables payload", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluateWithVariables("x + 1", "rad", "not-an-object")).toEqual({
      ok: false,
      error: "Unknown symbol: x"
    });
  });

  test("treats undefined expression as empty", () => {
    const evaluator = loadEvaluator();

    expect(evaluator.evaluateWithVariables(undefined, "rad", { x: 1 })).toEqual({
      ok: false,
      error: "Expression is empty"
    });
  });
});
