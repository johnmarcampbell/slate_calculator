const fs = require("fs");
const path = require("path");

function loadPopupHtml() {
  return fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf8");
}

function loadPopupDocument() {
  const html = loadPopupHtml();
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

describe("popup layout settings controls", () => {
  test("has dedicated settings icon button", () => {
    const doc = loadPopupDocument();

    expect(doc.getElementById("settingsMenuButton")).not.toBeNull();
    expect(doc.getElementById("settingsMenu")).not.toBeNull();
  });

  test("keeps mode menu focused on view mode only", () => {
    const doc = loadPopupDocument();
    const modeMenu = doc.getElementById("modeMenu");
    const modeMenuBlock = modeMenu ? modeMenu.innerHTML : "";

    expect(modeMenuBlock).toContain("calculatorModeButton");
    expect(modeMenuBlock).toContain("graphModeButton");
    expect(modeMenuBlock).not.toContain("radiansAngleButton");
    expect(modeMenuBlock).not.toContain("degreesAngleButton");
    expect(modeMenuBlock).not.toContain("numberFormatButton");
  });

  test("places angle mode and number format entry in settings menu", () => {
    const doc = loadPopupDocument();
    const settingsMenu = doc.getElementById("settingsMenu");
    const settingsMenuBlock = settingsMenu ? settingsMenu.innerHTML : "";

    expect(settingsMenuBlock).toContain("radiansAngleButton");
    expect(settingsMenuBlock).toContain("degreesAngleButton");
    expect(settingsMenuBlock).toContain("numberFormatButton");
  });
});
