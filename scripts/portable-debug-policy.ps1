param([ValidateSet('Enable','Restore')][string]$Action, [int]$Port, [string]$Backup)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'This debugger configuration is only for disposable GitHub Actions runners.' }
# Recent WebView2 ignores environment debugging flags in elevated CI hosts.
# This temporary, app-specific machine policy is never included in the application.
$key = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$name = '115+.exe'
if ($Action -eq 'Enable') {
    $hadKey = Test-Path $key
    $hadValue = $false
    $previous = $null
    if ($hadKey) {
        $item = Get-Item $key
        $hadValue = $item.GetValueNames() -contains $name
        if ($hadValue) { $previous = $item.GetValue($name) }
    }
    New-Item $key -Force | Out-Null
    New-ItemProperty $key -Name $name -Value "--remote-debugging-port=$Port --host-resolver-rules=`"MAP *.115.com ~NOTFOUND`"" -PropertyType String -Force | Out-Null
    @{hadKey=$hadKey;hadValue=$hadValue;value=$previous} | ConvertTo-Json -Compress
} else {
    $state = $Backup | ConvertFrom-Json
    if ($state.hadValue) { Set-ItemProperty $key -Name $name -Value $state.value }
    else { Remove-ItemProperty $key -Name $name -ErrorAction SilentlyContinue }
    if (!$state.hadKey -and (Test-Path $key) -and (Get-Item $key).ValueCount -eq 0) { Remove-Item $key }
}
