# My Catalogue - show everything POS stores for ONE item (READ-ONLY: only reads, never changes anything)
param([string]$ItemId = '540')
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'discover-item.txt'
$cs = "Server=.;Database=Data2026;Integrated Security=SSPI;Encrypt=False;TrustServerCertificate=True;Connect Timeout=10"
$lines = New-Object System.Collections.Generic.List[string]
function Say($t) { $lines.Add([string]$t); Write-Host $t }
function Query($sql) { $cn = New-Object System.Data.SqlClient.SqlConnection $cs; try { $cn.Open(); $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 120; $cmd.CommandText = "SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; " + $sql; $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd; $t = New-Object System.Data.DataTable; [void]$da.Fill($t); return ,$t } catch { Say ('   ! ' + $_.Exception.Message); return $null } finally { $cn.Close() } }
Say "=== Everything stored for item $ItemId (only filled values) ==="
$tables = Query "SELECT DISTINCT s.name AS sch, o.name AS obj, o.type AS typ FROM sys.columns c JOIN sys.objects o ON o.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=o.schema_id WHERE c.name='ItemID' AND o.type IN ('U','V') ORDER BY o.type, o.name"
if (-not $tables) { return }
foreach ($t in $tables.Rows) {
  $full = "[" + $t.sch + "].[" + $t.obj + "]"
  $rows = Query "SELECT TOP 20 * FROM $full WHERE CAST(ItemID AS nvarchar(50)) = '$ItemId'"
  if (-not $rows -or $rows.Rows.Count -eq 0) { continue }
  Say ''; Say ("--- " + $t.obj + " (" + $(if ($t.typ.Trim() -eq 'V') { 'view' } else { 'table' }) + "), " + $rows.Rows.Count + " row(s)")
  $n = 0
  foreach ($r in $rows.Rows) {
    $n++; $parts = @()
    foreach ($c in $rows.Columns) {
      $v = $r[$c.ColumnName]
      if ($v -is [DBNull] -or $v -eq $null) { continue }
      $s = [string]$v
      if ($s.Trim() -eq '' -or $s -eq '0' -or $s -eq '0.00' -or $s -eq 'False') { continue }
      if ($v -is [byte[]]) { $s = '(binary ' + $v.Length + ' bytes)' }
      if ($s.Length -gt 80) { $s = $s.Substring(0, 80) + '...' }
      $parts += ($c.ColumnName + '=' + $s)
    }
    Say ("  [" + $n + "] " + ($parts -join ' | '))
  }
}
$lines | Set-Content -Path $out -Encoding UTF8
Write-Host ''; Write-Host "Saved to $out" -ForegroundColor Green
