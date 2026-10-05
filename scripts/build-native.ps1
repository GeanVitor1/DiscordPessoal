$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $taskCompiler)) { throw 'Compilador C# do .NET Framework indisponível.' }
& $taskCompiler /nologo /target:exe /platform:anycpu /optimize+ "/out:$taskRoot\desktop\NativeInputHost.exe" "$taskRoot\desktop\NativeInputHost.cs"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar NativeInputHost.' }
