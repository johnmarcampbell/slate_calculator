# Chrome Calculator

A Manifest V3 Chrome extension calculator: users type math expressions, see formatted results, browse history, and plot single-variable functions.

## Language

**Settings**:
The module that owns persisted user-facing state — preferences (angle mode, theme, number format, graph defaults) and session state that should survive popup reopen (in-progress expression, active view).
_Avoid_: Preferences (too narrow — excludes session state), Store (too vague), Config.

**Setting**:
A single persisted value owned by **Settings**, identified by a string key with a default and a validator declared in the schema.

## Relationships

- **Settings** owns all keys in `chrome.storage.local` *except* the history log.
- The history log is its own module — it has a different shape (append-only list, capped) and a different operation set.

## Flagged ambiguities

- The codebase informally uses "settings" in identifiers like `numberFormatSettings`, `graphSettings`. Going forward, **Settings** (capitalized) refers to the module; a lowercase "setting" refers to a single persisted value.
