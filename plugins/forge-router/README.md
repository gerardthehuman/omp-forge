# Forge Router for OMP

A standalone `forge-router` provider at `https://forge.forgeworkspace.dev/functions/v1/forge-api/v1`. No Forge Desktop, local descriptor, or MCP dependency. See the [root README](../../README.md#install) for installation.

## Setup

1. Restart OMP, run `/login`, and select Forge Router (API key).
2. Enter your key in the masked prompt; login validates it against the router.
3. Run `/forge-router sync` to populate the model picker.

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

## Models and pricing

- The authenticated router API controls availability; there is no hardcoded roster or shipped snapshot. Sync adds new IDs, removes absent IDs, and reports selected-model removal.
- Metadata comes from the public [all-modality OpenRouter catalog](https://openrouter.ai/api/v1/models?output_modalities=all), joined by exact ID. No OpenRouter key is needed.
- Only text-output models enter the chat picker. Image, video, and decision metadata stays inspectable; the plugin does not execute those APIs.
- Every ID requires upstream metadata; chat models also require valid prices, modalities, and limits. Invalid discovery preserves the previous catalog rather than inventing defaults. Empty or non-chat-only catalogs clear the picker.
- OMP maps names, limits, text/image inputs, tools, reasoning efforts, and token/cache prices with the first context-price tier. Extra fields remain available through metadata inspection.

Prices are OpenRouter estimates, not Forge billing. Costs convert dollars/token to dollars/million tokens.

## Caching

OMP caches discovered chat models for 24 hours and retains the previous catalog on discovery failure. Upstream metadata is cached at `<OMP agent directory>/cache/forge-router/openrouter.json`, with cached fallback when OpenRouter is unavailable. `/forge-router sync` forces both discovery and metadata refresh.
