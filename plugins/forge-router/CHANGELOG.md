# Changelog

## 1.0.2

- Move provider, catalog discovery, mapper, and existing regressions to strict TypeScript under `src/`.
- Build committed `dist/index.js` through the shared Bun/Turbo workspace; update the OMP manifest to load the bundle.
- Verify native login, live discovery of 22 metadata records and 19 chat models, specialized metadata inspection, credential persistence, and streaming inference from a dependency-free compiled snapshot.

## 1.0.1

- Replace the fixed roster and shipped snapshot with authenticated router API discovery, enriched by OpenRouter's `output_modalities=all` catalog.
- Register text-output models only; keep image, video, and decision metadata inspectable and list non-chat IDs in sync output.
- Discard legacy text-only upstream caches; retain OMP's native discovered-model cache for offline/failure fallback.
- Force availability and metadata refresh on `/forge-router sync`; refresh the selected model from the registry and report removed models.
- Verify fresh-profile native login, persistence across restart, 22 live metadata records, 19 chat picker models, all three specialized inspections, selected-model refresh, and direct streaming inference.

## 1.0.0

- Add a separate `forge-router` provider targeting the direct remote router, without Forge Desktop or MCP dependencies.
- Authenticate via native OMP `/login` with masked API-key entry and router validation. Store keys in OMP, never in the plugin.
- Keep the curated 11-model roster and synchronize metadata against OpenRouter's public catalog.
- Map reasoning efforts, text/image inputs, tool support, token limits, token/cache prices, and the first long-context pricing tier.
- Ship a generated offline snapshot, refresh stale metadata on startup, and expose `/forge-router sync` and `/forge-router models [id]`.
- Preserve the current catalog on failed or incomplete syncs and update the selected model after successful sync.
- Verify a clean marketplace install, native credential persistence across restart, metadata equality, forced sync, and direct streaming inference.
