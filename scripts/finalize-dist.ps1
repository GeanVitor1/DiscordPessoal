$ErrorActionPreference = 'Stop'
$taskWorkspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskDist = [IO.Path]::GetFullPath((Join-Path $taskWorkspace 'dist'))
$taskArtifacts = [IO.Path]::GetFullPath((Join-Path $taskWorkspace 'artifacts'))
function Assert-WorkspacePath([string]$candidate) {
  $resolved = [IO.Path]::GetFullPath($candidate)
  if (-not $resolved.StartsWith($taskWorkspace + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Path outside workspace: $resolved" }
  return $resolved
}
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskWorkspace 'package.json') -Raw | ConvertFrom-Json).version
$taskInstaller = Assert-WorkspacePath (Join-Path $taskDist "MeuApp-Setup-$taskVersion.exe")
foreach ($taskReportName in @('build','packaged','updater','installer-payload','startup')) {
  $taskReport = Get-Content -LiteralPath (Join-Path $taskWorkspace "docs\validation\$taskReportName.json") -Raw | ConvertFrom-Json
  if ($taskReport.version -ne $taskVersion) { throw "Stale validation report: $taskReportName" }
  if (($taskReport.PSObject.Properties.Name -contains 'passed') -and -not $taskReport.passed) { throw "Failed validation: $taskReportName" }
}
if (-not (Test-Path -LiteralPath $taskInstaller)) { throw 'Updated installer missing' }
$taskPackagedFolder = Assert-WorkspacePath (Join-Path $taskArtifacts "desktop-$taskVersion")
if (Test-Path -LiteralPath $taskPackagedFolder) { throw "Validation directory already exists: $taskPackagedFolder" }
New-Item -ItemType Directory -Path $taskPackagedFolder -Force | Out-Null
Move-Item -LiteralPath (Assert-WorkspacePath (Join-Path $taskDist 'win-unpacked')) -Destination $taskPackagedFolder
$taskArchiveFolder = Assert-WorkspacePath (Join-Path $taskArtifacts ('previous-build-material-' + (Get-Date -Format 'yyyyMMdd-HHmmss')))
New-Item -ItemType Directory -Path $taskArchiveFolder -Force | Out-Null
# Delete obsolete installers; keep current updater metadata beside the installer.
foreach ($taskEntry in Get-ChildItem -LiteralPath $taskDist -Force) {
  $taskSource = Assert-WorkspacePath $taskEntry.FullName
  if ($taskEntry.Name -in @("MeuApp-Setup-$taskVersion.exe", "MeuApp-Setup-$taskVersion.exe.blockmap", 'latest.yml')) { continue }
  if (-not $taskEntry.PSIsContainer -and $taskEntry.Extension -in @('.exe','.blockmap')) { Remove-Item -LiteralPath $taskSource -Force }
  else { Move-Item -LiteralPath $taskSource -Destination $taskArchiveFolder }
}
# Old unpacked installers contain runnable copies and native helpers. They are
# disposable verification output, never application data or the installed app.
foreach ($taskOldExecutable in Get-ChildItem -LiteralPath $taskArchiveFolder -Recurse -File -Filter '*.exe') {
  Remove-Item -LiteralPath (Assert-WorkspacePath $taskOldExecutable.FullName) -Force
}
$taskExecutables = @(Get-ChildItem -LiteralPath $taskDist -Recurse -File -Filter '*.exe')
if ($taskExecutables.Count -ne 1 -or $taskExecutables[0].FullName -ne $taskInstaller) { throw 'dist must contain exactly one EXE' }
Write-Output "Only installer in dist: $taskInstaller"
Write-Output "Validated application retained at: $taskPackagedFolder\win-unpacked"
