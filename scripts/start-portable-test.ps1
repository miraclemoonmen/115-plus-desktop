param([Parameter(Mandatory)][string]$Exe)
$ErrorActionPreference = 'Stop'
# Hosted Windows runners are elevated. Run the disposable app with a restricted
# normal-user token so current WebView2 honors test-only debugging flags.
$marker = "portable-ci-$([guid]::NewGuid())"
& "$env:SystemRoot/System32/runas.exe" /trustlevel:0x20000 "`"$Exe`" $marker"
if ($LASTEXITCODE -ne 0) { throw '无法以普通权限启动便携测试进程' }
$deadline = (Get-Date).AddSeconds(15)
$appProcess = $null
while ((Get-Date) -lt $deadline) {
    $candidate = Get-CimInstance Win32_Process -Filter "Name='115+.exe'" | Where-Object { $_.CommandLine -like "*$marker*" } | Select-Object -First 1
    if ($candidate) {
        $appProcess = Get-Process -Id $candidate.ProcessId
        break
    }
    Start-Sleep -Milliseconds 100
}
if (!$appProcess) { throw '未找到便携测试进程' }
Write-Output "PORTABLE_APP_PID=$($appProcess.Id)"
$appProcess.WaitForExit()
exit $appProcess.ExitCode
