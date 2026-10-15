# Machining Optimizer — installable PWA

A static Progressive Web App (PWA) for the existing single-material GPR machining optimizer. It runs the exported model directly in the browser using JavaScript; no Python server is required at runtime. After the first successful visit, the service worker caches the interface and model so the calculator can work offline.

## Files
- `index.html`, `styles.css`, `app.js`: responsive dark-theme interface and client-side optimizer.
- `model.json`: trained GPR parameters exported from the existing Android project.
- `manifest.webmanifest`, `icon.svg`: install metadata and icon.
- `sw.js`: offline cache.

## Inputs and outputs
Inputs: total target machining depth (mm), tool diameter (mm), optional cutting path length per pass (mm).
Outputs: DOC option, pass count, final pass DOC, spindle speed (RPM), feed rate (mm/min), average predicted power (kW), and optional total predicted energy (kWh).

If cutting length is omitted, candidates are ranked by average predicted power. If supplied, candidates are ranked by total estimated energy. Energy assumes equal cutting path length per pass and uses predicted power multiplied by estimated cutting time. Power is not summed across passes.

## Publish online (free static hosting)
PWA installation and service workers require HTTPS (or localhost). Do not open `index.html` directly from the file manager and expect install/offline features to work.

### GitHub Pages
1. Create a GitHub repository, e.g. `machining-optimizer`.
2. Upload all files in this folder to the repository root. Do not upload only the ZIP; the files must be at the root (or update the Pages path accordingly).
3. In the repository, open **Settings → Pages**. Select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
4. Wait for deployment. Open the HTTPS URL GitHub Pages gives you, first while online.
5. On Android, open that URL in Chrome. Use the visible Install button if offered, or Chrome menu (⋮) → **Install app** / **Add to Home screen**.
6. Open it once after installation while online so the model and app assets are cached. Then test airplane mode.

### Other static hosts
Upload the folder contents to any HTTPS static host that serves JSON and JavaScript files, such as Netlify or Cloudflare Pages. No build command is needed; publish directory is the folder containing `index.html`.

## Important limitations
- This is a client-side PWA, not a native APK. It is installed through the browser and can be removed like other apps.
- The app's offline behavior is available after a successful online load and service-worker cache installation.
- The optimizer retains the existing model parameters and candidate settings; it does not retrain the model in the browser.
- Validate all recommendations against actual machine/tool limits and the dataset's training range before real machining.
