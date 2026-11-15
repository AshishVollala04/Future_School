# Publishing FutureSchool to Google Play (PWA + Trusted Web Activity)

FutureSchool is configured as an installable Progressive Web App (PWA):
- Manifest: `/manifest.webmanifest`
- App icons: `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-maskable-512.png`, `/icons/icon-180.png`
- Service worker: `/sw.js` (caches static shell and `/offline.html`; never caches `/api/*` requests)
- Digital Asset Links: `/.well-known/assetlinks.json`

## Option A: Trusted Web Activity (TWA) with Bubblewrap (Recommended)

1. **Deploy the production web app (`Frontend/`) over HTTPS** on your custom domain (e.g. `https://app.futureschool.in`).
2. **Initialize the Android project with Bubblewrap**:
   ```bash
   npx @bubblewrap/cli init --manifest https://app.futureschool.in/manifest.webmanifest
   ```
   - Package ID: `in.futureschool.app` (must match `Frontend/public/.well-known/assetlinks.json`)
   - App name: `FutureSchool`
   - Display mode: `standalone`
3. **Build the signed Android App Bundle (`.aab`)**:
   ```bash
   npx @bubblewrap/cli build
   ```
4. **Update Digital Asset Links (`/.well-known/assetlinks.json`)**:
   - In Google Play Console → **Setup → App integrity → App signing**, copy the **App signing key certificate SHA-256 fingerprint**.
   - Paste it into `Frontend/public/.well-known/assetlinks.json` replacing `REPLACE_WITH_PLAY_CONSOLE_APP_SIGNING_SHA256_FINGERPRINT` and redeploy `Frontend/`.
   - Confirm `https://app.futureschool.in/.well-known/assetlinks.json` returns `200 OK` (`application/json`) so the browser address bar is hidden inside Android.
5. **Upload `app-release-bundle.aab`** to Google Play Console (Internal testing → Closed testing → Production).

## Option B: Capacitor Wrapper (Needed only for native SDK plugins)

If you later add native Bluetooth thermal printers or offline SQLite:
```bash
cd Frontend
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init FutureSchool in.futureschool.app --web-dir dist
npm run build
npx cap add android
npx cap open android
```
