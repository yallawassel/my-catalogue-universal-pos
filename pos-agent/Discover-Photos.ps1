# My Catalogue - where does POS keep item pictures? (READ-ONLY: only reads, never changes anything)
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'discover-photos.txt'
$cs = "Server=.;Database=Data2026;Integrated Security=SSPI;Encrypt=False;TrustServerCertificate=True;Connect Timeout=10"
$lines = New-Object System.Collections.Generic.List[string]
function Say($t) { $lines.Add([string]$t); Write-Host $t }
function Query($sql, $db = 'Data2026') { $cn = New-Object System.Data.SqlClient.SqlConnection ($cs -replace 'Database=Data2026', "Database=$db"); try { $cn.Open(); $cmd = $cn.CreateCommand(); $cmd.CommandTimeout = 120; $cmd.CommandText = "SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; " + $sql; $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd; $t = New-Object System.Data.DataTable; [void]$da.Fill($t); return ,$t } catch { Say ('   ! ' + $_.Exception.Message); return $null } finally { $cn.Close() } }
function Dump($t, $max = 60) { if (-not $t -or $t.Rows.Count -eq 0) { Say '   (no rows)'; return }; $cols = $t.Columns | ForEach-Object { $_.ColumnName }; Say ('   ' + ($cols -join ' | ')); $n = 0; foreach ($r in $t.Rows) { if ($n++ -ge $max) { break }; Say ('   ' + (($cols | ForEach-Object { $v = [string]$r[$_]; if ($v.Length -gt 160) { $v = $v.Substring(0,160) + '...' }; $v.Replace("`r",' ').Replace("`n",' ') }) -join ' | ')) } }

Say "=== Databases on this server ==="
Dump (Query "SELECT name, create_date FROM sys.databases WHERE database_id > 4 ORDER BY name" 'master')

Say ''; Say "=== Tables whose name looks like pictures ==="
Dump (Query "SELECT s.name + '.' + t.name AS tbl, (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id=t.object_id AND p.index_id IN (0,1)) AS rows_ FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE t.name LIKE '%pic%' OR t.name LIKE '%photo%' OR t.name LIKE '%image%' OR t.name LIKE '%img%' OR t.name LIKE '%foto%' ORDER BY 1")

Say ''; Say "=== Picture-like columns (binary, or named pic/photo/image/path) ==="
$cols = Query "SELECT s.name AS sch, t.name AS tbl, c.name AS col, ty.name AS typ FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE ty.name IN ('image','varbinary','binary') OR c.name LIKE '%pic%' OR c.name LIKE '%photo%' OR c.name LIKE '%image%' OR c.name LIKE '%img%' OR c.name LIKE '%path%' OR c.name LIKE '%foto%' ORDER BY t.name, c.name"
Dump $cols 200
Say ''; Say "=== How many rows have something in each of those columns ==="
if ($cols) {
  foreach ($r in $cols.Rows) {
    $full = "[" + $r.sch + "].[" + $r.tbl + "]"; $c = "[" + $r.col + "]"
    if ($r.typ -in @('image','varbinary','binary')) {
      $t = Query "SELECT COUNT(*) AS filled, MAX(DATALENGTH($c)) AS max_bytes FROM $full WHERE $c IS NOT NULL AND DATALENGTH($c) > 100"
    } else {
      $t = Query "SELECT COUNT(*) AS filled, MAX(CAST($c AS nvarchar(400))) AS example FROM $full WHERE $c IS NOT NULL AND LTRIM(RTRIM(CAST($c AS nvarchar(400)))) <> ''"
    }
    if ($t -and $t.Rows.Count -and [int]$t.Rows[0].filled -gt 0) { Say ("   " + $r.tbl + "." + $r.col + " (" + $r.typ + "): " + $t.Rows[0].filled + " filled - " + $t.Rows[0][1]) }
  }
}

Say ''; Say "=== Columns of ItemFile ==="
Dump (Query "SELECT c.name AS col, ty.name AS typ FROM sys.columns c JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID('dbo.ItemFile') ORDER BY c.column_id") 200

Say ''; Say "=== Where POS is installed (running programs) ==="
$dirs = New-Object System.Collections.Generic.List[string]
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -match 'anti|soft' -and $_.Path -notmatch '\\Windows\\|Microsoft|Google|Mozilla|Claude') } | ForEach-Object { Say ('   ' + $_.ProcessName + ' -> ' + $_.Path); $d = Split-Path $_.Path; if (-not $dirs.Contains($d)) { $dirs.Add($d) } }
foreach ($root in @('C:\', 'D:\', 'E:\')) { if (Test-Path $root) { Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'anti' } | ForEach-Object { if (-not $dirs.Contains($_.FullName)) { $dirs.Add($_.FullName) } } } }
foreach ($pf in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData)) { if ($pf -and (Test-Path $pf)) { Get-ChildItem $pf -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'anti' } | ForEach-Object { if (-not $dirs.Contains($_.FullName)) { $dirs.Add($_.FullName) } } } }
foreach ($d in $dirs) { Say ('   folder: ' + $d) }

Say ''; Say "=== Pictures saved in the last 3 hours (POS folders, Documents, Pictures, Desktop) ==="
$since = (Get-Date).AddHours(-3)
$search = @($dirs) + @([Environment]::GetFolderPath('MyDocuments'), [Environment]::GetFolderPath('MyPictures'), [Environment]::GetFolderPath('Desktop'))
$found = 0
foreach ($d in $search) {
  if (-not $d -or -not (Test-Path $d)) { continue }
  Get-ChildItem $d -Recurse -File -ErrorAction SilentlyContinue -Include *.jpg, *.jpeg, *.png, *.bmp, *.gif, *.webp |
    Where-Object { $_.LastWriteTime -gt $since -and $_.FullName -notmatch 'MyCatalogueAgent' } | Select-Object -First 30 |
    ForEach-Object { $found++; Say ('   ' + $_.LastWriteTime.ToString('HH:mm') + '  ' + [math]::Round($_.Length / 1KB) + ' KB  ' + $_.FullName) }
}
if ($found -eq 0) { Say '   (none found)' }
Say ''; Say "=== Most recent pictures in your POS folders (any date) ==="
foreach ($d in $dirs) {
  Get-ChildItem $d -Recurse -File -ErrorAction SilentlyContinue -Include *.jpg, *.jpeg, *.png, *.bmp | Sort-Object LastWriteTime -Descending | Select-Object -First 10 |
    ForEach-Object { Say ('   ' + $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm') + '  ' + $_.FullName) }
}
$lines | Set-Content -Path $out -Encoding UTF8
Write-Host ''; Write-Host "Saved to $out" -ForegroundColor Green
