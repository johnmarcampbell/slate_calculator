(function () {
  "use strict";

  /**
   * Format a numeric result value according to the provided settings.
   * @param {number} value - The numeric value to format
   * @param {Object} settings - Number format settings
   * @param {number} settings.significantDigits - Number of significant digits (3-12)
   * @param {number} settings.sciNotationMagnitude - Magnitude threshold for scientific notation (3-20)
   * @param {string} settings.notationStyle - "e" or "times10"
   * @returns {string|Object} Formatted string, or object with {text, html} for times10 notation
   */
  function formatResult(value, settings) {
    // Handle non-finite values
    if (!Number.isFinite(value)) {
      return "Error: Result is not finite";
    }

    // Handle negative zero
    if (Object.is(value, -0)) {
      return "0";
    }

    // Handle regular zero
    if (value === 0) {
      return "0";
    }

    const absValue = Math.abs(value);
    const magnitude = settings.sciNotationMagnitude || 6;
    const threshold = Math.pow(10, magnitude);
    
    // Determine if scientific notation should be used
    const useScientific = absValue >= threshold || absValue < 1 / threshold;

    if (useScientific) {
      const sigDigits = settings.significantDigits || 12;
      // toExponential uses digits AFTER decimal point, so subtract 1 from significant digits
      const exponentialStr = value.toExponential(Math.max(0, sigDigits - 1));
      return formatScientificNotation(exponentialStr, settings.notationStyle || "e");
    }

    // Normal range - use significant digits
    const sigDigits = settings.significantDigits || 12;
    return Number(value.toPrecision(sigDigits)).toString();
  }

  /**
   * Format a scientific notation string according to the notation style.
   * @param {string} valueString - The number in exponential format (e.g., "1.234e+5")
   * @param {string} style - "e" or "times10"
   * @returns {string|Object} For "e": string. For "times10": object with {text, html}
   */
  function formatScientificNotation(valueString, style) {
    if (style === "times10") {
      // Parse the exponential notation
      const match = valueString.match(/^([+-]?\d+\.?\d*)e([+-]?\d+)$/i);
      if (!match) {
        // Fallback if parsing fails
        return valueString;
      }

      const mantissa = match[1];
      const exponent = match[2];
      
      // Remove leading + from exponent for cleaner display
      const cleanExponent = exponent.replace(/^\+/, "");

      return {
        text: `${mantissa}×10^${cleanExponent}`,
        html: `${mantissa}×10<span class="superscript">${cleanExponent}</span>`
      };
    }

    // Default "e" notation - return as-is
    return valueString;
  }

  window.CalculatorFormatter = {
    formatResult,
    formatScientificNotation
  };
})();
