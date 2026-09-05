# Homey App Store release checklist

GitHub publication is separate from Homey App Store certification. This repository is a development preview, not a certified release.

## Required before a public test release

- [ ] Install and pair the new app on Homey 12.3+; verify repair and credential failures.
- [ ] Verify status and the widget on iOS, Android, and web dashboards in light/dark mode.
- [ ] Hardware-test start, pause, resume, stop, dock, locate, and all advertised C20 settings and dock commands.
- [ ] Capture a real map and verify orientation, room IDs, dock/robot positions, restricted zones, and reconnect persistence. Do not advertise reliable live maps before this passes.
- [ ] Test internet loss, broker disconnect, Homey restart, credential expiry, and account removal.
- [ ] Ensure stale data is labeled and no commands are replayed after reconnect.
- [ ] Resolve unexpected C20 warning codes against observed hardware behavior.
- [ ] Review the Eufy product-image redistribution permission and obtain an appropriate image if needed. Current art is provisional developer artwork based on an official product cutout.
- [ ] Replace provisional app-store images with guideline-compliant product/lifestyle artwork, review icons and simplified transparent widget previews.
- [ ] Review upstream attribution and any modified protocol-derived implementation.
- [ ] Coordinate with the existing Eufy Homey app maintainer or obtain Athom agreement on a separate app. Homey's guidelines discourage duplicate-brand integrations. Consider upstreaming compatible improvements.
- [ ] Confirm app ID, public app name, support contact, privacy disclosure, and developer account ownership.
- [ ] Run `npm ci`, `npm run check`, `npm test`, and `homey app validate --level publish`.
- [ ] Create a tagged release and changelog after hardware acceptance.

Only then use `homey app publish` to create a draft and follow Athom's certification/public-test process. Do not automatically submit on CI or GitHub push.

## Documentation consulted

- [Homey Apps SDK](https://apps.developer.homey.app/)
- [TypeScript](https://apps.developer.homey.app/guides/tools/typescript)
- [Native ESM](https://apps.developer.homey.app/guides/using-esm-in-homey-apps)
- [Widgets](https://apps.developer.homey.app/the-basics/widgets)

The `.mts`/`.mjs` layout follows Homey's native ESM support. The minimum version is raised to 12.3.0 because this app includes a dashboard widget.
