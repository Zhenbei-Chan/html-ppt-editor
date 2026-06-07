$ErrorActionPreference = "Stop"

$testFile = Join-Path $PSScriptRoot "browser-system-test.html"
$chromeCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$browser = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  throw "No Chrome or Edge executable found."
}

$fileUrl = "file:///" + ($testFile -replace "\\", "/")
$stdout = Join-Path $env:TEMP ("hpe-browser-test-out-" + [guid]::NewGuid().ToString("N") + ".txt")
$stderr = Join-Path $env:TEMP ("hpe-browser-test-err-" + [guid]::NewGuid().ToString("N") + ".txt")
$browserArgs = @(
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--in-process-gpu",
  "--allow-file-access-from-files",
  "--virtual-time-budget=8000",
  "--dump-dom",
  $fileUrl
)

$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = $browser
$psi.Arguments = ($browserArgs | ForEach-Object {
  if ($_ -match '\s') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
}) -join " "
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$proc = [System.Diagnostics.Process]::new()
$proc.StartInfo = $psi
[void]$proc.Start()
$stdOutText = $proc.StandardOutput.ReadToEnd()
$stdErrText = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()
$output = $stdOutText + "`n" + $stdErrText
$json = [regex]::Match($output, '<pre id="results">([\s\S]*?)</pre>').Groups[1].Value
if (-not $json) {
  Write-Output $output
  throw "No browser test results found."
}

$json = [System.Net.WebUtility]::HtmlDecode($json)
$results = $json | ConvertFrom-Json

$results | ForEach-Object {
  $prefix = if ($_.pass) { "PASS" } else { "FAIL" }
  Write-Output "$prefix`t$($_.name)`t$($_.detail)"
}

$failed = @($results | Where-Object { -not $_.pass })
if ($failed.Count -gt 0) {
  throw "$($failed.Count) browser system test(s) failed."
}
