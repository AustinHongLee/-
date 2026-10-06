param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$distPath = [IO.Path]::GetFullPath((Join-Path $projectPath 'dist'))
$startupPort = 4173
if ($env:PORT) { $startupPort = [int]$env:PORT }
if ($startupPort -lt 1 -or $startupPort -gt 65535) { throw 'PORT 須為 1–65535。' }
$workbenchURL = "http://127.0.0.1:$startupPort/"

function Get-WorkbenchStatus {
  try { return Invoke-RestMethod -Uri ($workbenchURL + '__workbench') -TimeoutSec 1 }
  catch { return $null }
}
function Test-WorkbenchPort {
  $probe = New-Object Net.Sockets.TcpClient
  try { return $probe.ConnectAsync('127.0.0.1', $startupPort).Wait(800) -and $probe.Connected }
  catch { return $false }
  finally { $probe.Dispose() }
}
function Open-Workbench {
  Write-Host "完整工作台：$workbenchURL"
  if (-not $NoBrowser) { Start-Process $workbenchURL }
}

$existing = Get-WorkbenchStatus
if ($existing -and $existing.app -eq 'special-method-workbench' -and $existing.workspace -eq $distPath) {
  Open-Workbench
  exit 0
}
if (Test-WorkbenchPort) {
  throw "連接埠 $startupPort 已被其他服務使用。請先結束該服務，再執行本啟動檔；若舊工作台仍在終端機執行，可按 Ctrl+C 結束。"
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$runtimeNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if ($nodeCommand) { $nodePath = $nodeCommand.Source }
elseif (Test-Path -LiteralPath $runtimeNode) { $nodePath = $runtimeNode }
else { throw '請先安裝 Node.js 20 以上，再開啟本工作台。' }
$nodeVersion = & $nodePath --version
if ([version]$nodeVersion.TrimStart('v') -lt [version]'20.0.0') { throw '請使用 Node.js 20 以上。' }
$logDir = Join-Path $projectPath '.local'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$serverScript = Join-Path $projectPath 'scripts\serve.mjs'
$serverProcess = Start-Process -FilePath $nodePath -ArgumentList @('"' + $serverScript + '"') -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log') -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds(12)
do {
  $ready = Get-WorkbenchStatus
  if ($ready -and $ready.app -eq 'special-method-workbench' -and $ready.workspace -eq $distPath) { Open-Workbench; exit 0 }
  $serverProcess.Refresh()
  if ($serverProcess.HasExited) { throw ('啟動失敗：' + (Get-Content -LiteralPath (Join-Path $logDir 'server-error.log') -Raw)) }
  Start-Sleep -Milliseconds 150
} while ([DateTime]::UtcNow -lt $deadline)
throw '服務尚未就緒，請查看 .local\server-error.log，然後重試啟動。'
