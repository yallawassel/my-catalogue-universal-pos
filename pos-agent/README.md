# My Catalogue — Live POS agent (Windows)

Sends products and prices from your POS to your online catalogue automatically.
**One-way and read-only**: it never writes to your POS. It never deletes catalogue products and
it keeps your catalogue names, photos, descriptions and categories.

## What you need
- Windows PC that can reach the POS database (or the POS export folder) and the internet
- PowerShell 5.1 (built into Windows 10/11 and Windows Server 2016+)
- A connector key from **Admin → Live POS connector**

## Setup (AntiSoft / SQL Server)
1. Copy this `pos-agent` folder to the POS PC, e.g. `C:\MyCatalogueAgent`.
2. In SQL Server Management Studio run `sql\create-readonly-login.sql` (change the password first).
   The verify query at the end must show `can_select = 1` and all other columns `0`.
3. In Admin → Live POS connector create a key and press **Download config.json**.
   Save it into this folder and replace `CHANGE_ME` in the connection string with the read-only password.
4. Run `sql\antisoft-discover-columns.sql` to see your AntiSoft column names and fill every
   `<<...>>` placeholder in `antisoft-products.sql`.
5. Double-click `Test-Connection.cmd` → it must say *Connected to "<your business>"*.
6. Double-click `Run-DryRun.cmd`. Nothing is saved. Open `logs\last-dryrun.csv` and check every row:
   `update` = price will change · `new` = new product · `unchanged` · `skip` (with the reason).
7. When the dry run looks right, set `"autoApply": true` in `config.json`.
8. Right-click `Install-Schedule.cmd` → **Run as administrator**. It syncs every 15 minutes.
   Remove it any time with `Uninstall-Schedule.cmd`.

## Setup (any POS that exports CSV)
Set `"source": "csv"`, point `csv.folder` to the export folder and set the `columns` names to
the headers used by your export. Each processed file is moved to a `processed` sub-folder.

## Options in config.json
| Setting | Meaning |
|---|---|
| `syncMode` | `price` = only update prices of existing products · `full` = also add new products |
| `markupPercent` | `10` = online prices 10 % above POS · `-5` = 5 % discount |
| `includeStock` | send stock (key must allow stock, units must have verified conversions) |
| `autoApply` | scheduled task applies changes only when `true` (otherwise dry run) |
| `groupUnitsByProduct` | merge rows with the same ItemID into one product (recommended for AntiSoft) |

## Safety built in
- Queries containing INSERT, UPDATE, DELETE, EXEC, DROP, ALTER, CREATE, INTO … are refused.
- Reads use `READ UNCOMMITTED` so AntiSoft is never blocked.
- Only one run at a time; unchanged data is not re-sent.
- The connector key can be revoked instantly from Admin.
- Logs are kept 30 days in `logs\`.
