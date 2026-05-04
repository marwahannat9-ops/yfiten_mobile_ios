# yfiten_mobile_ios

iOS build of the **Yfiten** mobile app (Capacitor 6, web layer in `www/`).
Same source as the Android app — this repository is configured for
[Codemagic](https://codemagic.io/) to produce iOS builds for iPhone & iPad.

- **Bundle ID:** `com.yfiten.phone`
- **Deployment target:** iOS 13.0
- **Devices:** iPhone + iPad (universal)
- **Web bundle:** `www/` (built from `src/app.js` via esbuild)

## Codemagic workflows

`codemagic.yaml` defines two workflows:

| Workflow | Purpose | Requires |
| --- | --- | --- |
| `ios-unsigned` | Sanity-check the build pipeline. Produces an unsigned `.app`. | Nothing — runs out of the box. |
| `ios-testflight` | Signed IPA uploaded to TestFlight. | App Store Connect API key + signing certificate set up in Codemagic UI. |

### One-time TestFlight setup in Codemagic

1. Connect this repo in Codemagic (`Apps → Add application`).
2. **Teams → Integrations → Developer Portal**: add an App Store Connect API
   key. Note the integration name (e.g. `app_store_connect`).
3. **Code signing identities → iOS certificates**: let Codemagic auto-fetch
   from App Store Connect, or upload a `.p12` + provisioning profile manually.
4. In `codemagic.yaml`, confirm the `app_store_connect` integration name and
   the bundle id (`com.yfiten.phone`) match your App Store Connect app record.
5. Run the `ios-testflight` workflow.

## Local build

```bash
npm install            # JS deps
npm run build          # Bundle web layer to www/js/app.js
npx cap sync ios       # Copy web → iOS, run pod install (macOS only)
npx cap open ios       # Open in Xcode
```

`npx cap sync ios` requires macOS + Xcode + CocoaPods. On Windows, push to
this repo and let Codemagic do the build.
