# Universal POS Compatibility Checker — business admin guide

## What a business owner does

1. Open Admin → POS Connections.
2. Enter the POS software name.
3. Answer where it runs, whether an API exists, whether Excel/CSV export is available, and whether approved read-only local database access exists.
4. Review the recommended method. The recommendation is advisory, not a connection test.
5. Select a method and save the setup profile.
6. Use Excel/CSV import now if that is the available option, or request/setup the required API, local-agent, or custom adapter.

## What saving a profile does

- Stores the POS name, chosen method, compatibility answers, non-secret recommendation metadata, and notes under the signed-in business.
- Keeps the profile in `setup_required` status.
- Does not store credentials.
- Does not connect to a POS.
- Does not start a synchronization job.
- Does not modify catalogue products, units, stock, or reservations.

## Never enter in this page

Do not enter SQL passwords, API tokens, Supabase service-role keys, or other secrets in the notes field. The local-agent credentials must remain on the business PC in a protected configuration. API credentials must be held in a managed server-side secret store.

## Current status

Excel/CSV import is available. API, local Windows agent, and custom adapters need separate development and security testing. AntiSoft remains planned only and is not connected.
