# Client-branded installation update

Enables business-specific PWA branding for Business Admin and Public Catalogue.

## Client setup
1. In Business Admin → Settings, upload the company logo and save.
2. Open `admin.html?shop=BUSINESS-SLUG` or `index.html?shop=BUSINESS-SLUG`.
3. Use **Install Business Admin** / **Install App** when Chrome offers installation. Otherwise Chrome menu → Add to Home screen. On iPhone/iPad: Safari Share → Add to Home Screen.
4. After changing the logo, remove the old shortcut/app and reinstall to refresh its icon.

Platform Admin remains private and platform-owner branded.

## Upload
Replace `admin.html`, `index.html`, and `manifest.webmanifest` in the repository root. Keep `saas.js`, `icon-192.png`, and `icon-512.png` beside them. No database migration is needed; existing `logo_url` and `primary_color` fields are used.

Dynamic business-specific manifests are generated in-browser from the saved business profile. Some browsers cache installed icons; reinstall after logo changes.
