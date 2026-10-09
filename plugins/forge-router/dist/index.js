// @bun
// src/index.ts
import { join } from "path";

// src/catalog.ts
import { readFile, mkdir, writeFile, rename, rm } from "fs/promises";
import { dirname } from "path";
import { randomUUID } from "crypto";

// src/models.ts
var OMP_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];
function price(value, field, optional = !1) {
  if (optional && value == null)
    return 0;
  let number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < 0)
    throw Error(`Invalid OpenRouter price: ${field}`);
  return number * 1e6;
}
function tokenCosts(pricing) {
  return {
    input: price(pricing.prompt, "prompt"),
    output: price(pricing.completion, "completion"),
    cacheRead: price(pricing.input_cache_read, "input_cache_read", !0),
    cacheWrite: price(pricing.input_cache_write, "input_cache_write", !0)
  };
}
function tokenLimit(value, field) {
  if (value === void 0 || !Number.isSafeInteger(value) || value <= 0)
    throw Error(`Invalid OpenRouter token limit: ${field}`);
  return value;
}
function selectCatalog(catalog, routerIds) {
  if (!Array.isArray(catalog?.data))
    throw Error("Invalid OpenRouter catalog");
  let byId = new Map(catalog.data.map((model) => [model.id, model]));
  return [...new Set(routerIds)].map((id) => {
    let model = byId.get(id);
    if (!model)
      throw Error(`Router model missing from OpenRouter metadata: ${id}`);
    return model;
  });
}
function mapOpenRouterModels(data) {
  return data.filter((model) => {
    let output = model.architecture?.output_modalities;
    if (!Array.isArray(output) || output.length === 0)
      throw Error(`Missing OpenRouter output modalities: ${model.id}`);
    return output.includes("text") || output.includes("decisions");
  }).map((model) => {
    let parameters = model.supported_parameters ?? [], reasoning = parameters.includes("reasoning") || parameters.includes("reasoning_effort"), efforts = OMP_EFFORTS.filter((effort) => model.reasoning?.supported_efforts?.includes(effort)), input = model.architecture?.input_modalities?.filter((type) => type === "text" || type === "image");
    if (!input?.includes("text"))
      throw Error(`Unsupported OpenRouter input: ${model.id}`);
    let cost = tokenCosts(model.pricing ?? {}), tiers = (model.pricing?.overrides ?? []).filter((tier) => Number.isSafeInteger(tier.min_prompt_tokens) && tier.min_prompt_tokens > 0).sort((a, b) => a.min_prompt_tokens - b.min_prompt_tokens);
    if (tiers.length)
      cost.longContext = {
        ...tokenCosts({ ...model.pricing, ...tiers[0] }),
        inputThreshold: tiers[0].min_prompt_tokens
      };
    let reasoningCompat = {
      thinkingFormat: "openrouter",
      reasoningDisableMode: "openrouter-enabled-false",
      supportsReasoningParams: !0,
      supportsReasoningEffort: efforts.length > 0,
      omitReasoningEffort: efforts.length === 0,
      reasoningEffortMap: Object.fromEntries(efforts.map((effort) => [effort, effort])),
      disableReasoningOnForcedToolChoice: !1,
      disableReasoningOnToolChoice: !1,
      disableReasoningWithTools: !1,
      requiresThinkingAsText: !1,
      requiresReasoningContentForToolCalls: reasoning,
      requiresReasoningContentForAllAssistantTurns: !1,
      allowsSyntheticReasoningContentForToolCalls: !0,
      reasoningContentField: "reasoning",
      replayReasoningContent: !1,
      qwenPreserveThinking: !1,
      qwenTemplateReasoningEffort: !1,
      extraBody: {}
    };
    return {
      id: model.id,
      api: model.architecture.output_modalities.includes("decisions") ? "openrouter-decisions" : "openai-completions",
      name: model.name,
      reasoning,
      thinking: reasoning && efforts.length ? { mode: "effort", efforts } : void 0,
      input,
      supportsTools: parameters.includes("tools"),
      cost,
      contextWindow: tokenLimit(model.context_length, "context_length"),
      maxTokens: tokenLimit(model.top_provider?.max_completion_tokens, "max_completion_tokens"),
      compat: {
        ...reasoningCompat,
        whenThinking: reasoningCompat,
        isOpenRouterHost: !0,
        wireModelIdMode: "raw",
        supportsStore: !1,
        supportsDeveloperRole: !1,
        supportsMultipleSystemMessages: !0,
        supportsUsageInStreaming: !0,
        maxTokensField: "max_tokens",
        clampOutputToModelMax: !0,
        alwaysSendMaxTokens: !1
      }
    };
  });
}

// src/catalog.ts
var OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=all", TTL_MS = 86400000;
async function fetchRouterCatalog(baseUrl, key, {
  fetcher = fetch,
  signal
} = {}) {
  if (!key)
    throw Error("Log in to Forge Router with /login before discovering models.");
  let response;
  try {
    response = await fetcher(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
      redirect: "error"
    });
  } catch {
    throw Error("Forge Router model endpoint is unreachable.");
  }
  if (!response.ok)
    throw Error(`Forge Router model endpoint returned HTTP ${response.status}.`);
  let catalog = await response.json();
  if (!Array.isArray(catalog?.data) || catalog.data.some((model) => typeof model.id !== "string" || !model.id))
    throw Error("Invalid Forge Router model catalog.");
  return catalog;
}
async function openRouterCatalog(cachePath, force) {
  let cached;
  try {
    if (cached = JSON.parse(await readFile(cachePath, "utf8")), !Array.isArray(cached?.data) || cached.source !== OPENROUTER_MODELS_URL)
      cached = void 0;
  } catch {}
  let age = Date.now() - Date.parse(cached?.fetchedAt ?? "");
  if (!force && cached && age >= 0 && age < TTL_MS)
    return cached;
  try {
    let response = await fetch(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok)
      throw Error(`OpenRouter returned HTTP ${response.status}.`);
    let catalog = {
      ...await response.json(),
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: OPENROUTER_MODELS_URL
    };
    if (!Array.isArray(catalog.data))
      throw Error("Invalid OpenRouter catalog.");
    await mkdir(dirname(cachePath), { recursive: !0 });
    let temporary = `${cachePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(catalog) + `
`, { mode: 384 }), await rename(temporary, cachePath);
    } finally {
      await rm(temporary, { force: !0 });
    }
    return catalog;
  } catch {
    if (!force && cached)
      return cached;
    throw Error("OpenRouter metadata sync failed; current models are unchanged.");
  }
}
async function discoverCatalog(baseUrl, key, cachePath, force = !1) {
  let [router, upstream] = await Promise.all([
    fetchRouterCatalog(baseUrl, key),
    openRouterCatalog(cachePath, force)
  ]), data = selectCatalog(upstream, router.data.map((model) => model.id));
  return mapOpenRouterModels(data), { fetchedAt: upstream.fetchedAt, discoveredAt: (/* @__PURE__ */ new Date()).toISOString(), data };
}

// src/index.ts
var PROVIDER = "forge-router", DEFAULT_BASE_URL = "https://forge.forgeworkspace.dev/functions/v1/forge-api/v1";
function forgeRouterPlugin(pi) {
  let baseUrl = (process.env.FORGE_ROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""), cachePath = join(pi.pi.getAgentDir(), "cache", "forge-router", "openrouter.json"), catalog, forceSync = !1, discoveryError;
  function show(content) {
    pi.sendMessage({ customType: PROVIDER, content, display: !0 }, { triggerTurn: !1 });
  }
  function catalogSummary() {
    let registered = mapOpenRouterModels(catalog.data), chatCount = registered.filter((model) => model.api === "openai-completions").length, judgeCount = registered.length - chatCount, registeredIds = new Set(registered.map((model) => model.id)), unsupported = catalog.data.filter((model) => !registeredIds.has(model.id)), detail = unsupported.length ? ` Unavailable native roles: ${unsupported.map((model) => `${model.id} [${model.architecture.output_modalities.join(", ")}]`).join("; ")}. Forge Router has no compatible image/video endpoints; OMP has no video role.` : "";
    return `${chatCount} chat and ${judgeCount} judge models from ${catalog.data.length} API-discovered models.${detail}`;
  }
  async function discover(key) {
    try {
      let updated = await discoverCatalog(baseUrl, key, cachePath, forceSync), models = mapOpenRouterModels(updated.data);
      return catalog = updated, discoveryError = void 0, models;
    } catch (error) {
      throw discoveryError = error instanceof Error ? error.message : String(error), error;
    }
  }
  pi.registerProvider(PROVIDER, {
    baseUrl,
    api: "openai-completions",
    authHeader: !0,
    oauth: {
      name: "Forge Router (API key)",
      async login(callbacks) {
        let key = await callbacks.onPrompt({
          message: `Forge Router API key for ${baseUrl}`,
          secret: !0
        });
        if (!key?.trim())
          throw Error("Forge Router login cancelled: no API key supplied.");
        return await fetchRouterCatalog(baseUrl, key, {
          fetcher: callbacks.fetch ?? fetch,
          signal: callbacks.signal
        }), key;
      }
    },
    fetchDynamicModels: discover
  }), pi.registerCommand(PROVIDER, {
    description: "Forge router: /forge-router models [id]; /forge-router sync",
    handler: async (args, ctx) => {
      let [command, ...rest] = args.trim().split(/\s+/);
      if (command === "models" && rest.length <= 1) {
        try {
          if (!catalog) {
            let key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER, void 0, {
              baseUrl
            });
            await discover(key);
          }
          let model = rest.length ? catalog.data.find((model) => model.id === rest[0]) : catalog;
          if (!model) {
            show(`Model not returned by Forge Router: ${rest[0]}. Use /forge-router sync to refresh availability.`);
            return;
          }
          let usage = rest.length && "architecture" in model ? model.architecture?.output_modalities?.includes("decisions") ? `
Native judge model: available to the Judge role, not the chat picker.` : !model.architecture?.output_modalities?.includes("text") ? `
Non-chat model: metadata only; no compatible Forge endpoint/native OMP role.` : "" : "";
          show(`Forge Router metadata \u2014 OpenRouter upstream estimates, fetched ${catalog.fetchedAt}; router discovered ${catalog.discoveredAt}
${catalogSummary()}${usage}

\`\`\`json
${JSON.stringify(model, null, 2)}
\`\`\``);
        } catch (error) {
          show(`Forge Router discovery failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        return;
      }
      if (command === "sync" && rest.length === 0) {
        await ctx.waitForIdle();
        let current = ctx.models.current();
        try {
          if (forceSync = !0, discoveryError = void 0, await ctx.modelRegistry.refreshRuntimeProviders("online"), discoveryError)
            throw Error(discoveryError);
          if (!catalog)
            throw Error("Forge Router discovery did not return a catalog.");
          if (current?.provider === PROVIDER) {
            let model = ctx.modelRegistry.find(PROVIDER, current.id);
            if (!model) {
              show(`Synced ${catalogSummary()} The selected model is no longer chat-compatible or served; select another with /model.`);
              return;
            }
            if (!await pi.setModel(model)) {
              show(`Synced ${catalogSummary()} Could not update the selected model. Select it again with /model.`);
              return;
            }
          }
          show(`Synced ${catalogSummary()} Prices are OpenRouter upstream estimates, not Forge billing.`);
        } catch (error) {
          show(`Forge Router sync failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          forceSync = !1;
        }
        return;
      }
      show(`/login \u2192 Forge Router (API key) \u2014 save your router key in OMP.
/forge-router models [id] \u2014 inspect all API-discovered models, including non-chat metadata.
/forge-router sync \u2014 refresh API availability and all-modality OpenRouter metadata; register chat and native judge models.
Assign Jev to the Judge role in OMP's model browser; it stays out of chat. Image/video metadata remains inspectable, but Forge has no compatible native generation endpoints and OMP has no video role.
OMP caches discovered models for 24 hours and preserves its last catalog when discovery fails. New installations require login and a successful online discovery. Forge Desktop is not required.
Use /extended-context on for full advertised context windows. Prices are OpenRouter estimates, not Forge billing.`);
    }
  });
}
export {
  forgeRouterPlugin as default
};
