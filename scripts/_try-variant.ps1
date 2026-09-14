param(
  [string]$Variant = "",
  [string]$Prompt = "A bright yellow rubber duck floating on a pink bathtub full of bubbles.",
  [string]$Out = "d:/work/amaze/DDyu/data/media-check/variant.png",
  [double]$At = 2.0,
  [string]$Dump = ""
)
$root = 'd:/work/amaze/DDyu'
Get-Process ddyu-site -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
if ($Variant -and $Variant -ne 'v0') { $env:DDYU_VIDEO_VARIANT = $Variant } else { Remove-Item Env:DDYU_VIDEO_VARIANT -ErrorAction SilentlyContinue }
if ($Dump) { $env:DDYU_VIDEO_DUMP = $Dump } else { Remove-Item Env:DDYU_VIDEO_DUMP -ErrorAction SilentlyContinue }
$env:GROK2API_QUALITY_GUARD_DIR = "$root/data/quality-guard"
Start-Process -FilePath "$root/dist/ddyu-site.exe" -ArgumentList '--config', "$root/config.yaml" -WorkingDirectory $root -RedirectStandardOutput "$root/logs/api.stdout.log" -RedirectStandardError "$root/logs/api.stderr.log" -WindowStyle Hidden
$ok = $false
for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Seconds 1; try { if ((Invoke-WebRequest -Uri 'http://127.0.0.1:8000/healthz' -TimeoutSec 2 -UseBasicParsing).Content -match '"ok":true') { $ok = $true; break } } catch {} }
if (-not $ok) { Write-Host 'HEALTH_FAIL'; exit 1 }
$ck = 'g2a_41f632d9cab0_qehej0eFs892rSecdUVjDGT7dDukzVIW'
$hdr = @{ Authorization = "Bearer $ck"; 'Content-Type' = 'application/json' }
$r = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/v1/videos/generations' -Method Post -Headers $hdr -Body (@{ model = 'grok-imagine-video'; prompt = $Prompt; duration = 6; aspect_ratio = '16:9'; resolution = '720p' } | ConvertTo-Json -Compress)
$id = $r.request_id
for ($i = 0; $i -lt 24; $i++) {
  $s = Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/videos/$id" -Headers $hdr -TimeoutSec 10
  Write-Host ("  [$Variant] status={0} progress={1}" -f $s.status, $s.progress)
  if ($s.status -eq 'done') { break }
  if ($s.status -eq 'failed') { Write-Host "FAILED $($s.error.message)"; exit 1 }
  Start-Sleep -Seconds 8
}
$url = $s.video.url
& powershell -NoProfile -ExecutionPolicy Bypass -File "$root/scripts/_frame.ps1" -Url $url -Out $Out -At $At
Write-Host "VARIANT=$Variant ID=$id OUT=$Out"
