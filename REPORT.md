# Parabula Automation Report (2026-03-03)

## What Was Broken And Why

- `tools/build-site.ps1` was not stable/parseable: it contained corrupted leading text (mojibake) and a broken string literal, which caused PowerShell `ParserError` failures.
- The previous `tools/build-site.ps1` logic was also more complex than required and relied on patterns that are fragile for mixed RTL/Hebrew content (including non-ASCII matching).
- `tools/publish.ps1` did not match the required publish contract: it performed extra steps (running other scripts) and used non-ASCII strings.
- MathJax was not reliably present in the generated `site/` HTML output.

## Files Changed

- `tools/build-site.ps1`
- `tools/publish.ps1`

## What `tools/build-site.ps1` Does Now

1. Resolves repository root as the parent of the `tools/` directory.
2. Deletes `site/` if it exists.
3. Recreates `site/`.
4. Finds every `pages/**/index.html`.
5. For each `index.html`:
   - Writes an output file under `site/` preserving the directory structure under `pages/`.
   - Renames the file from `index.html` to `<leaf-folder-name>.html`.
     - Example: `pages/<topic>/<page>/index.html` -> `site/<topic>/<page>.html`
6. Saves generated files as UTF-8.

## How MathJax Is Injected

- The script checks for the substring `mathjax@3/es5/tex-chtml.js`.
- If missing, it injects exactly this tag into the HTML:

  `<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>`

- Injection strategy (no Hebrew regex, no here-strings):
  - If `</head>` exists (case-insensitive), insert the tag immediately before it.
  - Else if a `<head ...>` opening exists, insert immediately after the opening `>`.
  - Else, prepend a minimal `<head>...</head>` block at the top.

## What `tools/publish.ps1` Enforces

1. Runs `git status --porcelain`.
2. Stops if there are no changes.
3. Stops if `rules.md` is not among the changed paths.
4. If allowed to proceed:
   - `git add -A`
   - `git commit -m "publish: <yyyy-MM-dd_HH-mm-ss>"`
   - `git push`

## Recommended Daily Run Command

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File tools/build-site.ps1
# Make sure rules.md is updated when appropriate
pwsh -NoProfile -ExecutionPolicy Bypass -File tools/publish.ps1
```

## Final Git Status

At the end of this run, publish was blocked as designed because `rules.md` was not changed.

```text
 M tools/build-site.ps1
 M tools/publish.ps1
```
