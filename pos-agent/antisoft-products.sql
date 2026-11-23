-- My Catalogue agent query for AntiSoft (database Data2026) — READ-ONLY.
-- One row per AntiSoft item that is not stopped:
--   ItemID      = AntiSoft item number (links each catalogue product to AntiSoft)
--   Name        = item name            Category = AntiSoft category
--   SKU         = ReferenceID          Barcode  = first barcode of the item (ItemUnitFile)
--   Unit1/Price1= base unit (PCS, PKTS…) and its selling price (0 = price on request)
--   Unit2/Price2= first bigger unit that has its own selling price (e.g. BOX, KG)
--   Stock       = current quantity in the base unit (negative is shown as sold out)
SELECT
    CAST(v.ItemID AS nvarchar(50))                    AS ItemID,
    LTRIM(RTRIM(v.ItemName))                          AS Name,
    NULLIF(LTRIM(RTRIM(v.CategoryName)), '')          AS Category,
    NULLIF(LTRIM(RTRIM(v.ReferenceID)), '')           AS SKU,
    bc.Barcode                                        AS Barcode,
    NULLIF(LTRIM(RTRIM(v.UnitFileName)), '')          AS Unit1,
    NULLIF(v.SelPrice, 0)                             AS Price1,
    u2.Unit2                                          AS Unit2,
    u2.Price2                                         AS Price2,
    v.CurrentQte                                      AS Stock
FROM dbo.VItemFile AS v
OUTER APPLY (
    SELECT TOP 1 LTRIM(RTRIM(x.BarcodeItemID)) AS Barcode
    FROM dbo.ItemUnitFile AS x
    WHERE x.ItemID = v.ItemID AND LTRIM(RTRIM(ISNULL(x.BarcodeItemID, ''))) <> ''
    ORDER BY x.ItemUnitFileID
) AS bc
OUTER APPLY (
    SELECT TOP 1 LTRIM(RTRIM(y.BarcodeUnitFileName)) AS Unit2, y.BarcodeSelPrice AS Price2
    FROM dbo.ItemUnitFile AS y
    WHERE y.ItemID = v.ItemID AND y.BarcodeSelPrice > 0
      AND LTRIM(RTRIM(ISNULL(y.BarcodeUnitFileName, ''))) <> ''
      AND LTRIM(RTRIM(y.BarcodeUnitFileName)) <> LTRIM(RTRIM(ISNULL(v.UnitFileName, '')))
    ORDER BY y.BarcodeQty
) AS u2
WHERE ISNULL(v.IsStopped, 0) = 0
ORDER BY v.ItemID;
