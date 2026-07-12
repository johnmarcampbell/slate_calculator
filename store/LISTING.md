# Chrome Web Store submission guide

Everything below is ready to copy-paste into the [developer console](https://chrome.google.com/webstore/devconsole).

## Checklist

1. **Developer account** (one-time, manual): register at https://chrome.google.com/webstore/devconsole with your Google account and pay the one-time **$5 registration fee**.
2. **Build the upload package**: `make package` (or `bash store/package.sh`) → produces `dist/slate-calculator-v1.0.0.zip`.
3. In the developer console, click **New item** and upload the zip.
4. Fill in the **Store listing** tab using the copy below. Upload the images from `store/assets/`.
5. Fill in the **Privacy** tab using the answers below.
6. **Distribution** tab: visibility **Public**, all regions (defaults are fine).
7. Click **Submit for review**. Extensions with only the `storage` permission typically clear review within a few days.

To publish an update later: bump `"version"` in `manifest.json`, re-run `make package`, and upload the new zip on the item's **Package** tab.

## Store listing

| Field | Value |
|---|---|
| Name | Slate Calculator |
| Summary | A small calculator with reusable history. Evaluate expressions, graph functions, and insert past results with a click. |
| Category | Tools |
| Language | English |

**Description:**

```
A small calculator that lives in your toolbar. Type an expression, see the result as you type, and press Enter to save it to history.

The history is the useful part: every saved calculation stays one click away. Click a past expression or result to insert it at the cursor in what you're writing, or copy either one. Up to 80 entries persist between sessions.

Supported math:
• Arithmetic, powers, and parentheses: (1 + sqrt(5)) / 2
• Trig in radians or degrees: sin, cos, tan, asin, acos, atan
• Logs and exponentials: ln, log10, exp
• Constants: pi and e

Also included:
• Graphing mode: plot f(x) with zoom, pan, hover coordinates, and auto-scaled axes
• Light, dark, and neutral themes
• Configurable significant digits and scientific-notation style
• Pop-out into a separate window

No accounts, no analytics, no network requests. History and settings are stored locally in your browser.
```

**Images (from `store/assets/`):**

| Asset | File |
|---|---|
| Screenshot 1 (1280×800) | `screenshot-calc.png` |
| Screenshot 2 (1280×800) | `screenshot-graph.png` |
| Screenshot 3 (1280×800) | `screenshot-light.png` |
| Small promo tile (440×280) | `promo-tile-small.png` |
| Store icon (128×128) | `../../icons/icon128.png` (auto-taken from the zip) |

## Privacy tab

**Single purpose description:**

```
Slate Calculator is a calculator: it evaluates math expressions the user types, plots functions in a small graph view, and keeps a local history of past calculations for reuse.
```

**Permission justification — `storage`:**

```
chrome.storage.local is used to persist the user's calculation history and preferences (theme, angle mode, number format, graph ranges, expression draft) between popup openings. All data stays on the device; nothing is transmitted anywhere.
```

**Remote code:** No, I am not using remote code. (All scripts are bundled; the only third-party library, jsep, is vendored in `lib/`.)

**Data usage:** check **none** of the data-collection categories. The extension does not collect or transmit any user data.

**Certification checkboxes:** all three can be checked truthfully (no data collected/transferred).

**Privacy policy URL** (required field in account settings for some flows; fine to provide either way):

```
https://github.com/johnmarcampbell/slate_calculator/blob/main/PRIVACY.md
```

## Regenerating assets

Icons, screenshots, and the promo tile are all rendered from the real popup with headless Chrome:

```bash
bash store/build-assets.sh
```

- `store/icon.html` — icon artwork (edit and re-run to change the icon)
- `store/shot.html` + `store/shot-shim.js` — screenshot compositions; the shim seeds mock chrome.storage data so the real popup renders live
- `store/tile.html` — small promo tile

None of the `store/` directory ships in the upload zip; `store/package.sh` enumerates runtime files explicitly.
