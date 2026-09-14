# DDyu 个人站 · 本机一键停止（站点 + Resin 出口池）
foreach ($name in 'ddyu-site', 'resin') {
  $process = Get-Process $name -ErrorAction SilentlyContinue
  if ($process) {
    $process | Stop-Process -Force
    Write-Host "stopped: $name (pid $($process.Id))"
  } else {
    Write-Host "not running: $name"
  }
}
