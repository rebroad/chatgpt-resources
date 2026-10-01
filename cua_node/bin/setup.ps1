Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-NonEmptyFile {
  param([Parameter(Mandatory)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Item -LiteralPath $Path).Length -eq 0) {
    throw "missing file path=$Path"
  }
}

function Assert-Directory {
  param([Parameter(Mandatory)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw "missing directory path=$Path"
  }
}

function Invoke-Checked {
  param([Parameter(Mandatory)][scriptblock]$Command)

  $Output = & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "native command failed LASTEXITCODE=$LASTEXITCODE"
  }
  $Output
}

$runtime_root = Split-Path -Parent $PSScriptRoot
$runtime_manifest = Join-Path $runtime_root 'manifest.json'
$node_path = Join-Path $runtime_root 'bin/node'
$node_repl_path = Join-Path $runtime_root 'bin/node_repl'
$node_modules = Join-Path $runtime_root 'lib/node_modules'
$node_bin_dir = Split-Path -Parent $node_path

Assert-NonEmptyFile $runtime_manifest
Assert-NonEmptyFile $node_path
Assert-NonEmptyFile $node_repl_path
Assert-Directory (Join-Path $node_modules '@oai\sky')
$windows_helper_name = if ('x64' -eq 'arm64') { 'codex-computer-use-arm64.exe' } else { 'codex-computer-use.exe' }
Assert-NonEmptyFile (Join-Path $node_modules "@oai\sky\bin\windows\$windows_helper_name")
Assert-NonEmptyFile (Join-Path $node_modules '@oai\sky\dist\project\cua\sky_js\src\targets\windows\internal\helper_transport.js')
foreach ($node_launcher in @('corepack.cmd', 'npm.cmd', 'npx.cmd')) {
  Assert-NonEmptyFile (Join-Path $node_bin_dir $node_launcher)
}
foreach ($node_package_manager in @('corepack', 'npm')) {
  Assert-Directory (Join-Path $node_modules $node_package_manager)
}

# node parsed require(node:fs) (without quotes)
# keep string quotes literal for --eval to node.exe
# https://sb.gateway.fleet-research-sci-hub-1.internal.fleet.openai.org/?profile=strawberry&experiment_id=noahj-qbs-973706-windows-fixed-contextual-260530-a&fetch_recent=1&experiment_filters=noahj-.%2A&recent_sample_limit=3000&sample_id=ca5d9ed0de5ca1afe6326054c62a95f9
$node_binary_version = Invoke-Checked {
  & $node_path --eval "const fs = require('node:fs'); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).node_binary_version);" $runtime_manifest
}
if ((Invoke-Checked { & $node_path --version }).Trim() -ne "v${node_binary_version}") {
  throw "node version mismatch node_path=$node_path node_binary_version=$node_binary_version"
}
foreach ($node_launcher in @('corepack.cmd', 'npm.cmd', 'npx.cmd')) {
  Invoke-Checked { & (Join-Path $node_bin_dir $node_launcher) --version } | Out-Null
}

$validation_dir = Join-Path ([IO.Path]::GetTempPath()) ("node-repl-validate-" + [Guid]::NewGuid().ToString("N"))
$validation_node_modules = Join-Path $validation_dir 'node_modules'
New-Item -ItemType Directory -Force -Path $validation_dir | Out-Null
New-Item -ItemType Junction -Path $validation_node_modules -Target $node_modules | Out-Null
Push-Location $validation_dir
try {
  Invoke-Checked { & $node_path --input-type=module --eval "const imported = await import('@oai/sky'); if (!imported.sky) throw new Error('@oai/sky missing sky export');" } | Out-Null
} finally {
  Pop-Location
  Invoke-Checked { & cmd.exe /c rmdir $validation_node_modules } | Out-Null
  Remove-Item -LiteralPath $validation_dir -Recurse -Force
}
Invoke-Checked { & $node_repl_path --help } | Out-Null
Write-Output "validated node_path=$node_path node_repl_path=$node_repl_path node_modules=$node_modules"
