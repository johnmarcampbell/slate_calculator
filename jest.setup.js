global.jsep = require("jsep");

const { attachChromeStorage } = require("./__tests__/helpers/mockChromeStorage");

beforeEach(() => {
  attachChromeStorage();
  delete window.CalculatorEvaluator;
  delete window.CalculatorHistory;
  delete window.CalculatorGrapher;
});
