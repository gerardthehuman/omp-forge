# Forge Router for OMP

A standalone `forge-router` provider targeting `https://forge.forgeworkspace.dev/functions/v1/forge-api/v1`. No Forge Desktop, `server.json`, or MCP dependency.

## Install and authenticate

```sh
omp plugin marketplace add OWNER/omp-forge
omp plugin install forge-router@omp-forge
```

Replace `OWNER` after GitHub publication, or add `~/Projects/omp-forge` as the local marketplace. Restart OMP, run `/login`, select **Forge Router (API key)**, and paste your key into the masked prompt. Login validates it against the router's `/models` endpoint. OMP stores the API-key credential under `forge-router`; `/logout` removes it. Keys never enter plugin files or OpenRouter requests.

After login, run `/forge-router sync` to populate the model picker immediately. New installations require authenticated online discovery: there is no hardcoded roster or shipped model snapshot.

`FORGE_ROUTER_BASE_URL` overrides the direct URL before startup. Include the endpoint's `/v1` path. Native `/login` credentials are used, with no env-key fallback. OMP RPC refuses secret prompts; use `/login` in the terminal UI.

```sh
omp --model forge-router/openai/gpt-6-luna --thinking low
```

Remove an obsolete `providers.forge-router` block from `agent/models.yml` after migrating its key into OMP. A hardcoded provider key can override saved login credentials. Other providers and model roles need not change.

## Discovery and metadata

1. Authenticated router `/v1/models` supplies **the complete available model set**. New IDs are added and removed IDs disappear on successful discovery.
2. The public [all-modality OpenRouter catalog](https://openrouter.ai/api/v1/models?output_modalities=all) supplies metadata joined by exact model ID. The unfiltered endpoint defaults to text output. No OpenRouter key is required.
3. Only models advertising text output are registered in OMP's chat picker. Image, video, and decision models remain available for raw metadata inspection. OMP's native `fetchDynamicModels` cache retains discovered chat models for 24 hours and supplies the previous catalog on discovery failure. No static fallback list is registered.
4. OpenRouter metadata is cached separately at `<OMP agent directory>/cache/forge-router/openrouter.json`. Normal discovery uses fresh metadata or last cached metadata when OpenRouter is unavailable.
5. `/forge-router sync` forces both API discovery and upstream metadata refresh, then updates the selected model. It changes availability to match the router, not a curated file.
6. `/forge-router models [id]` shows raw metadata for all returned IDs and timestamps. Sync and inspection report chat counts and list non-chat IDs with their output modalities.

Every returned router ID must have OpenRouter metadata; chat models must also have valid prices, input modalities, and token limits before the discovered catalog replaces the previous one. Unknown IDs fail discovery with the missing ID named; they are not silently omitted or given fabricated free prices. Empty or non-chat-only router catalogs remove all router models from the chat picker. `/forge-router sync` reports if the selected model was removed.

Mapped fields: names, context/output limits, text/image inputs, tool support, reasoning efforts, token/cache prices, and the first context-price tier. Costs convert dollars/token → dollars/million tokens. OMP's separate off control represents `none`, not an effort level. Unsupported modalities, extra tiers, and other raw fields remain inspectable without inventing OMP capabilities.

**Prices are upstream OpenRouter estimates, not Forge billing.** `/extended-context on` permits full advertised windows where OMP otherwise caps them at a long-context pricing threshold.

### Non-chat endpoints

These models use different request/response contracts and are not registered as chat models:

| Output | Metadata endpoint on OpenRouter | Execution endpoint on OpenRouter |
| --- | --- | --- |
| Image | `/api/v1/images/models` | `POST /api/v1/images` |
| Video | `/api/v1/videos/models` | `POST /api/v1/videos`, then poll the job |
| Decisions | `/api/v1/models?output_modalities=decisions` | `POST /api/alpha/decisions` or `/api/v1/systemone` |

References: [images](https://openrouter.ai/docs/guides/overview/multimodal/image-generation), [videos](https://openrouter.ai/docs/guides/overview/multimodal/video-generation), [Jev decisions](https://openrouter.ai/docs/guides/community/jev).

Forge currently exposes `POST /v1/decisions`, but its `/v1/images` and `/v1/videos` routes return 404. Metadata inspection does not add execution support for those APIs.

## Verification

OMP 18.6.1 and Bun 1.4.2: a fresh isolated profile validated the native secret-login callback and API-key persistence across restart. Live API discovery returned 22 metadata records and registered the exact 19 text-output models. Forced sync, selected-model refresh, all three non-chat metadata inspections, and direct remote streaming inference passed. Mapper regressions cover pricing units/tiers, invalid prices, API-driven additions/removals, empty lists, missing metadata, and non-chat exclusion.

An actual OMP process against a controlled catalog also verified additions/removals, preservation on HTTP 503, and authoritative empty/non-chat-only catalogs, including selected-model removal reporting.

The existing local profile has two saved router credentials: one returned 401 and the other 200 during verification. They were left unchanged. A rejected key can prevent sync; use native credential management to remove a revoked key.

```sh
bun test plugins/forge-router/models.test.mjs
```
