# Typed Calculator Chrome Extension

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

## Notes for Extension Development

- Popup scripts run in a constrained environment with Content Security Policy, so avoiding `eval` is important.
- Popup state resets every time the popup closes; durable state should be stored via `chrome.storage.local`.
- `chrome.storage.local` is asynchronous, so startup wiring in `popup.js` hydrates UI state before interaction.
