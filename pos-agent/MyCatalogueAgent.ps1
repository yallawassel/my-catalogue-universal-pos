<#
  My Catalogue - Live POS agent (v8)
  -----------------------------------
  Reads products/prices from your POS (SQL Server read-only login, or CSV export folder)
  and sends them to your My Catalogue store through the mc-pos-connector endpoint.

  ONE-WAY & READ-ONLY: this script never writes to the POS database. SQL queries that contain
  INSERT/UPDATE/DELETE/EXEC/... are refused before they run, and reads use READ UNCOMMITTED
  so the POS is never blocked.

  Usage (PowerShell 5.1+ on Windows):
    .\MyCatalogueAgent.ps1 -Ping        # test the connector key
    .\MyCatalogueAgent.ps1 -DryRun      # preview: shows what WOULD change, saves nothing
    .\MyCatalogueAgent.ps1 -Apply       # apply changes now
    .\MyCatalogueAgent.ps1 -Scheduled   # used by the scheduled task: applies only if "autoApply": true
#>
[CmdletBinding()]
param(
  [switch]$Ping,
  [switch]$DryRun,
  [switch]$Apply,
  [switch]$Scheduled,
  [string]$Config = "config.json"
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Invariant = [Globalization.CultureInfo]::InvariantCulture

# ---------- config & logging ----------
$cfgPath = if ([IO.Path]::IsPathRooted($Config)) { $Config } else { Join-Path $here $Config }
if (-not (Test-Path $cfgPath)) { Write-Host "config.json not found. Download it from Admin > Live POS connector." -ForegroundColor Red; exit 2 }
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$logDir = if ($cfg.logFolder) { Join-Path $here $cfg.logFolder } else { Join-Path $here 'logs' }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("agent-" + (Get-Date -Format 'yyyy-MM-dd') + ".log")
function Log([string]$msg, [string]$color = 'Gray') {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "  " + $msg
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Host $line -ForegroundColor $color
}
# keep 30 days of logs
Get-ChildItem $logDir -Filter 'agent-*.log' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -ErrorAction SilentlyContinue

# Single instance (a slow run must not overlap the next scheduled run)
$mutex = New-Object System.Threading.Mutex($false, "Global\MyCataloguePosAgent")
if (-not $mutex.WaitOne(0)) { Log "Another sync is still running. Skipping this run." 'Yellow'; exit 0 }

function Post-Connector($body) {
  $json = $body | ConvertTo-Json -Depth 6 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $headers = @{ 'x-connector-key' = $cfg.connectorKey; 'apikey' = $cfg.apikey }
  try {
    return Invoke-RestMethod -Uri $cfg.endpoint -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 180
  } catch {
    $detail = $_.ErrorDetails.Message
    if (-not $detail -and $_.Exception.Response) { try { $detail = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {} }
    throw ("Connector request failed: " + $_.Exception.Message + " " + $detail)
  }
}

function Num($v) {
  if ($null -eq $v -or $v -is [DBNull]) { return $null }
  $s = ([string]$v).Trim() -replace '[\s$]', ''
  if ($s -eq '') { return $null }
  if ($s -match '^\-?\d{1,3}(\.\d{3})+,\d+$') { $s = $s -replace '\.', '' -replace ',', '.' }   # 1.234,50
  elseif ($s -match '^\-?\d+,\d+$') { $s = $s -replace ',', '.' }                               # 12,50
  else { $s = $s -replace ',', '' }                                                             # 1,234.50
  $d = 0.0
  if ([double]::TryParse($s, [Globalization.NumberStyles]::Float, $Invariant, [ref]$d)) { return [math]::Round($d, 4) }
  return $null
}
function Txt($v) { if ($null -eq $v -or $v -is [DBNull]) { return '' } return ([string]$v).Trim() }

# ---------- read source ----------
function Read-SqlServer {
  $qf = Join-Path $here $cfg.sqlServer.queryFile
  if (-not (Test-Path $qf)) { throw "Query file not found: $qf" }
  $query = Get-Content $qf -Raw -Encoding UTF8
  $clean = [regex]::Replace($query, '(--[^\r\n]*)|(/\*[\s\S]*?\*/)', ' ')
  $forbidden = '\b(insert|update|delete|merge|drop|alter|create|truncate|exec|execute|grant|revoke|deny|backup|restore|dbcc|shutdown|kill|openrowset|opendatasource|into|xp_\w+|sp_\w+)\b'
  if ($clean -match $forbidden) { throw "SAFETY STOP: the query contains a forbidden keyword ('" + $Matches[1] + "'). Only read-only SELECT queries are allowed." }
  if ($clean -match '<<') { throw "Open your query file and replace every <<...>> placeholder with your real POS column names (run sql\pos-discover-columns.sql to see them)." }
  if ($clean.Trim() -notmatch '^(?i)(select|with)\b') { throw "SAFETY STOP: the query must start with SELECT or WITH." }
  $conn = New-Object System.Data.SqlClient.SqlConnection($cfg.sqlServer.connectionString)
  $conn.Open()
  try {
    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = if ($cfg.sqlServer.timeoutSeconds) { [int]$cfg.sqlServer.timeoutSeconds } else { 60 }
    $cmd.CommandText = "SET NOCOUNT ON; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;`n" + $query
    $table = New-Object System.Data.DataTable
    $reader = $cmd.ExecuteReader()
    $table.Load($reader)
    $reader.Close()
    $rows = @()
    foreach ($r in $table.Rows) {
      $o = @{}
      foreach ($c in $table.Columns) { $o[$c.ColumnName] = $r[$c.ColumnName] }
      $rows += New-Object PSObject -Property $o
    }
    return ,$rows
  } finally { $conn.Close() }
}

$script:csvFile = $null
function Read-CsvFolder {
  $folder = $cfg.csv.folder
  if (-not (Test-Path $folder)) { throw "Export folder not found: $folder" }
  $pattern = if ($cfg.csv.pattern) { $cfg.csv.pattern } else { '*.csv' }
  $file = Get-ChildItem -Path $folder -Filter $pattern -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $file) { return ,@() }
  # wait until the POS has finished writing the file
  if ($file.LastWriteTime -gt (Get-Date).AddSeconds(-20)) { Log "Newest export is still being written, waiting for next run." 'Yellow'; return ,@() }
  $script:csvFile = $file.FullName
  $delim = if ($cfg.csv.delimiter) { [string]$cfg.csv.delimiter } else { ',' }
  $enc = if ($cfg.csv.encoding) { $cfg.csv.encoding } else { 'UTF8' }
  Log ("Reading export file " + $file.Name)
  return ,@(Import-Csv -Path $file.FullName -Delimiter $delim -Encoding $enc)
}

# ---------- map to connector items ----------
function Col($row, $name) {
  if (-not $name) { return $null }
  $p = $row.PSObject.Properties | Where-Object { $_.Name -ieq $name } | Select-Object -First 1
  if ($p) { return $p.Value } return $null
}
function Map-Rows($rows) {
  $c = $cfg.columns
  $items = New-Object System.Collections.ArrayList
  foreach ($r in $rows) {
    $item = [ordered]@{
      barcode        = Txt (Col $r $c.barcode)
      pos_product_id = Txt (Col $r $c.posProductId)
      sku            = Txt (Col $r $c.sku)
      name           = Txt (Col $r $c.name)
      category       = Txt (Col $r $c.category)
      description    = Txt (Col $r $c.description)
      unit1          = Txt (Col $r $c.unit1)
      price1         = Num (Col $r $c.price1)
      unit2          = Txt (Col $r $c.unit2)
      price2         = Num (Col $r $c.price2)
      unit_factor    = Num (Col $r $c.unitFactor)
      pieces1        = Num (Col $r $(if ($c.pieces1) { $c.pieces1 } else { 'Pieces1' }))
      pieces2        = Num (Col $r $(if ($c.pieces2) { $c.pieces2 } else { 'Pieces2' }))
    }
    if ($cfg.includeStock) { $item.stock_qty = Num (Col $r $c.stock) }
    if ($item.barcode -or $item.pos_product_id -or $item.sku) { [void]$items.Add($item) }
  }
  # POS-style data has one row per packaging unit. Group them into ONE product
  # (smallest unit first) so the catalogue never gets duplicate products per barcode.
  if ($cfg.groupUnitsByProduct -ne $false) {
    $grouped = New-Object System.Collections.ArrayList
    $byId = $items | Where-Object { $_.pos_product_id } | Group-Object { $_.pos_product_id }
    foreach ($g in $byId) {
      $units = @($g.Group | Sort-Object @{ Expression = { if ($null -eq $_.unit_factor) { 1e9 } else { $_.unit_factor } } }, @{ Expression = { $_.price1 } })
      $first = $units[0]
      $merged = [ordered]@{}
      foreach ($k in $first.Keys) { $merged[$k] = $first[$k] }
      if ($units.Count -gt 1 -and -not $first.unit2) { $merged.unit2 = $units[1].unit1; $merged.price2 = $units[1].price1 }
      [void]$grouped.Add($merged)
      # extra units are sent as price-only rows matched by their own unit barcode
      for ($i = 1; $i -lt $units.Count; $i++) {
        if ($units[$i].barcode -and $units[$i].barcode -ne $first.barcode) {
          [void]$grouped.Add([ordered]@{ barcode = $units[$i].barcode; unit1 = $units[$i].unit1; price1 = $units[$i].price1; unit_only = $true })
        }
      }
    }
    foreach ($it in ($items | Where-Object { -not $_.pos_product_id })) { [void]$grouped.Add($it) }
    $items = $grouped
  }
  foreach ($it in $items) { $it.Remove('unit_factor') }
  return ,$items
}

# ---------- product photos from the POS (e.g. POS Pics\PicsItem) ----------
function Get-PhotoBytes([string]$path) {
  # resize to max 1200 px and save as JPEG (white background), so the catalogue stays fast
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile($path)
  try {
    $s = [Math]::Min(1.0, 1200.0 / [Math]::Max($img.Width, $img.Height))
    $w = [Math]::Max(1, [int]($img.Width * $s)); $h = [Math]::Max(1, [int]($img.Height * $s))
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $w, $h); $g.Dispose()
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]84)
    $ms = New-Object IO.MemoryStream
    $bmp.Save($ms, $codec, $ep); $bmp.Dispose()
    return ,$ms.ToArray()
  } finally { $img.Dispose() }
}
function Sync-Photos($rows, [bool]$isDry) {
  if ($cfg.syncPhotos -eq $false) { return }
  $col = if ($cfg.columns.pic) { $cfg.columns.pic } else { 'Pic' }
  $folder = if ($cfg.photosFolder) { $cfg.photosFolder } else { 'C:\Program Files\AntiSoft\Pics\PicsItem' }
  $idCol = $cfg.columns.posProductId
  $withPic = @($rows | Where-Object { $p = Col $_ $col; $p -and -not ($p -is [DBNull]) -and ([string]$p).Trim() -ne '' })
  if ($withPic.Count -eq 0) { return }
  $stateFile = Join-Path $logDir 'photos-sent.json'
  $state = @{}
  if (Test-Path $stateFile) { try { (Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $state[$_.Name] = [string]$_.Value } } catch {} }
  $todo = New-Object System.Collections.ArrayList; $missing = 0
  foreach ($r in $withPic) {
    $id = Txt (Col $r $idCol); $pic = ([string](Col $r $col)).Trim()
    if (-not $id) { continue }
    $path = if ([IO.Path]::IsPathRooted($pic)) { $pic } else { Join-Path $folder ([IO.Path]::GetFileName($pic)) }
    if (-not (Test-Path -LiteralPath $path)) { $missing++; continue }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA1).Hash.Substring(0, 16)
    if ($state[$id] -ne $hash) { [void]$todo.Add(@{ id = $id; path = $path; hash = $hash }) }
  }
  Log ("Photos: " + $withPic.Count + " item(s) have a picture, " + $todo.Count + " new or changed" + $(if ($missing) { ", $missing file(s) not found in $folder" } else { '' }))
  if ($isDry -or $todo.Count -eq 0) { return }
  $sent = 0; $kept = 0; $failed = 0
  foreach ($t in ($todo | Select-Object -First 150)) {
    try {
      $bytes = $null
      try { $bytes = Get-PhotoBytes $t.path } catch {
        # Windows could not open it (e.g. a WebP picture, or a file with the wrong extension):
        # send the original file as it is when it is a JPEG / PNG / WebP of reasonable size
        $raw = [IO.File]::ReadAllBytes($t.path)
        $isWebp = $raw.Length -gt 12 -and $raw[8] -eq 0x57 -and $raw[9] -eq 0x45 -and $raw[10] -eq 0x42 -and $raw[11] -eq 0x50
        $isJpg = $raw.Length -gt 3 -and $raw[0] -eq 0xFF -and $raw[1] -eq 0xD8
        $isPng = $raw.Length -gt 3 -and $raw[0] -eq 0x89 -and $raw[1] -eq 0x50
        if (($isWebp -or $isJpg -or $isPng) -and $raw.Length -le 2900000) { $bytes = $raw }
        else { throw ("this picture format cannot be read (" + [IO.Path]::GetFileName($t.path) + "). Save it again as JPG in your POS.") }
      }
      $res = Post-Connector @{ action = 'photo'; pos_product_id = $t.id; hash = $t.hash; image_base64 = [Convert]::ToBase64String($bytes) }
      if ($res.status -eq 'updated' -or $res.status -eq 'unchanged') { $sent++; $state[$t.id] = $t.hash }
      elseif ($res.status -eq 'kept') { $kept++; $state[$t.id] = $t.hash }
      else { $failed++ }
    } catch { $failed++; Log ("  ! photo for item " + $t.id + ": " + $_.Exception.Message) 'Red' }
  }
  ([pscustomobject]$state) | ConvertTo-Json -Compress | Set-Content -Path $stateFile -Encoding UTF8
  Log ("Photos: $sent uploaded, $kept kept (catalogue already has its own photo), $failed not done") 'Cyan'
}

# ---------- main ----------
try {
  if (-not $cfg.connectorKey -or $cfg.connectorKey -notmatch '^mcpos_') { throw "Put your connector key in config.json (connectorKey)." }
  $pong = Post-Connector @{ action = 'ping' }
  Log ("Connected to '" + $pong.business.name + "' with key '" + $pong.key.name + "' (" + $pong.key.permission + ")") 'Green'
  if ($Ping) { exit 0 }

  $isDry = $true
  if ($Apply) { $isDry = $false }
  elseif ($Scheduled) { $isDry = -not [bool]$cfg.autoApply; if ($isDry) { Log "autoApply is false in config.json, running as DRY RUN only." 'Yellow' } }

  $rows = if ($cfg.source -eq 'csv') { Read-CsvFolder } else { Read-SqlServer }
  Log ("Read " + $rows.Count + " row(s) from " + $cfg.source)
  if ($rows.Count -eq 0) { Log "Nothing to send."; exit 0 }
  $items = Map-Rows $rows
  # unit-only rows only carry a price for an extra packaging barcode
  foreach ($it in $items) { if ($it.unit_only) { $it.Remove('unit_only'); $it.name = '' } }
  Log ("Prepared " + $items.Count + " item(s)")
  # on a dry run also save exactly what would be sent (units, prices, sizes, stock) for checking
  if ($isDry) { $items | ForEach-Object { [pscustomobject]$_ } | Export-Csv -Path (Join-Path $logDir 'last-items.csv') -NoTypeInformation -Encoding UTF8 }

  # pictures first: they are checked file by file, so they are not covered by the 'unchanged' skip below
  try { Sync-Photos $rows $isDry } catch { Log ("Photos skipped: " + $_.Exception.Message) 'Yellow' }

  # Skip unchanged data on scheduled runs (saves bandwidth & server work)
  $stateFile = Join-Path $logDir 'last-sent.hash'
  $payloadHash = [BitConverter]::ToString((New-Object Security.Cryptography.SHA256Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes(($items | ConvertTo-Json -Depth 4 -Compress)))) -replace '-', ''
  if (-not $isDry -and $Scheduled -and (Test-Path $stateFile) -and ((Get-Content $stateFile -Raw).Trim() -eq $payloadHash)) { Log "POS data unchanged since last successful sync. Nothing to do."; exit 0 }

  $mode = if ($cfg.syncMode -eq 'price') { 'price' } else { 'full' }
  $total = @{ received = 0; updated = 0; added = 0; unchanged = 0; skipped = 0; stock_updates = 0; errors = 0 }
  $allRows = @()
  $batch = 2000
  for ($s = 0; $s -lt $items.Count; $s += $batch) {
    $chunk = @($items[$s..([math]::Min($s + $batch, $items.Count) - 1)])
    $res = Post-Connector @{ action = 'sync'; dry_run = $isDry; sync_mode = $mode; markup_pct = [double]$cfg.markupPercent; include_stock = [bool]$cfg.includeStock; source = 'local_agent'; items = $chunk }
    foreach ($k in @($total.Keys)) { if ($res.summary.$k) { $total[$k] += [int]$res.summary.$k } }
    if ($res.rows) { $allRows += $res.rows | ForEach-Object { $_.i = [int]$_.i + $s; $_ } }
    if ($res.errors) { $res.errors | ForEach-Object { Log ("  ! " + $_) 'Red' } }
  }
  $label = if ($isDry) { 'DRY RUN (nothing saved)' } else { 'APPLIED' }
  Log ("$label  received=" + $total.received + "  update=" + $total.updated + "  new=" + $total.added + "  unchanged=" + $total.unchanged + "  skipped=" + $total.skipped + "  stock=" + $total.stock_updates + "  errors=" + $total.errors) 'Cyan'
  $report = Join-Path $logDir ($(if ($isDry) { 'last-dryrun.csv' } else { 'last-sync.csv' }))
  $allRows | Select-Object @{n='Row';e={$_.i + 1}}, action, name, match, reason, @{n='changes';e={ if ($_.changes) { ($_.changes | ConvertTo-Json -Compress) } }} | Export-Csv -Path $report -NoTypeInformation -Encoding UTF8
  Log ("Detailed report: " + $report)
  if ($isDry) { $allRows | Where-Object { $_.action -ne 'unchanged' } | Select-Object -First 25 action, name, reason | Format-Table -AutoSize | Out-String | Write-Host }

  if (-not $isDry -and $total.errors -eq 0) {
    Set-Content -Path $stateFile -Value $payloadHash
    if ($script:csvFile) {
      $done = Join-Path (Split-Path $script:csvFile) 'processed'
      New-Item -ItemType Directory -Force -Path $done | Out-Null
      Move-Item -Path $script:csvFile -Destination (Join-Path $done ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + (Split-Path $script:csvFile -Leaf))) -Force
    }
  }
  exit 0
} catch {
  Log ("ERROR: " + $_.Exception.Message) 'Red'
  exit 1
} finally {
  $mutex.ReleaseMutex() | Out-Null
}
