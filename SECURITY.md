# Security and private data

Do not post account passwords, bearer tokens, MQTT certificates/private keys, raw cloud responses, serial numbers, or floor maps in public issues.

The integration uses unofficial Eufy cloud endpoints with HTTPS and MQTT TLS certificate validation. Credentials are stored in the Homey device store to support reauthentication; Homey administrators and backups can access them. Cached floor maps and state are private household data. Deleting the paired Homey device removes its store through Homey's normal device lifecycle.

The widget receives status/maps only, never account credentials. Commands are restricted to an explicit allowlist; room/scene IDs must have been reported by the vacuum. MQTT delivery acknowledgement does not imply physical completion. Reconnects do not retry physical commands.

Use a private security report on GitHub if enabled. Otherwise open an issue requesting a private reporting channel without disclosing vulnerability details or credentials.

Ignored development files include `.private/`, `env.json`, `.env*`, local logs, `node_modules/`, and `.homeybuild/`. Review the staged file list before publishing. Public mobile-client identifiers used by the protocol are not user secrets.
