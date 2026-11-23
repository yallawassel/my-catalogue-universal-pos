# My Catalogue — how AntiSoft items use packets/boxes (READ-ONLY).
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'discover-units.txt'
$cs = "Server=.;Database=Data2026;Integrated Security=SSPI;Encrypt=False;TrustServerCertificate=True;Connect Timeout=10"
$lines = New-Object System.Collections.Generic.List[string]
function Say($t) { $lines.Add([string]$t); Write-Host $t }
function Query($sql) { $cn = New-Object System.Data.SqlClient.SqlConnection $cs; try { $cn.Open(); $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 120; $cmd.CommandText = "SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; " + $sql; $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd; $t = New-Object System.Data.DataTable; [void]$da.Fill($t); return ,$t } finally { $cn.Close() } }
function Dump($t, $max = 80) { if (-not $t -or $t.Rows.Count -eq 0) { Say '   (no rows)'; return }; $cols = $t.Columns | ForEach-Object { $_.ColumnName }; Say ('   ' + ($cols -join ' | ')); $n = 0; foreach ($r in $t.Rows) { if ($n++ -ge $max) { break }; Say ('   ' + (($cols | ForEach-Object { ([string]$r[$_]).Replace("`r",' ').Replace("`n",' ') }) -join ' | ')) } }
Say "=== Base unit of items (ItemFile.UnitFileName) ==="
Dump (Query "SELECT UnitFileName, COUNT(*) AS items FROM dbo.ItemFile WHERE ISNULL(IsStopped,0)=0 GROUP BY UnitFileName ORDER BY 2 DESC")
Say ''; Say "=== Extra units (ItemUnitFile) by name ==="
Dump (Query "SELECT BarcodeUnitFileName, COUNT(*) AS rows_, SUM(CASE WHEN BarcodeSelPrice>0 THEN 1 ELSE 0 END) AS with_price, MIN(BarcodeQty) AS min_qty, MAX(BarcodeQty) AS max_qty FROM dbo.ItemUnitFile GROUP BY BarcodeUnitFileName ORDER BY 2 DESC")
Say ''; Say "=== How many extra units per item ==="
Dump (Query "SELECT n AS extra_units, COUNT(*) AS items FROM (SELECT ItemID, COUNT(*) n FROM dbo.ItemUnitFile GROUP BY ItemID) x GROUP BY n ORDER BY n")
Say ''; Say "=== Items with 2 or more extra units (first 40) ==="
Dump (Query "SELECT TOP 200 i.ItemID, i.ItemName, i.UnitFileName AS base_unit, i.SelPrice AS base_price, u.BarcodeUnitFileName AS unit, u.BarcodeQty AS qty, u.BarcodeSelPrice AS unit_price, u.BarcodeItemID AS barcode FROM dbo.ItemFile i JOIN dbo.ItemUnitFile u ON u.ItemID=i.ItemID WHERE i.ItemID IN (SELECT ItemID FROM dbo.ItemUnitFile GROUP BY ItemID HAVING COUNT(*)>=2) ORDER BY i.ItemID, u.BarcodeQty") 120
Say ''; Say "=== 40 items with exactly 1 extra unit ==="
Dump (Query "SELECT TOP 40 i.ItemID, i.ItemName, i.UnitFileName AS base_unit, i.SelPrice AS base_price, u.BarcodeUnitFileName AS unit, u.BarcodeQty AS qty, u.BarcodeSelPrice AS unit_price FROM dbo.ItemFile i JOIN dbo.ItemUnitFile u ON u.ItemID=i.ItemID WHERE i.ItemID IN (SELECT ItemID FROM dbo.ItemUnitFile GROUP BY ItemID HAVING COUNT(*)=1) ORDER BY i.ItemID") 40
$lines | Set-Content -Path $out -Encoding UTF8
Write-Host ''; Write-Host "Saved to $out" -ForegroundColor Green
