# My Catalogue — find where AntiSoft keeps item quantities (READ-ONLY, SELECT on system views + TOP 3).
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'discover-stock.txt'
$cs = "Server=.;Database=Data2026;Integrated Security=SSPI;Encrypt=False;TrustServerCertificate=True;Connect Timeout=10"
$lines = New-Object System.Collections.Generic.List[string]
function Say($t) { $lines.Add([string]$t); Write-Host $t }
function Query($sql) { $cn = New-Object System.Data.SqlClient.SqlConnection $cs; try { $cn.Open(); $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 60; $cmd.CommandText = "SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; " + $sql; $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd; $t = New-Object System.Data.DataTable; [void]$da.Fill($t); return ,$t } finally { $cn.Close() } }
function Dump($t, $max = 200) { if (-not $t -or $t.Rows.Count -eq 0) { Say '   (no rows)'; return }; $cols = $t.Columns | ForEach-Object { $_.ColumnName }; Say ('   ' + ($cols -join ' | ')); $n = 0; foreach ($r in $t.Rows) { if ($n++ -ge $max) { break }; Say ('   ' + (($cols | ForEach-Object { ([string]$r[$_]).Replace("`r",' ').Replace("`n",' ') }) -join ' | ')) } }

Say "=== All tables with rows ==="
Dump (Query "SELECT t.name, SUM(p.rows) AS rows FROM sys.tables t JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) GROUP BY t.name HAVING SUM(p.rows) > 0 ORDER BY t.name") 400
Say ''; Say "=== Views ==="
Dump (Query "SELECT name FROM sys.views ORDER BY name") 400
Say ''; Say "=== Columns that look like quantities (tables and views) ==="
Dump (Query "SELECT o.type_desc, o.name AS obj, c.name AS col FROM sys.columns c JOIN sys.objects o ON o.object_id=c.object_id WHERE o.type IN ('U','V') AND (c.name LIKE '%Qty%' OR c.name LIKE '%Qte%' OR c.name LIKE '%Quant%' OR c.name LIKE '%Stock%' OR c.name LIKE '%Balance%') ORDER BY o.name, c.column_id") 400
Say ''; Say "=== Stored procedures / functions with Inventory or Stock in the name ==="
Dump (Query "SELECT type_desc, name FROM sys.objects WHERE type IN ('P','FN','IF','TF') AND (name LIKE '%Invent%' OR name LIKE '%Stock%' OR name LIKE '%Qty%' OR name LIKE '%Qte%' OR name LIKE '%Store%') ORDER BY name") 200
$lines | Set-Content -Path $out -Encoding UTF8
Write-Host ''; Write-Host "Saved to $out" -ForegroundColor Green
