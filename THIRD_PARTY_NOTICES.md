# Third-party notices

## Eufy Clean protocol

Protocol definitions in `proto/` were obtained through [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean), based on [Martijn Poppen's Eufy Clean project](https://github.com/martijnpoppen/eufy-clean).

Copyright (c) Martijn Poppen. The full upstream license is preserved in [proto/LICENSE.md](proto/LICENSE.md), including attribution, modification disclosure, and warranty exclusions. Protocol definitions have not intentionally been changed.

**Modified/derived implementation:** `lib/cloud.mts`, `lib/client.mts`, `lib/protocol.mts`, and the map-rendering portion of `widgets/clean/public/widget.mts` reimplement or adapt the upstream protocol findings in TypeScript/ESM. Changes include Homey-specific lifecycle and state handling, alternate-login validation through usable MQTT credentials, TLS connection checks, bounded decoding, target validation, a new widget, and regression tests. The upstream license applies to derived portions. This project does not imply upstream endorsement.

## Product imagery

`widgets/clean/public/omni-c20.png` is an official Eufy Omni C20 product cutout from Eufy's Shopify CDN. Eufy/Anker retain their image and trademark rights. Resized versions are used in `assets/images/` and `drivers/omni/assets/images/`. The software license does not grant image rights. Permission for App Store redistribution must be reviewed before submission.

Source: https://cdn.shopify.com/s/files/1/1924/1075/files/0000_3840x.png?v=1731394885&width=600

Other UI styling, project icons, and simplified widget previews are new work for this project. Runtime dependencies retain their individual licenses.
