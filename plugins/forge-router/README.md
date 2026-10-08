# Forge Router for OMP

A standalone `forge-router` provider. Inference goes directly to `https://forge.forgeworkspace.dev/functions/v1/forge-api/v1`; Forge Desktop and `~/.forge/server.json` are not used. This plugin adds no MCP server.

## Install and authenticate

```sh
omp plugin marketplace add OWNER/omp-forge
omp plugin install forge-router@omp-forge
```

Replace `OWNER` with the repository's GitHub owner after publication. For the local marketplace, use `omp plugin marketplace add ~/Projects/omp-forge` instead. Restart OMP, run `/login`, select **Forge Router (API key)**, and paste your router API key into the masked prompt. The plugin checks the key with the router's `/models` endpoint. OMP stores the credential under `forge-router` using its native credential storage. `/logout` removes it. Keys are never written into this plugin or sent to OpenRouter.

Set `FORGE_ROUTER_BASE_URL` before starting OMP to use a different direct OpenAI-compatible router URL, including its `/v1` path. Login validates against that same URL. Authentication uses native `/login` credentials only, not an environment-key fallback. OMP 18.6.1 RPC refuses secret prompts; use the terminal UI for login. The standalone `omp login` command does not load this extension's provider.

```sh
omp --model forge-router/openai/gpt-6-luna --thinking low
```

Do not leave an older `providers.forge-router` definition in `agent/models.yml`: its hardcoded key can override the saved login. Migrate the credential into OMP and remove that obsolete provider block. Other provider settings and model roles need not change.

## Metadata

- `roster.json` deliberately keeps the earlier curated 11 models, including GPT-6 Sol. Router `/v1/models` is used for key validation, not discovery.
- Metadata comes from the public [OpenRouter catalog](https://openrouter.ai/api/v1/models). No OpenRouter key is required.
- A generated `catalog.json` ships with the plugin so authentication and model selection work before the first sync or offline.
- Startup refreshes metadata older than 24 hours. Successful syncs are cached atomically in `<OMP agent directory>/cache/forge-router/catalog.json`.
- Failed/partial syncs preserve the last catalog. Every curated ID must be present and valid before replacement.
- `/forge-router sync` forces a fresh fetch and replaces the current selected router model as well as registry metadata. It never expands the model roster.
- `/forge-router models [id]` exposes the raw upstream metadata and its fetch timestamp.

Mapped metadata: name, context/output limits, text/image inputs, tool support, reasoning effort levels, token/cache prices, and the first context-price tier. Prices are converted from dollars/token to dollars/million tokens. `none` reasoning maps to OMP's separate off control, not an effort level. Unsupported input modalities, additional tiers, mandatory reasoning flags, and other raw metadata remain inspectable but are not added as new OMP capabilities.

**Prices are OpenRouter upstream estimates, not Forge billing.** Catalog prices replace the old bundled peak/off-peak estimates rather than combining two different sources. `/extended-context on` permits full context windows where OMP otherwise caps them at the long-context pricing threshold.

To change the curated set, update `roster.json` and regenerate the shipped snapshot with the corresponding OpenRouter rows. New router models are not enabled automatically.

## Verification

Verified with OMP 18.6.1 and Bun 1.4.2:

- Fresh marketplace installation without runtime dependencies or a desktop descriptor.
- Native login callback requests secret input, validates a real key, and stores an API-key credential.
- Saved credential survives OMP restart; remote streaming inference returns the requested response.
- All 11 models match OpenRouter prices, tiers, output limits, input modalities, and reasoning efforts.
- Forced sync and raw metadata inspection through OMP.
- Offline stale-cache startup and failed/partial-sync preservation.

Run mapper regression tests from the repository root:

```sh
bun test plugins/forge-router/models.test.mjs
```
