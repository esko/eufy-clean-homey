# Eufy Clean Studio for Homey

A TypeScript + native ESM Homey app for the **Eufy Omni C20 (T2280)**, with a dashboard built around the vacuum, its floor map, and its dock.

**Development preview — not yet in the Homey App Store.** This is an independent, unofficial integration. It requires Eufy's cloud and is not a local-only client.

## Features implemented

- Battery percentage, activity, charging state, warnings, and last-run area/duration.
- Start, pause, resume, stop, return to dock, and locate commands.
- Suction, water level, cleaning mode, and intensity controls.
- Reported room selection and named cleaning scenes.
- Dock mop washing/drying and dust-emptying commands.
- Light/dark dashboard with the actual Omni C20 product image, floor-map snapshots, zoom, robot/dock positions, and reported restricted zones.
- Flow actions, account repair, MQTT TLS, bounded reconnect backoff, credential refresh, and state persistence.

Features are enabled from reported device data where possible. Command delivery to MQTT is **not** proof that the vacuum performed the action. Do not rely on this preview for unattended cleaning.

## Verification status

The preceding protocol investigation confirmed live Omni C20 MQTT access, battery at 100%, charging completion, cleaning parameters, run statistics, dock connectivity, warnings, and a named scene. The new standalone app still needs end-to-end installation/pairing and hardware command testing. Automated tests cover protocol encoding, battery scale, enum defaults, input validation, and offline command rejection.

Maps are received passively from Eufy's map stream. No map snapshot has yet been confirmed on the target C20 with this new app. Opening the vacuum map in Eufy Clean may trigger a snapshot; availability is firmware/account-dependent. Missing data is shown explicitly, never replaced with a demonstration floor plan. Incremental map frames, map editing, zone drawing, multi-floor selection, and cleaning-history map archives are not implemented yet. Model-specific support for advanced settings/dock actions remains to be verified.

## Development

Requires Node.js 22+ and Homey CLI. Homey 12.3.0+ on a local platform (including Self-Hosted) is required for the widget.

```sh
npm ci
npm run check
npm test
npm run build
npm run assets
npx --package=homey homey app validate --path . --level publish
npx --package=homey homey app install --path .
```

Homey's SDK is provided by Homey at runtime. `.mts` files compile to native `.mjs` in `.homeybuild`; there is no CommonJS wrapper. The Homey CLI builds and copies static assets/protobuf files into the deployment directory. `npm run build` alone only compiles TypeScript.

After installation, add an Omni C20 device and sign in using your Eufy account email/password. Add **Vacuum overview** to a dashboard, and select the paired vacuum in widget settings. Existing Eufy apps/devices are not modified or removed.

## Structure

| Path | Purpose |
| --- | --- |
| `lib/cloud.mts` | Eufy login fallback, device discovery, MQTT certificates |
| `lib/client.mts` | TLS MQTT lifecycle, state intake and command transport |
| `lib/protocol.mts` | Protobuf command validation and bounded map decoding |
| `drivers/omni/` | Homey pairing, capabilities, persistence and repair |
| `widgets/clean/` | Widget API and TypeScript frontend |
| `proto/` | Attributed upstream protocol definitions |
| `tests/` | Offline protocol/state regression tests |

## Privacy and publication

Account credentials are kept in Homey's device store, not in widget responses or this repository. Homey administrators and backups may have access to that store; it is not a hardware-backed secret vault. Cached maps and device state also remain on Homey. Cloud tokens, MQTT certificates, and private keys are held in memory. The app does not add analytics or send data to a third-party service beyond Eufy.

See [SECURITY.md](SECURITY.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [PUBLISHING.md](PUBLISHING.md). The public mobile-client identifiers in the login implementation are upstream protocol constants, not user account secrets.

Inspired by [jeppesens/eufy-clean for Home Assistant](https://github.com/jeppesens/eufy-clean) and [Martijn Poppen's Eufy Clean protocol work](https://github.com/martijnpoppen/eufy-clean). Eufy and Homey are trademarks of their respective owners; this project is not endorsed by them.
