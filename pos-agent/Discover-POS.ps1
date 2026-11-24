# My Catalogue — POS discovery (READ-ONLY).
# Finds the SQL Server database used by POS on this PC and writes the product/unit table
# columns plus 3 sample rows to discover-report.txt. It only runs SELECT on system views and TOP 3.
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'discover-report.txt'
$lines = New-Object System.Collections.Generic.List[string]
function Say($t) { $lines.Add([string]$t); Write-Host $t }

function Query($cs, $sql) {
  $cn = New-Object System.Data.SqlClient.SqlConnection $cs
  try {
    $cn.Open(); $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 30
    $cmd.CommandText = "SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; " + $sql
    $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd; $t = New-Object System.Data.DataTable; [void]$da.Fill($t); return ,$t
  } finally { $cn.Close() }
}
function Dump($t, $max = 60) {
  if (-not $t -or $t.Rows.Count -eq 0) { Say '   (no rows)'; return }
  $cols = $t.Columns | ForEach-Object { $_.ColumnName }
  Say ('   ' + ($cols -join ' | '))
  $n = 0; foreach ($r in $t.Rows) { if ($n++ -ge $max) { break }; Say ('   ' + (($cols | ForEach-Object { ([string]$r[$_]).Replace("`r",' ').Replace("`n",' ') }) -join ' | ')) }
}

Say "Raffi - POS discovery  $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Say "Computer: $env:COMPUTERNAME   User: $env:USERNAME"
$servers = New-Object System.Collections.Generic.List[string]
foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server\Instance Names\SQL') {
  if (Test-Path $k) { (Get-Item $k).Property | ForEach-Object { if ($_ -eq 'MSSQLSERVER') { $servers.Add('.') } else { $servers.Add(".\$_") } } }
}
foreach ($s in '.\SQLEXPRESS','.','(localdb)\MSSQLLocalDB') { if (-not $servers.Contains($s)) { $servers.Add($s) } }
Say "SQL instances to try: $($servers -join ', ')"

$found = $false
foreach ($srv in $servers) {
  $cs = "Server=$srv;Database=master;Integrated Security=SSPI;Encrypt=False;TrustServerCertificate=True;Connect Timeout=5"
  try { $dbs = Query $cs "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name" } catch { Say "[$srv] cannot connect: $($_.Exception.Message)"; continue }
  Say ''; Say "=== Instance $srv : databases ==="
  foreach ($row in $dbs.Rows) {
    $db = [string]$row.name
    $dcs = "Server=$srv;Database=$db;Integrated Security=SSPI;Encrypt=False;TrustServerCertificate=True;Connect Timeout=5"
    try { $tabs = Query $dcs "SELECT t.name, SUM(p.rows) AS rows FROM sys.tables t JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) WHERE t.name LIKE '%Item%' OR t.name LIKE '%Unit%' OR t.name LIKE '%Group%' OR t.name LIKE '%Categ%' OR t.name LIKE '%Barcode%' OR t.name LIKE '%Stock%' OR t.name LIKE '%Price%' GROUP BY t.name ORDER BY t.name" } catch { Say " - $db (no access: $($_.Exception.Message))"; continue }
    Say " - $db : $($tabs.Rows.Count) product-like tables"
    if ($tabs.Rows.Count -eq 0) { continue }
    $found = $true
    Say ''; Say "##### DATABASE $srv / $db #####"; Dump $tabs 80
    $cols = Query $dcs "SELECT t.name AS tbl, c.name AS col, ty.name AS type FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE t.name IN ('ItemFile','ItemUnitFile','ItemGroupFile','GroupFile','UnitFile','ItemBarcodeFile') OR t.name LIKE '%Barcode%' OR (t.name LIKE 'Item%' AND t.name LIKE '%File') ORDER BY t.name, c.column_id"
    Say ''; Say "--- columns ---"; Dump $cols 600
    foreach ($t in ($cols.Rows | ForEach-Object { $_.tbl } | Select-Object -Unique)) {
      Say ''; Say "--- 3 sample rows of $t ---"
      try { Dump (Query $dcs "SELECT TOP 3 * FROM dbo.[$t]") 3 } catch { Say "   (cannot read: $($_.Exception.Message))" }
    }
  }
}
if (-not $found) { Say ''; Say 'No POS database found with Windows login. We will need the SQL user/password.' }
$lines | Set-Content -Path $out -Encoding UTF8
Write-Host ''; Write-Host "Report saved to $out" -ForegroundColor Green
