$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Only run on disposable GitHub Actions runners.' }
$key = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$name = '115+.exe'
$fixture = 'portable-policy-test'
$hadKey = Test-Path $key
if (!$hadKey) { New-Item $key -Force | Out-Null }
$item = Get-Item $key
$hadValue = $item.GetValueNames() -contains $name
$original = $item.GetValue($name)
if ($item.GetValueNames() -contains $fixture) { throw 'Test fixture already exists' }
try {
    $previous = '--fixture="含空格 test"'
    New-ItemProperty $key -Name $fixture -Value 'keep' -PropertyType String | Out-Null
    New-ItemProperty $key -Name $name -Value $previous -PropertyType String -Force | Out-Null
    $backup = & "$PSScriptRoot/portable-debug-policy.ps1" -Action Enable -Port 19222
    if ((Get-ItemPropertyValue $key $fixture) -ne 'keep') { throw 'Unrelated policy overwritten' }
    if ((Get-ItemPropertyValue $key $name) -notmatch 'remote-debugging-port=19222') { throw 'Debug policy not set' }
    & "$PSScriptRoot/portable-debug-policy.ps1" -Action Restore -Backup $backup
    if ((Get-ItemPropertyValue $key $name) -ne $previous) { throw 'Original app policy not restored' }
    Remove-ItemProperty $key -Name $name
    $backup = & "$PSScriptRoot/portable-debug-policy.ps1" -Action Enable -Port 19223
    & "$PSScriptRoot/portable-debug-policy.ps1" -Action Restore -Backup $backup
    if ((Get-Item $key).GetValueNames() -contains $name) { throw 'Test app policy left behind' }
    if ((Get-ItemPropertyValue $key $fixture) -ne 'keep') { throw 'Unrelated policy not preserved' }
    Write-Output 'PASS existing policies preserved and temporary app policy restored'
} finally {
    Remove-ItemProperty $key -Name $fixture -ErrorAction SilentlyContinue
    if ($hadValue) { Set-ItemProperty $key -Name $name -Value $original }
    else { Remove-ItemProperty $key -Name $name -ErrorAction SilentlyContinue }
    if (!$hadKey -and (Get-Item $key).ValueCount -eq 0) { Remove-Item $key }
}
