const path = require("path");

function loadFormatter() {
  jest.resetModules();
  delete window.CalculatorFormatter;
  require(path.join(__dirname, "..", "formatter.js"));
  return window.CalculatorFormatter;
}

describe("CalculatorFormatter.formatResult", () => {
  const defaultSettings = {
    significantDigits: 12,
    sciNotationMagnitude: 6,
    notationStyle: "e"
  };

  test("returns error message for non-finite values", () => {
    const formatter = loadFormatter();

    expect(formatter.formatResult(Infinity, defaultSettings)).toBe("Error: Result is not finite");
    expect(formatter.formatResult(-Infinity, defaultSettings)).toBe("Error: Result is not finite");
    expect(formatter.formatResult(NaN, defaultSettings)).toBe("Error: Result is not finite");
  });

  test("formats negative zero as '0'", () => {
    const formatter = loadFormatter();

    expect(formatter.formatResult(-0, defaultSettings)).toBe("0");
  });

  test("formats zero as '0' regardless of settings", () => {
    const formatter = loadFormatter();

    expect(formatter.formatResult(0, defaultSettings)).toBe("0");
    expect(formatter.formatResult(0, { ...defaultSettings, sciNotationMagnitude: 1 })).toBe("0");
  });

  test("uses significant digits for normal range numbers", () => {
    const formatter = loadFormatter();

    const settings = { ...defaultSettings, significantDigits: 3 };
    expect(formatter.formatResult(3.14159265359, settings)).toBe("3.14");
    expect(formatter.formatResult(123.456789, settings)).toBe("123");
    expect(formatter.formatResult(0.00123456, settings)).toBe("0.00123");
  });

  test("uses scientific notation for large numbers beyond magnitude threshold", () => {
    const formatter = loadFormatter();

    const settings = { ...defaultSettings, sciNotationMagnitude: 6 };
    // With 12 significant digits, toExponential gives 11 decimal places
    expect(formatter.formatResult(1234567, settings)).toBe("1.23456700000e+6");
    expect(formatter.formatResult(9876543210, settings)).toBe("9.87654321000e+9");
  });

  test("uses scientific notation for small numbers beyond magnitude threshold", () => {
    const formatter = loadFormatter();

    const settings = { ...defaultSettings, sciNotationMagnitude: 6 };
    // 0.0000001 = 1e-7, which is < 1e-6, so uses scientific notation
    expect(formatter.formatResult(0.0000001, settings)).toBe("1.00000000000e-7");
    // 0.00000453245 = 4.53e-6, which is >= 1e-6, so does NOT use scientific notation
    expect(formatter.formatResult(0.00000453245, settings)).toBe("0.00000453245");
  });

  test("respects magnitude threshold settings", () => {
    const formatter = loadFormatter();

    const magnitude3 = { ...defaultSettings, sciNotationMagnitude: 3 };
    expect(formatter.formatResult(1234, magnitude3)).toBe("1.23400000000e+3");
    expect(formatter.formatResult(999, magnitude3)).toBe("999");

    const magnitude9 = { ...defaultSettings, sciNotationMagnitude: 9 };
    expect(formatter.formatResult(123456789, magnitude9)).toBe("123456789");
    expect(formatter.formatResult(1234567890, magnitude9)).toBe("1.23456789000e+9");
  });

  test("adjusts precision based on significantDigits setting", () => {
    const formatter = loadFormatter();

    const settings6 = { ...defaultSettings, significantDigits: 6 };
    expect(formatter.formatResult(3.14159265359, settings6)).toBe("3.14159");

    const settings12 = { ...defaultSettings, significantDigits: 12 };
    expect(formatter.formatResult(3.14159265359, settings12)).toBe("3.14159265359");
  });

  test("handles numbers at exact magnitude boundary", () => {
    const formatter = loadFormatter();

    const settings = { ...defaultSettings, sciNotationMagnitude: 6 };
    
    // Exactly at 1e6 - should use scientific notation (>=)
    expect(formatter.formatResult(1000000, settings)).toBe("1.00000000000e+6");
    
    // Just below 1e6 - should not use scientific notation
    expect(formatter.formatResult(999999, settings)).toBe("999999");
    
    // Exactly at 1e-6 - should NOT use scientific notation (not < 1e-6)
    expect(formatter.formatResult(0.000001, settings)).toBe("0.000001");
    
    // Just below 1e-6 - should use scientific notation
    expect(formatter.formatResult(0.0000009, settings)).toBe("9.00000000000e-7");
  });

  test("handles very small numbers with different significant digits", () => {
    const formatter = loadFormatter();

    // With magnitude 6, value 4.53e-6 is >= 1e-6, so no scientific notation
    const settings3 = { ...defaultSettings, significantDigits: 3, sciNotationMagnitude: 6 };
    expect(formatter.formatResult(0.00000453245, settings3)).toBe("0.00000453");

    const settings6 = { ...defaultSettings, significantDigits: 6, sciNotationMagnitude: 6 };
    expect(formatter.formatResult(0.00000453245, settings6)).toBe("0.00000453245");
    
    // But with magnitude 7, value 4.53e-6 is < 1e-7? No, it's > 1e-7
    // Let's test a value that definitely uses scientific notation
    const settings3sci = { ...defaultSettings, significantDigits: 3, sciNotationMagnitude: 6 };
    expect(formatter.formatResult(0.0000001, settings3sci)).toBe("1.00e-7");
  });

  test("notationStyle affects return format (object vs string)", () => {
    const formatter = loadFormatter();

    const settingsE = { ...defaultSettings, notationStyle: "e", sciNotationMagnitude: 3 };
    const resultE = formatter.formatResult(12345, settingsE);
    expect(typeof resultE).toBe("string");
    expect(resultE).toBe("1.23450000000e+4");

    const settingsTimes10 = { ...defaultSettings, notationStyle: "times10", sciNotationMagnitude: 3 };
    const resultTimes10 = formatter.formatResult(12345, settingsTimes10);
    expect(typeof resultTimes10).toBe("object");
    expect(resultTimes10).toHaveProperty("text");
    expect(resultTimes10).toHaveProperty("html");
    expect(resultTimes10.text).toContain("×10");
    expect(resultTimes10.html).toContain("superscript");
  });

  test("preserves full precision for intermediate values", () => {
    const formatter = loadFormatter();

    // Even with low significant digits, the original value is preserved
    const settings = { ...defaultSettings, significantDigits: 3 };
    const value = 1.23456789012345;
    
    // The formatted result should round to 3 sig figs
    expect(formatter.formatResult(value, settings)).toBe("1.23");
    
    // But if we increase precision, we should see more digits (this tests that we're using the raw value)
    const settings12 = { ...defaultSettings, significantDigits: 12 };
    expect(formatter.formatResult(value, settings12)).toBe("1.23456789012");
  });
});

describe("CalculatorFormatter.formatScientificNotation", () => {
  test("formats 'e' notation as simple string", () => {
    const formatter = loadFormatter();

    const result = formatter.formatScientificNotation("1.234e+5", "e");
    expect(typeof result).toBe("string");
    expect(result).toBe("1.234e+5");
  });

  test("formats 'times10' notation with superscript object", () => {
    const formatter = loadFormatter();

    const result = formatter.formatScientificNotation("1.234e+5", "times10");
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("text");
    expect(result).toHaveProperty("html");
    expect(result.text).toBe("1.234×10^5");
    expect(result.html).toBe('1.234×10<span class="superscript">5</span>');
  });

  test("handles negative exponents in times10 notation", () => {
    const formatter = loadFormatter();

    const result = formatter.formatScientificNotation("4.53e-6", "times10");
    expect(result.text).toBe("4.53×10^-6");
    expect(result.html).toBe('4.53×10<span class="superscript">-6</span>');
  });

  test("handles positive exponent with plus sign", () => {
    const formatter = loadFormatter();

    const result = formatter.formatScientificNotation("1.23e+10", "times10");
    expect(result.text).toBe("1.23×10^10");
    expect(result.html).toBe('1.23×10<span class="superscript">10</span>');
  });

  test("handles exponent without sign", () => {
    const formatter = loadFormatter();

    const result = formatter.formatScientificNotation("5.67e8", "times10");
    expect(result.text).toBe("5.67×10^8");
    expect(result.html).toBe('5.67×10<span class="superscript">8</span>');
  });
});
