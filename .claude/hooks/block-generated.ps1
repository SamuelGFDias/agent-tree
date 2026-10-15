$in = [Console]::In.ReadToEnd() | ConvertFrom-Json
$f = [string]$in.tool_input.file_path
if ($f -replace '\\','/' -match '/\.claude-plugin/types/') {
  [Console]::Error.WriteLine('.claude-plugin/types/ e gerado pelo Claude Code e ignorado pelo git; nao edite.')
  exit 2
}