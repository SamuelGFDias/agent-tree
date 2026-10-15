$in = [Console]::In.ReadToEnd() | ConvertFrom-Json
$f = [string]$in.tool_input.file_path
if ($f -notmatch '\.tsx?$') { exit 0 }
if (-not (Test-Path .claude-plugin/types/tsconfig.json)) { exit 0 }
$out = npx --no-install tsc --noEmit -p . 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine($out); exit 2 }