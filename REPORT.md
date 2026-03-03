# Parabula - GitHub Pages Stabilization Report

## Status

Final: OK

## Site State Before Run

- site/ exists, is not ignored, and contains HTML output.

## Root Cause of the Original 404

- site/ was previously ignored by git (.gitignore), so GitHub Pages could not serve it.
- tools/build-site.ps1 deletes and regenerates site/, which can remove a manually-created entry point if it is not generated as part of the build.
- An earlier redirect-style index had an invalid URL embedding newlines, which can break navigation.

## Files Changed or Created

- tools/build-site.ps1 (generates site/index.html and site/.nojekyll)
- site/index.html (landing page, generated)
- site/.nojekyll (generated)
- rules.md (publish gate marker)
- REPORT.md (this report)

## site/index.html (Current)

- A simple landing page titled "Parabula" with a relative link list to all site/\*_/_.html (excluding index.html).

## GitHub Pages Configuration

- GitHub Actions workflow is used for Pages deployment: .github/workflows/pages.yml
- The workflow publishes the static output from site/.

## Last Commit

bd994b43ff74b9d178513deb4533430a74f2d3f1

## Public URL

https://yanivmizrachiy.github.io/parabula/
