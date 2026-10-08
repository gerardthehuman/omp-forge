# Changelog

## 1.0.0

- Add a separate `forge-router` provider targeting the direct remote router, without Forge Desktop or MCP dependencies.
- Authenticate via native OMP `/login` with masked API-key entry and router validation. Store keys in OMP, never in the plugin.
- Keep the curated 11-model roster and synchronize metadata against OpenRouter's public catalog.
- Map reasoning efforts, text/image inputs, tool support, token limits, token/cache prices, and the first long-context pricing tier.
- Ship a generated offline snapshot, refresh stale metadata on startup, and expose `/forge-router sync` and `/forge-router models [id]`.
- Preserve the current catalog on failed or incomplete syncs and update the selected model after successful sync.
- Verify a clean marketplace install, native credential persistence across restart, metadata equality, forced sync, and direct streaming inference.
