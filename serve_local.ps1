param(
  [int]$Port = 8010
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
Write-Host "Serving Occitanie explorer from $root on http://localhost:$Port"
python -m http.server $Port
