# Slate Calculator Chrome Extension

A Manifest V3 Chrome extension calculator focused on typed expressions rather than a keypad.

## Features

- Supports arithmetic: `+`, `-`, `*`, `/`, `%`
- Supports arbitrary exponents with `^` or `**`
- Supports `ln(x)` and `log10(x)` (also accepts `log_10(x)`)
- Supports constants `e`, `pi`, and `π`
- Supports trig functions with angle mode toggle:
  - `sin`, `cos`, `tan`
  - `asin`, `acos`, `atan`
- Scrollable persistent history
- Separate click targets in history:
  - click expression to insert expression at current cursor
  - click result to insert result at current cursor
- Pop-out button to open the calculator in a separate window
- Dedicated Graph tab in the popup:
  - plot a single function `f(x)` with current angle mode
  - set `x min/x max` and optional manual `y min/y max`
  - auto-scale y toggle
  - wheel zoom, drag-to-pan, and hover coordinate readout
  - graph settings persistence via storage

## Important Syntax Rules

- Multiplication must be explicit (`2*pi`, not `2pi`)
- Press `Enter` to evaluate and save in history
- Use `Shift+Enter` for newline in the input

## Project Structure

- `manifest.json`: Extension configuration
- `popup.html`: Popup UI markup
- `styles.css`: Popup styling
- `popup.js`: UI behavior, evaluation flow, history rendering, caret insertion
- `evaluator.js`: Safe expression parsing and evaluation
- `history.js`: `chrome.storage.local` persistence
- `grapher.js`: Canvas graph rendering, sampling, and interactions
- `lib/jsep.iife.min.js`: Vendored parser library build

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder.

## Manual Smoke Checks

- Arithmetic: `2+3*4` -> `14`
- Exponents: `e^2`, `2^10`
- Logs: `ln(e)` -> `1`, `log10(100)` -> `2`
- Trig in radians: `sin(pi)` -> approximately `0`
- Trig in degrees: switch to Degrees, `sin(90)` -> `1`
- Error handling: `ln(-1)`, `1/0`, malformed input like `2+`
- History insertion:
  - enter a few expressions
  - click a past expression and verify insertion at caret
  - click a past result and verify insertion at caret
- Graph tab:
  - plot `x^2`, `sin(x)`, and `1/x`
  - verify default view starts with `x` in `[-10, 10]` and y auto-scale enabled
  - disable y auto-scale and set manual y bounds, then redraw
  - zoom with mouse wheel and pan by dragging on canvas
  - move pointer over the graph and verify coordinate readout updates

## Automated Tests

This project uses Jest with a jsdom environment for local automated testing.

- Install dependencies:
  - `npm install`
- Run all tests:
  - `npm test`
- Run in watch mode:
  - `npm run test:watch`
- Generate coverage report:
  - `npm run test:coverage`
- Use Make targets:
  - `make test`
  - `make test-watch`
  - `make test-coverage`

Current suite scope:

- `evaluator.js`: expression parsing, math correctness, angle-mode behavior, and error handling
- `history.js`: async storage persistence behavior and fallback/default rules
- `grapher.js`: draw outcomes, sampling behavior, coordinate transforms, zoom/pan, and hover handling

Popup DOM integration tests are intentionally excluded from this phase to keep the suite focused on high-risk core logic.

## Notes for Extension Development

- Popup scripts run in a constrained environment with Content Security Policy, so avoiding `eval` is important.
- Popup state resets every time the popup closes; durable state should be stored via `chrome.storage.local`.
- `chrome.storage.local` is asynchronous, so startup wiring in `popup.js` hydrates UI state before interaction.
