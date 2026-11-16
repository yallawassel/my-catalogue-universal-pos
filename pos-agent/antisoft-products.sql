-- My Catalogue agent query for AntiSoft (SQL Server 2008 R2+, database Data2025)
-- ---------------------------------------------------------------------------
-- READ-ONLY: the agent refuses to run anything except SELECT / WITH.
-- STEP 1: run sql\antisoft-discover-columns.sql in SSMS to see the real column names.
-- STEP 2: replace every  <<...>>  name below with the matching AntiSoft column.
-- STEP 3: run  Run-DryRun.cmd  and check logs\last-dryrun.csv before going live.
--
-- Output columns (names must stay exactly like this, they match config.json "columns"):
--   Barcode, ItemID, SKU, Name, Category, Unit1, Price1, UnitFactor, Stock
-- One row per packaging unit is fine: the agent groups rows with the same ItemID into
-- ONE catalogue product (smallest UnitFactor first) and sends extra unit barcodes as
-- price-only rows. It never creates duplicate products for multi-barcode items.

SELECT
    LTRIM(RTRIM(u.<<UnitBarcodeColumn>>))          AS Barcode,
    CAST(i.<<ItemIdColumn>> AS nvarchar(50))        AS ItemID,
    LTRIM(RTRIM(i.<<ItemCodeColumn>>))              AS SKU,
    LTRIM(RTRIM(i.<<ItemNameColumn>>))              AS Name,
    LTRIM(RTRIM(i.<<GroupOrCategoryColumn>>))       AS Category,
    LTRIM(RTRIM(u.<<UnitNameColumn>>))              AS Unit1,
    u.<<UnitSalePriceColumn>>                       AS Price1,
    u.<<UnitFactorColumn>>                          AS UnitFactor,
    NULL                                            AS Stock      -- e.g. i.<<QtyOnHandColumn>> if you enable includeStock
FROM dbo.ItemFile AS i
JOIN dbo.ItemUnitFile AS u
  ON u.<<ItemIdColumnInUnitFile>> = i.<<ItemIdColumn>>
WHERE ISNULL(LTRIM(RTRIM(u.<<UnitBarcodeColumn>>)), '') <> ''
  -- AND i.<<ActiveFlagColumn>> = 1            -- only items active for sale
ORDER BY i.<<ItemIdColumn>>;
