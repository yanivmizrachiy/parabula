# Parabula - GitHub Pages Stabilization Report

## Status

Final: SUCCESS

## Site State Before Run

- site/ exists, is not ignored, and contains HTML output.

## Root Cause of the Original 404

- site/ was previously ignored by git (.gitignore), so GitHub Pages could not serve it.
- tools/build-site.ps1 deletes and regenerates site/, which can remove a manually-created entry point if it is not generated as part of the build.
- An earlier redirect-style index had an invalid URL embedding newlines, which can break navigation.

## What Fixed the 404

- GitHub Pages was enabled for this repository with build type `workflow` (GitHub Actions).
- The GitHub Actions workflow `.github/workflows/pages.yml` completed successfully and deployed the `site/` artifact.
- The public URL now serves `site/index.html` (no longer 404).

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

Verified state:

- Pages is enabled and configured for GitHub Actions deployments.

Verification evidence:

- Workflow run: https://github.com/yanivmizrachiy/parabula/actions/runs/22683729213 (conclusion: success)

## Last Commit

3af2009a1c216a60a7f66c46aa42691d5ad47dde

## Public URL

https://yanivmizrachiy.github.io/parabula/
