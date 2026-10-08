# Changelog

## 1.0.1

- Move the plugin into the `omp-forge` marketplace at `plugins/forge`.
- Bundle MCP dependencies into committed `dist/mcp.mjs` for fresh marketplace installations without `node_modules`.
- Preserve bundled dependency licenses in `THIRD_PARTY_NOTICES.md` and keep build dependencies pinned in `bun.lock`.
- Verify a clean marketplace install, 17 live models, raw metadata inspection, refresh, 131 MCP tools, EOF cleanup, and a real read-only MCP call through OMP.

## 1.0.0

- Register the Forge provider from `/providers` and its authoritative model catalog from `/models`, discovered through `~/.forge/server.json`.
- Map names, context/output limits, text/image inputs, tool support, reasoning efforts, token/cache prices, and one long-context pricing tier into OMP.
- Expose complete Forge metadata, including speed and cost bands, with `/forge models [model-id]`. OMP does not preserve arbitrary metadata on its native model objects.
- Add Forge MCP through a plugin-owned stdio bridge to the endpoint returned by `/mcp`. Preserve protocol messages, tools, resources, prompts, and notifications without copying credentials into OMP configuration.
- Add `/forge refresh` to reload the provider and selected model. After restarting Forge, also run `/mcp reload`, or restart OMP.
- Respect existing model roles and extended-context preferences. `/extended-context on` permits the advertised context windows where OMP otherwise caps them at long-context pricing thresholds.

Local development: `omp plugin link ~/Projects/omp-forge/plugins/forge`. Marketplace install: `omp plugin install forge@omp-forge` after adding the marketplace. Bun is required on PATH. `FORGE_SERVER_FILE` can override the default descriptor path.

OMP 18.6.1 CLI requires separate model/thinking flags for extension providers: `--model forge/openai/gpt-6-luna --thinking low`. The combined `--model …:low` form can fail before extensions load. Configured model-role selectors retain their existing syntax.

Verified against OMP 18.6.1 and Forge 0.2.254: 17 registered models, real inference, raw metadata and refresh commands, 121 MCP tools, matching resources/prompts, read-only `knowledge_search` through OMP, and bridge EOF cleanup.
