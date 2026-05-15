# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm test             # run all Jest tests
npm run test:watch   # watch mode
npm run test:coverage  # generate coverage report
```

No build step — the extension loads directly from source files via Chrome's manifest V3.

**Load in Chrome:** `chrome://extensions` → Enable Developer mode → Load unpacked → select this directory.

## Architecture

This is a Manifest V3 Chrome extension calculator (popup only, no background service worker). Users type expressions rather than clicking number buttons. The single permission is `storage` (chrome.storage.local).

**Module pattern:** All modules are IIFE closures that expose a single API object on `window` — no bundler required.

| Module | Export | Responsibility |
|--------|--------|---------------|
| `evaluator.js` | `CalculatorEvaluator` | Parses and evaluates math expressions via vendored jsep; handles trig (with angle mode), logs, constants |
| `formatter.js` | `CalculatorFormatter` | Formats results with configurable significant digits and scientific notation |
| `history.js` | `CalculatorHistory` | Async Promise wrappers around chrome.storage.local; up to 80 entries |
| `grapher.js` | `CalculatorGrapher` | Canvas-based function plotter with zoom/pan, auto-scale, hover coordinates |
| `popup.js` | (orchestrator) | Wires everything together; manages UI state, settings persistence, view switching |

**Data flow:** User types expression → `popup.js` calls `CalculatorEvaluator` → result formatted by `CalculatorFormatter` → entry saved via `CalculatorHistory` → UI updated. Graph mode samples f(x) at many x values via `CalculatorGrapher`.

**Theming:** CSS custom properties with three schemes (light, dark, neutral); active theme class applied to `<body>`.

**State persistence:** Angle mode, theme, graph settings, current expression draft, number format settings, and history all stored in chrome.storage.local and restored on popup open.

## Testing

Tests use Jest with jsdom. `__tests__/helpers/` provides:
- `mockChromeStorage.js` — mock chrome.storage.local (attached in jest.setup.js)
- `mockCanvas.js` — mock Canvas API for grapher tests

Tests for `popup.js` are intentionally light; deeper logic lives in the individual modules with dedicated test files.

## Development Guidelines (from .github/copilot-instructions.md)

- **TDD:** Write a failing test first, then implement. Tests live in `__tests__/`.
- **Minimal scope:** Keep changes focused; avoid refactoring unrelated files.
- **Module boundaries:** Preserve existing exported APIs (`CalculatorEvaluator`, `CalculatorFormatter`, etc.).
- **Error messages:** Normalize thrown error messages so tests remain stable.
- **No new dependencies** without clear justification — the vendored jsep in `lib/` avoids bundling requirements.
