# Starts the Backplane hub (hidden) and opens Backplane as an app window.
# Closing the window stops the hub it started. Log: %USERPROFILE%\.backplane\hub.log
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 3787
$url = "http://127.0.0.1:$port/"
$bphome = Join-Path $env:USERPROFILE '.backplane'
New-Item -ItemType Directory -Force $bphome | Out-Null
$edgeProfile = Join-Path $root 'edge-profile'

function Test-Hub {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $r = $c.BeginConnect('127.0.0.1', $port, $null, $null)
    $ok = $r.AsyncWaitHandle.WaitOne(500) -and $c.Connected
    $c.Close()
    return $ok
  } catch { return $false }
}

$ownHub = $false
if (-not (Test-Hub)) {
  $env:PATH = "C:\msys64\usr\bin;$env:APPDATA\npm;$env:LOCALAPPDATA\Programs\KiCad\10.0\bin;$env:LOCALAPPDATA\Programs\FreeCAD 1.1\bin;C:\Program Files\Tailscale;$env:PATH"
  $hubArgs = @('--', '--home', $bphome.Replace('\', '/'), '--web', (Join-Path $root 'web').Replace('\', '/'), '--port', "$port")
  if (Test-Path (Join-Path $root 'local-only.flag')) { $hubArgs += '--no-tailscale' }
  Start-Process -FilePath (Join-Path $root 'backplane-serve.exe') -ArgumentList $hubArgs -WorkingDirectory $bphome -WindowStyle Hidden -RedirectStandardOutput (Join-Path $bphome 'hub.log') -RedirectStandardError (Join-Path $bphome 'hub.err')
  $ownHub = $true
  for ($i = 0; $i -lt 60 -and -not (Test-Hub); $i++) { Start-Sleep -Milliseconds 500 }
}

Start-Process msedge -ArgumentList "--app=$url", "--user-data-dir=`"$edgeProfile`"", '--no-first-run', '--no-default-browser-check', '--disable-background-mode'

if ($ownHub) {
  # stop the hub once its window has been closed (Edge keeps background
  # processes of its own, so the watch is for a visible window, not a process)
  function Get-BackplaneEdge {
    Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*edge-profile*" }
  }
  function Test-BackplaneWindow {
    $ids = @(Get-BackplaneEdge | ForEach-Object { $_.ProcessId })
    if ($ids.Count -eq 0) { return $false }
    return [bool](Get-Process -Id $ids -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
  }
  Start-Sleep -Seconds 12
  $gone = 0
  while ($gone -lt 2) {
    if (Test-BackplaneWindow) { $gone = 0 } else { $gone++ }
    Start-Sleep -Seconds 3
  }
  Get-BackplaneEdge | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  & taskkill.exe /F /T /IM backplane-serve.exe 2>$null | Out-Null
}
