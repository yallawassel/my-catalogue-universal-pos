-- Run in SQL Server Management Studio on the POS database (read-only, changes nothing).
-- It lists the columns of the product & unit tables so you can fill pos-products.sql.
USE Data2025;
SELECT t.name AS table_name, c.column_id, c.name AS column_name, ty.name AS data_type, c.max_length
FROM sys.tables t
JOIN sys.columns c  ON c.object_id = t.object_id
JOIN sys.types  ty ON ty.user_type_id = c.user_type_id
WHERE t.name IN ('ItemFile','ItemUnitFile')
   OR t.name LIKE '%Group%' OR t.name LIKE '%Categ%' OR t.name LIKE '%Stock%' OR t.name LIKE '%Barcode%'
ORDER BY t.name, c.column_id;

-- Look at a few real rows (read-only):
SELECT TOP 10 * FROM dbo.ItemFile;
SELECT TOP 10 * FROM dbo.ItemUnitFile;
