# My Catalogue Universal POS — v7 release notes

## Added
- Universal POS compatibility checker in Admin → POS Connections.
- Connection methods: Excel/CSV, vendor API, local Windows agent, and custom integration.
- Recommended method based on the POS environment and available export/API/database access.
- Business-scoped connection profiles saved without secrets or credentials.
- Saved profile list with clear setup-required status.
- Direct shortcut to the existing Excel/CSV import workflow.
- Additive Supabase migration for connection profiles and future sync-job association.

## Not activated
- No API connector is active.
- No Windows local agent is included or active.
- AntiSoft is not connected.
- No automatic sync schedule is enabled; profiles default to manual.
- No stock quantities or reservation settings are changed.

## Upgrade
1. Back up the **My Catalogue staging** Supabase project.
2. Run `UNIVERSAL_POS_CONNECTIONS_V7_MIGRATION.sql` in that project only.
3. Upload the v7 project files to the existing private GitHub repository.
4. Test Admin → POS Connections using a test POS profile name. Do not enter credentials.
5. Confirm that the profile appears with `Setup required` status.

Do not run this migration in White Pack's live project. Do not run any SQL against AntiSoft.
