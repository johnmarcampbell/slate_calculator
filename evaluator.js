(function () {
  "use strict";

  const SAFE_CONSTANTS = {
    pi: Math.PI,
    e: Math.E
  };

  function toRadians(mode, value) {
    return mode === "deg" ? (value * Math.PI) / 180 : value;
  }

  function fromRadians(mode, value) {
    return mode === "deg" ? (value * 180) / Math.PI : value;
  }

  function expectFinite(value, message) {
    if (!Number.isFinite(value)) {
      throw new Error(message);
    }
    return value;
  }

  function normalizeInput(expression) {
    return expression
      .replace(/\u03C0/g, "pi")
      .replace(/\bPI\b/g, "pi")
      .replace(/\bln\b/gi, "ln")
      .replace(/\blog_?10\b/gi, "log10")
      .replace(/\^\^/g, "^");
  }

  function createFunctionMap(mode) {
    return {
      sin: (x) => Math.sin(toRadians(mode, x)),
      cos: (x) => Math.cos(toRadians(mode, x)),
      tan: (x) => Math.tan(toRadians(mode, x)),
      asin: (x) => {
        if (x < -1 || x > 1) {
          throw new Error("asin expects values in [-1, 1]");
        }
        return fromRadians(mode, Math.asin(x));
      },
      acos: (x) => {
        if (x < -1 || x > 1) {
          throw new Error("acos expects values in [-1, 1]");
        }
        return fromRadians(mode, Math.acos(x));
      },
      atan: (x) => fromRadians(mode, Math.atan(x)),
      sqrt: (x) => {
        if (x < 0) {
          throw new Error("sqrt is undefined for negative values");
        }
        return Math.sqrt(x);
      },
      abs: (x) => Math.abs(x),
      ln: (x) => {
        if (x <= 0) {
          throw new Error("ln is only defined for x > 0");
        }
        return Math.log(x);
      },
      log10: (x) => {
        if (x <= 0) {
          throw new Error("log10 is only defined for x > 0");
        }
        return Math.log10(x);
      },
      exp: (x) => Math.exp(x)
    };
  }

  function evaluateAst(node, ctx) {
    if (!node) {
      throw new Error("Could not parse expression");
    }

    switch (node.type) {
      case "Literal":
        return node.value;
      case "Identifier": {
        const name = String(node.name).toLowerCase();
        if (ctx.variables && name in ctx.variables) {
          const variableValue = ctx.variables[name];
          if (!Number.isFinite(variableValue)) {
            throw new Error("Variable " + node.name + " is not finite");
          }
          return variableValue;
        }
        if (name in SAFE_CONSTANTS) {
          return SAFE_CONSTANTS[name];
        }
        throw new Error("Unknown symbol: " + node.name);
      }
      case "UnaryExpression": {
        const arg = evaluateAst(node.argument, ctx);
        if (node.operator === "+") {
          return +arg;
        }
        if (node.operator === "-") {
          return -arg;
        }
        throw new Error("Unsupported unary operator: " + node.operator);
      }
      case "BinaryExpression": {
        const left = evaluateAst(node.left, ctx);
        const right = evaluateAst(node.right, ctx);

        switch (node.operator) {
          case "+":
            return left + right;
          case "-":
            return left - right;
          case "*":
            return left * right;
          case "/":
            if (right === 0) {
              throw new Error("Division by zero");
            }
            return left / right;
          case "%":
            if (right === 0) {
              throw new Error("Modulo by zero");
            }
            return left % right;
          case "^":
          case "**":
            return Math.pow(left, right);
          default:
            throw new Error("Unsupported operator: " + node.operator);
        }
      }
      case "CallExpression": {
        if (node.callee.type !== "Identifier") {
          throw new Error("Only named function calls are supported");
        }
        const fnName = String(node.callee.name).toLowerCase();
        const fn = ctx.functions[fnName];
        if (!fn) {
          throw new Error("Unknown function: " + node.callee.name);
        }
        const args = node.arguments.map((argNode) => evaluateAst(argNode, ctx));
        return fn.apply(null, args);
      }
      default:
        throw new Error("Unsupported expression node: " + node.type);
    }
  }

  if (typeof jsep !== "undefined") {
    jsep.removeBinaryOp("^");
    jsep.addBinaryOp("^", 11, true);
  }

  function evaluateInternal(expression, angleMode, variables) {
    const trimmed = String(expression || "").trim();
    if (!trimmed) {
      return { ok: false, error: "Expression is empty" };
    }

    try {
      const normalized = normalizeInput(trimmed);
      const ast = jsep(normalized);
      const value = evaluateAst(ast, {
        functions: createFunctionMap(angleMode === "deg" ? "deg" : "rad"),
        variables: variables && typeof variables === "object" ? variables : null
      });

      return {
        ok: true,
        value: expectFinite(value, "Result is not finite"),
        normalized
      };
    } catch (error) {
      return {
        ok: false,
        error: error && error.message ? error.message : "Evaluation error"
      };
    }
  }

  function evaluate(expression, angleMode) {
    return evaluateInternal(expression, angleMode, null);
  }

  function evaluateWithVariables(expression, angleMode, variables) {
    return evaluateInternal(expression, angleMode, variables);
  }

  window.CalculatorEvaluator = {
    evaluate,
    evaluateWithVariables
  };
})();
