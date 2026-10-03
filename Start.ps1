$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$runtimeNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if ($nodeCommand) { $nodePath = $nodeCommand.Source }
elseif (Test-Path -LiteralPath $runtimeNode) { $nodePath = $runtimeNode }
else { throw '請先安裝 Node.js 20 以上，再開啟本工作台。' }
Push-Location -LiteralPath $projectPath
try {
  Write-Host '請在瀏覽器開啟 http://127.0.0.1:4173/；按 Ctrl+C 結束。'
  & $nodePath 'scripts/serve.mjs'
} finally { Pop-Location }
