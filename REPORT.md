# Parabula - GitHub Pages Stabilization Report

## Status

Final: FAILED

## Site State Before Run

- site/ exists, is not ignored, and contains HTML output.

## Root Cause of the Original 404

- site/ was previously ignored by git (.gitignore), so GitHub Pages could not serve it.
- tools/build-site.ps1 deletes and regenerates site/, which can remove a manually-created entry point if it is not generated as part of the build.
- An earlier redirect-style index had an invalid URL embedding newlines, which can break navigation.

## Deep Diagnosis (Why it is STILL 404)

- GitHub API reports `has_pages=false` for this repository.
- GitHub Pages API endpoint returns 404 (`GET /repos/{owner}/{repo}/pages`).
- This means GitHub Pages is not enabled in Repository Settings, so the public URL remains 404 regardless of the site/ content or the workflow.

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

Required repository setting:

- Settings -> Pages -> Build and deployment -> Source = GitHub Actions

## Last Commit

948cc9de82deb9bc9d31ec91ada9bf49f1ae3691

## Public URL

https://yanivmizrachiy.github.io/parabula/
