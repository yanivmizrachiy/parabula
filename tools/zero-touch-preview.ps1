param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-JsonFile {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$Json
  )

  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  if ((Test-Path $Path) -and (-not $Force)) {
    throw "Refusing to overwrite existing file: $Path (pass -Force to overwrite)"
  }

  # Normalize line endings to LF for repo consistency.
  $normalized = $Json -replace "`r`n", "`n"
  [IO.File]::WriteAllText($Path, $normalized, (New-Object System.Text.UTF8Encoding($false)))
}

function Ensure-VSCodeExtension {
  param(
    [Parameter(Mandatory=$true)][string]$Id
  )

  $codeCmd = Get-Command code -ErrorAction SilentlyContinue
  if (-not $codeCmd) {
    Write-Warning "VS Code CLI 'code' not found in PATH. Skipping extension install."
    Write-Host "If needed: install manually in VS Code: $Id" -ForegroundColor Yellow
    return
  }

  Write-Host "Installing VS Code extension: $Id" -ForegroundColor Cyan
  & $codeCmd.Source --install-extension $Id --force | Out-Host
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$vscodeDir = Join-Path $repoRoot '.vscode'

$settingsPath = Join-Path $vscodeDir 'settings.json'
$tasksPath = Join-Path $vscodeDir 'tasks.json'
$extensionsPath = Join-Path $vscodeDir 'extensions.json'

$settingsJson = @'
{
  "livePreview.autoRefreshPreview": "onAnyChange",
  "livePreview.portNumber": 5500,
  "livePreview.openPreviewTarget": "Embedded Preview",
  "livePreview.notifyOnOpen": false,
  "livePreview.defaultPreviewPath": "עמוד-1.html",
  "task.allowAutomaticTasks": "on"
}
'@

$tasksJson = @'
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "dev: start vite",
      "type": "shell",
      "command": "npm run dev",
      "isBackground": true,
      "problemMatcher": {
        "owner": "vite",
        "fileLocation": ["relative", "${workspaceFolder}"],
        "pattern": {
          "regexp": "^(.*)$",
          "message": 1
        },
        "background": {
          "activeOnStart": true,
          "beginsPattern": "^\\s*(>\\s*vite\\b|VITE\\s+v)",
          "endsPattern": "Local:\\s+http://localhost:5173/"
        }
      }
    },
    {
      "label": "preview: start (node)",
      "type": "shell",
      "command": "npm run preview",
      "options": {
        "env": {
          "HOST": "127.0.0.1",
          "PORT": "5500"
        }
      },
      "isBackground": true,
      "problemMatcher": {
        "owner": "preview-node",
        "fileLocation": ["relative", "${workspaceFolder}"],
        "pattern": {
          "regexp": "^(.*)$",
          "message": 1
        },
        "background": {
          "activeOnStart": true,
          "beginsPattern": "Preview server running:",
          "endsPattern": "Preview server running: http://"
        }
      }
    },
    {
      "label": "preview: open (embedded)",
      "command": "${command:simpleBrowser.show}",
      "args": ["http://127.0.0.1:5500/preview"],
      "problemMatcher": []
    },
    {
      "label": "preview: frictionless (auto)",
      "dependsOn": ["preview: start (node)", "preview: open (embedded)"],
      "dependsOrder": "sequence",
      "problemMatcher": [],
      "runOptions": { "runOn": "folderOpen" },
      "presentation": { "reveal": "never" }
    },
    {
      "label": "test: watch page",
      "type": "shell",
      "command": "npm run test:watch:page",
      "isBackground": true,
      "problemMatcher": []
    }
  ]
}
'@

$extensionsJson = @'
{
  "recommendations": [
    "ms-vscode.live-server"
  ]
}
'@

Write-Host "Writing VS Code Zero‑Touch config..." -ForegroundColor Cyan
Write-JsonFile -Path $settingsPath -Json $settingsJson
Write-JsonFile -Path $tasksPath -Json $tasksJson
Write-JsonFile -Path $extensionsPath -Json $extensionsJson

Ensure-VSCodeExtension -Id 'ms-vscode.live-server'

Write-Host "Done." -ForegroundColor Green
Write-Host "Next: reload VS Code window if prompted, then reopen the folder to trigger 'preview: frictionless (auto)'." -ForegroundColor DarkGray
