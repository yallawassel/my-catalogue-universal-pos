# My Catalogue — read the POS quantity views (READ-ONLY).
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'discover-qty.txt'
$cs = "Server=.;Database=Data2026;Integrated Security=SSPI;Encrypt=False;TrustServerCertificate=True;Connect Timeout=10"
$lines = New-Object System.Collections.Generic.List[string]
function Say($t) { $lines.Add([string]$t); Write-Host $t }
function Query($sql) { $cn = New-Object System.Data.SqlClient.SqlConnection $cs; try { $cn.Open(); $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 120; $cmd.CommandText = "SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; " + $sql; $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd; $t = New-Object System.Data.DataTable; [void]$da.Fill($t); return ,$t } finally { $cn.Close() } }
function Dump($t, $max = 50) { if (-not $t -or $t.Rows.Count -eq 0) { Say '   (no rows)'; return }; $cols = $t.Columns | ForEach-Object { $_.ColumnName }; Say ('   ' + ($cols -join ' | ')); $n = 0; foreach ($r in $t.Rows) { if ($n++ -ge $max) { break }; Say ('   ' + (($cols | ForEach-Object { ([string]$r[$_]).Replace("`r",' ').Replace("`n",' ') }) -join ' | ')) } }
foreach ($v in 'VItemQty','VItemUnitQty','VItemFile','VItemUnit') {
  Say ''; Say "=== $v columns ==="
  try { Dump (Query "SELECT c.name FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.$v') ORDER BY c.column_id") 200 } catch { Say "  error: $($_.Exception.Message)" }
  Say "--- $v rows for ItemID 1, 2, 3, 13 ---"
  try { Dump (Query "SELECT TOP 8 * FROM dbo.[$v] WHERE ItemID IN (1,2,3,13)") 8 } catch { Say "  error: $($_.Exception.Message)" }
}
$lines | Set-Content -Path $out -Encoding UTF8
Write-Host ''; Write-Host "Saved to $out" -ForegroundColor Green
