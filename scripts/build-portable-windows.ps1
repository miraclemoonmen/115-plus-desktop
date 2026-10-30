param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
$originalRustFlags = $env:RUSTFLAGS
try {
    $runtime = Get-Content "$PSScriptRoot/webview2-runtime.json" -Raw | ConvertFrom-Json
    $package = Get-Content 'package.json' -Raw | ConvertFrom-Json
    $output = Join-Path $repoRoot 'src-tauri/target/portable'
    New-Item $output -ItemType Directory -Force | Out-Null
    $cab = Join-Path $output 'webview2-x64.cab'
    if (!(Test-Path $cab) -or (Get-FileHash $cab -Algorithm SHA256).Hash -ne $runtime.sha256) {
        Invoke-WebRequest -Uri $runtime.url -OutFile $cab
    }
    if ((Get-FileHash $cab -Algorithm SHA256).Hash -ne $runtime.sha256) {
        throw 'WebView2 SHA256 校验失败'
    }

    if (!$SkipBuild) {
        # Avoid a separate Visual C++ redistributable on clean Windows machines.
        $env:RUSTFLAGS = "$originalRustFlags -C target-feature=+crt-static".Trim()
        & pnpm tauri build --target x86_64-pc-windows-msvc --no-bundle --config src-tauri/tauri.portable.conf.json --config src-tauri/tauri.portable.windows.conf.json
        if ($LASTEXITCODE -ne 0) { throw 'Windows 便携版构建失败' }
    }

    $stage = Join-Path $output '115+'
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item $stage -ItemType Directory | Out-Null
    Copy-Item 'src-tauri/target/x86_64-pc-windows-msvc/release/oof-plus-desktop.exe' (Join-Path $stage '115+.exe')
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    $vs = & $vswhere -latest -products '*' -property installationPath
    $dumpbin = Get-ChildItem "$vs/VC/Tools/MSVC/*/bin/Hostx64/x64/dumpbin.exe" | Select-Object -Last 1
    $dependencies = & $dumpbin.FullName /DEPENDENTS (Join-Path $stage '115+.exe')
    if ($LASTEXITCODE -ne 0) { throw '无法检查 EXE 依赖' }
    if (($dependencies -join "`n") -match '(?im)^\s+(VCRUNTIME|MSVCP|CONCRT)\w*\.dll') {
        throw '便携 EXE 仍依赖额外的 Visual C++ 运行库'
    }
    $dependencies | Set-Content (Join-Path $output 'exe-dependencies.txt')
    $expanded = Join-Path $output 'webview2-expanded'
    if (Test-Path $expanded) { Remove-Item $expanded -Recurse -Force }
    New-Item $expanded -ItemType Directory | Out-Null
    & expand.exe $cab '-F:*' $expanded | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'WebView2 解压失败' }
    $browser = @(Get-ChildItem $expanded -Filter msedgewebview2.exe -Recurse)
    if ($browser.Count -ne 1) { throw 'WebView2 文件结构异常' }
    Move-Item $browser[0].Directory.FullName (Join-Path $stage 'runtime')
    if (Test-Path $expanded) { Remove-Item $expanded -Recurse -Force }
    New-Item (Join-Path $stage 'data') -ItemType Directory | Out-Null
    Copy-Item 'docs/portable.md' (Join-Path $stage '使用说明.md')
    $archive = Join-Path $output "115+_$($package.version)_windows-x64-portable.zip"
    if (Test-Path $archive) { Remove-Item $archive }
    Compress-Archive -Path $stage -DestinationPath $archive -CompressionLevel Optimal
    $digest = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    "$digest  $(Split-Path $archive -Leaf)" | Set-Content "$archive.sha256" -Encoding utf8NoBOM
    Write-Output "便携包：$archive"
} finally {
    $env:RUSTFLAGS = $originalRustFlags
    Pop-Location
}
