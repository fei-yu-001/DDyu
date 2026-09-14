param([string]$Url, [string]$Out, [double]$At = 1.5)
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
if ($Url -notmatch '^https?://') { $Url = ([Uri](Resolve-Path $Url)).AbsoluteUri }
$player = New-Object System.Windows.Media.MediaPlayer
$player.ScrubbingEnabled = $true
$player.Volume = 0
$player.Open([Uri]$Url)
$player.Play()
$sw = [Diagnostics.Stopwatch]::StartNew()
while ($player.NaturalVideoWidth -eq 0 -and $sw.Elapsed.TotalSeconds -lt 30) {
  [System.Windows.Threading.Dispatcher]::CurrentDispatcher.Invoke([System.Windows.Threading.DispatcherPriority]::Background, [action]{})
  Start-Sleep -Milliseconds 100
}
if ($player.NaturalVideoWidth -eq 0) { Write-Host 'OPEN_FAILED'; exit 1 }
$player.Pause()
$player.Position = [TimeSpan]::FromSeconds($At)
Start-Sleep -Milliseconds 1200
[System.Windows.Threading.Dispatcher]::CurrentDispatcher.Invoke([System.Windows.Threading.DispatcherPriority]::Background, [action]{})
$w = [int]$player.NaturalVideoWidth
$h = [int]$player.NaturalVideoHeight
$dv = New-Object System.Windows.Media.DrawingVisual
$dc = $dv.RenderOpen()
$dc.DrawVideo($player, (New-Object System.Windows.Rect(0, 0, $w, $h)))
$dc.Close()
$rtb = New-Object System.Windows.Media.Imaging.RenderTargetBitmap($w, $h, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
$rtb.Render($dv)
$enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
$enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($rtb))
$fs = [IO.File]::Create($Out)
$enc.Save($fs)
$fs.Close()
Write-Host "OK $Out ${w}x${h}"
