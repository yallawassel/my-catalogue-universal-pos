-- My Catalogue agent query for AntiSoft (database Data2026) — READ-ONLY.
-- One row per AntiSoft item that is not stopped. Units shown online:
--   * item has a Packet AND a Box  -> Unit1 = Packet, Unit2 = Box (the single piece stays in-store only)
--   * otherwise                    -> Unit1 = the item's main unit, Unit2 = its Packet / Box / next bigger unit
--   Pieces1 / Pieces2 = how many main units (AntiSoft base unit) each shown unit holds, e.g. BOX = 270
--   Price1 / Price2   = AntiSoft selling price of that unit (empty = no price in AntiSoft = "price on request")
--   Barcode           = barcode of Unit1 (falls back to the item's first barcode)
--   Stock             = AntiSoft current quantity, in the main unit (negative is shown as sold out)
WITH U AS (
    -- the item's main (base) unit
    SELECT v.ItemID, LTRIM(RTRIM(ISNULL(v.UnitFileName, ''))) AS UName, CAST(1 AS float) AS Qty,
           NULLIF(v.SelPrice, 0) AS Price, b.Barcode, 0 AS IsExtra
    FROM dbo.VItemFile AS v
    OUTER APPLY (
        SELECT TOP 1 LTRIM(RTRIM(x.BarcodeItemID)) AS Barcode
        FROM dbo.ItemUnitFile AS x
        WHERE x.ItemID = v.ItemID AND LTRIM(RTRIM(ISNULL(x.BarcodeItemID, ''))) <> ''
        ORDER BY CASE WHEN LTRIM(RTRIM(ISNULL(x.BarcodeUnitFileName, ''))) = LTRIM(RTRIM(ISNULL(v.UnitFileName, ''))) OR ISNULL(x.BarcodeQty, 1) <= 1 THEN 0 ELSE 1 END,
                 x.ItemUnitFileID
    ) AS b
    WHERE ISNULL(v.IsStopped, 0) = 0
    UNION ALL
    -- bigger packaging units (packet, box, …)
    SELECT x.ItemID, LTRIM(RTRIM(x.BarcodeUnitFileName)), CAST(x.BarcodeQty AS float),
           NULLIF(x.BarcodeSelPrice, 0), NULLIF(LTRIM(RTRIM(ISNULL(x.BarcodeItemID, ''))), ''), 1
    FROM dbo.ItemUnitFile AS x
    JOIN dbo.VItemFile AS v ON v.ItemID = x.ItemID
    WHERE ISNULL(v.IsStopped, 0) = 0 AND x.BarcodeQty > 1
      AND LTRIM(RTRIM(ISNULL(x.BarcodeUnitFileName, ''))) <> ''
      AND LTRIM(RTRIM(x.BarcodeUnitFileName)) <> LTRIM(RTRIM(ISNULL(v.UnitFileName, '')))
)
SELECT
    CAST(v.ItemID AS nvarchar(50))                    AS ItemID,
    LTRIM(RTRIM(v.ItemName))                          AS Name,
    NULLIF(LTRIM(RTRIM(v.CategoryName)), '')          AS Category,
    NULLIF(LTRIM(RTRIM(v.ReferenceID)), '')           AS SKU,
    COALESCE(CASE s.P1 WHEN 'pk' THEN pk.Barcode ELSE b.Barcode END, b.Barcode, pk.Barcode, bx.Barcode) AS Barcode,
    NULLIF(CASE s.P1 WHEN 'pk' THEN pk.UName ELSE b.UName END, '') AS Unit1,
    CASE s.P1 WHEN 'pk' THEN pk.Price ELSE b.Price END           AS Price1,
    CASE s.P1 WHEN 'pk' THEN pk.Qty   ELSE 1 END                 AS Pieces1,
    CASE s.P2 WHEN 'bx' THEN bx.UName WHEN 'pk' THEN pk.UName WHEN 'nx' THEN nx.UName END AS Unit2,
    CASE s.P2 WHEN 'bx' THEN bx.Price WHEN 'pk' THEN pk.Price WHEN 'nx' THEN nx.Price END AS Price2,
    CASE s.P2 WHEN 'bx' THEN bx.Qty   WHEN 'pk' THEN pk.Qty   WHEN 'nx' THEN nx.Qty   END AS Pieces2,
    v.CurrentQte                                      AS Stock
FROM dbo.VItemFile AS v
CROSS APPLY (SELECT TOP 1 * FROM U WHERE U.ItemID = v.ItemID AND U.IsExtra = 0) AS b
OUTER APPLY (SELECT TOP 1 * FROM U WHERE U.ItemID = v.ItemID AND U.IsExtra = 1
             AND (U.UName LIKE 'PK%' OR U.UName LIKE 'PAC%' OR U.UName LIKE 'PCK%') ORDER BY U.Qty) AS pk
OUTER APPLY (SELECT TOP 1 * FROM U WHERE U.ItemID = v.ItemID AND U.IsExtra = 1
             AND (U.UName LIKE 'BOX%' OR U.UName LIKE 'CART%' OR U.UName LIKE 'CTN%')
             AND U.Qty > ISNULL(pk.Qty, 1) ORDER BY U.Qty) AS bx
OUTER APPLY (SELECT TOP 1 * FROM U WHERE U.ItemID = v.ItemID AND U.IsExtra = 1
             ORDER BY CASE WHEN U.Price IS NULL THEN 1 ELSE 0 END, U.Qty) AS nx
CROSS APPLY (SELECT
    CASE WHEN pk.ItemID IS NOT NULL AND bx.ItemID IS NOT NULL THEN 'pk' ELSE 'b' END AS P1,
    CASE WHEN bx.ItemID IS NOT NULL THEN 'bx'
         WHEN pk.ItemID IS NOT NULL THEN 'pk'
         WHEN nx.ItemID IS NOT NULL THEN 'nx' END AS P2) AS s
WHERE ISNULL(v.IsStopped, 0) = 0
ORDER BY v.ItemID;
