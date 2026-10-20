# Forge Router for OMP

A standalone `forge-router` provider at `https://forge.forgeworkspace.dev/functions/v1/forge-api/v1`. No Forge Desktop, local descriptor, or MCP dependency. See the [root README](../../README.md#install) for installation.

## Setup

1. Restart OMP, run `/login`, and select Forge Router (API key).
2. Enter your key in the masked prompt; login validates it against the router.
3. Run `/forge-router sync` to populate the chat and judge catalogs.

OMP stores the credential; `/logout` removes it. Keys never enter plugin files or OpenRouter requests. Use the terminal UI for login because OMP RPC refuses secret prompts. There is no environment-key fallback.

`FORGE_ROUTER_BASE_URL` overrides the URL before startup; include its `/v1` path. Remove any obsolete `providers.forge-router` block from `agent/models.yml` after migrating its key into OMP, since a hardcoded key can override saved credentials.

## Usage

```text
/forge-router sync          Discover models and refresh the selected model
/forge-router models [id]   Inspect raw metadata and timestamps
```

```sh
omp --model forge-router/openai/gpt-6-luna --thinking low
```

Use `/extended-context on` for full advertised windows where OMP caps context at a pricing threshold.

### Judge role

After rebuilding/updating the plugin, restart OMP and run `/forge-router sync` to replace the cached chat-only catalog. In OMP's model browser, assign `forge-router/typesafe/jev-1.13` to the **Judge** role. The plugin exposes Jev to native judgment consumers, including eval `judge()`, auto-thinking, and TTSR judgment; it does not change your existing role assignment.

```sh
omp models forge-router --kind judge
```

Jev uses the router's `/v1/decisions` endpoint, not chat completions. It never enters the chat picker.

## Models and pricing

- The authenticated router API controls availability; there is no hardcoded roster or shipped snapshot. Sync adds new IDs, removes absent IDs, and reports selected-model removal.
- Metadata comes from the public [all-modality OpenRouter catalog](https://openrouter.ai/api/v1/models?output_modalities=all), joined by exact ID. No OpenRouter key is needed.
- Text-output models enter the chat picker; decision-output models register with `openrouter-decisions` for the native Judge role.
- Image/video metadata stays inspectable. Forge Router currently returns 404 for OMP's image endpoints (`/v1/images`, `/v1/images/generations`) and video endpoint (`/v1/videos`). OMP also has no native video role. These models are not registered as executable roles: image support needs a compatible Forge endpoint or an OMP adapter, and video needs both an endpoint and a native role/tool.
- Every ID requires upstream metadata; registered chat/judge models also require valid prices, modalities, and limits. Invalid discovery preserves the previous catalog rather than inventing defaults. An empty or unsupported-only catalog clears the registered models.
- OMP maps names, limits, text/image inputs, tools, reasoning efforts, and token/cache prices with the first context-price tier. Extra fields remain available through metadata inspection.

Prices are OpenRouter estimates, not Forge billing. Costs convert dollars/token to dollars/million tokens.

## Caching

The plugin saves the last validated router catalog under `<OMP agent directory>/cache/forge-router/startup-catalog-<scope>.json`. Snapshots are scoped to the router endpoint and credential hash, contain no credential, and are written atomically with owner-only permissions.

At startup, the plugin registers that catalog before OMP selects the default model, without waiting for network requests. Stale snapshots remain usable offline. After session startup, it refreshes router availability in the background and replaces the registered catalog. Failed refreshes retain the last catalog; successful empty catalogs clear it. Without a valid snapshot, an authenticated first launch discovers models before default-model selection.

Public upstream metadata is cached separately in `openrouter.json` for 24 hours, with cached fallback when OpenRouter is unavailable. `/forge-router sync` forces both router discovery and upstream metadata refresh and updates the selected model. The plugin also publishes its snapshot into OMP's native model cache.
