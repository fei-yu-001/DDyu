# DDyu 个人站 · 本机一键启动（Resin 出口池 + 站点）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File start-local.ps1          # 只启动
#   powershell -ExecutionPolicy Bypass -File start-local.ps1 -Open    # 启动并打开创意工坊
#
# 两个服务都幂等：已在运行就直接跳过，可重复执行。
param([switch]$Open)

$ErrorActionPreference = 'Stop'
# $PSScriptRoot = .../DDyu/scripts/local，上两级才是 DDyu 根目录
$ddyu      = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$workspace = Split-Path -Parent $ddyu                  # .../amaze
$resin     = Join-Path $workspace 'resin'
$exe       = Join-Path $ddyu 'dist/ddyu-site.exe'
$logs      = Join-Path $ddyu 'logs'

New-Item -ItemType Directory -Force -Path $logs, (Join-Path $ddyu 'data/quality-guard') | Out-Null

function Test-Port([int]$Port) {
  [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

# 1) Resin：站点的出站代理池（start-resin.ps1 自带幂等：已在监听 2260 就跳过）
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $resin 'start-resin.ps1')

# 2) 站点本体
#    ⚠️ GROK2API_QUALITY_GUARD_DIR 必须注入，否则 qualityGuard 已启用时会启动失败。
if (-not (Test-Port 8000)) {
  if (-not (Test-Path $exe)) {
    throw "找不到 $exe ，请先构建：在 backend/ 下执行 go build -o ../dist/ddyu-site.exe ./cmd/grok2api"
  }
  $env:GROK2API_QUALITY_GUARD_DIR = Join-Path $ddyu 'data/quality-guard'
  Start-Process -FilePath $exe -ArgumentList '--config', (Join-Path $ddyu 'config.yaml') `
    -WorkingDirectory $ddyu `
    -RedirectStandardOutput (Join-Path $logs 'api.stdout.log') `
    -RedirectStandardError  (Join-Path $logs 'api.stderr.log') `
    -WindowStyle Hidden | Out-Null
  Write-Host '站点进程已拉起，等待健康检查...'
}

# 3) 健康检查
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    if ((Invoke-WebRequest -Uri 'http://127.0.0.1:8000/healthz' -TimeoutSec 2 -UseBasicParsing).Content -match '"ok":true') {
      $ok = $true; break
    }
  } catch {}
}

if ($ok) {
  Write-Host ''
  Write-Host '[OK] 站点已就绪' -ForegroundColor Green
  Write-Host '     创意工坊  http://127.0.0.1:8000/studio/creative-console'
  Write-Host '     管理后台  http://127.0.0.1:8000/studio/login'
  Write-Host '     出口池 UI http://127.0.0.1:2260/ui/'
  if ($Open) { Start-Process 'http://127.0.0.1:8000/studio/creative-console' }
} else {
  Write-Host '[FAIL] 健康检查未通过，请查看 logs/api.stderr.log' -ForegroundColor Red
  exit 1
}
