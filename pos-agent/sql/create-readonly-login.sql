-- Create a dedicated READ-ONLY login for the My Catalogue agent.
-- Run in SSMS as a SQL Server administrator. Change the password first!
-- The agent must NEVER use the normal POS 'dbo'/'sa' account.
USE master;
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'mc_readonly')
    CREATE LOGIN mc_readonly WITH PASSWORD = 'Change-This-Strong#Password-2026', CHECK_POLICY = ON, DEFAULT_DATABASE = Data2025;
GO
USE Data2025;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'mc_readonly')
    CREATE USER mc_readonly FOR LOGIN mc_readonly;
GO
-- Allow reading ONLY the tables the agent needs (add your group/stock table if used):
GRANT SELECT ON dbo.ItemFile     TO mc_readonly;
GRANT SELECT ON dbo.ItemUnitFile TO mc_readonly;
-- Explicitly deny every kind of change:
DENY INSERT, UPDATE, DELETE, EXECUTE, ALTER, REFERENCES ON SCHEMA::dbo TO mc_readonly;
GO
-- Verify: all "can_*" columns must be 0 and can_select must be 1.
EXECUTE AS LOGIN = 'mc_readonly';
SELECT HAS_PERMS_BY_NAME('dbo.ItemFile','OBJECT','SELECT') AS can_select,
       HAS_PERMS_BY_NAME('dbo.ItemFile','OBJECT','UPDATE') AS can_update,
       HAS_PERMS_BY_NAME('dbo.ItemFile','OBJECT','DELETE') AS can_delete,
       HAS_PERMS_BY_NAME('dbo.ItemFile','OBJECT','INSERT') AS can_insert;
REVERT;
