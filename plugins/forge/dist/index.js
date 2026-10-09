// @bun
// src/forge.ts
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
var serverFile = process.env.FORGE_SERVER_FILE || join(homedir(), ".forge", "server.json");
async function readForge(route) {
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(serverFile, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      throw Error(`Forge is not running: ${serverFile} is missing.`);
    throw error;
  }
  let host = snapshot.host || "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host) || !Number.isInteger(snapshot.port) || snapshot.port < 1 || snapshot.port > 65535 || typeof snapshot.token !== "string" || !snapshot.token)
    throw Error(`Invalid local Forge server descriptor: ${serverFile}`);
  let authority = host === "::1" ? `[${host}]` : host, response = await fetch(`http://${authority}:${snapshot.port}${route}`, {
    headers: { Authorization: `Bearer ${snapshot.token}` },
    signal: AbortSignal.timeout(1e4),
    redirect: "error"
  });
  if (!response.ok)
    throw Error(`Forge ${route} returned HTTP ${response.status}.`);
  return response.json();
}
async function readForgeUsage() {
  let usage = await readForge("/usage"), available = usage?.budget?.remainingCredits, total = usage?.budget?.dailyBudgetCredits;
  if (typeof available !== "number" || !Number.isFinite(available) || available < 0 || typeof total !== "number" || !Number.isFinite(total) || total < 0)
    throw Error("Forge returned an invalid balance.");
  return `Forge daily credits
Available: ${available.toFixed(2)} credits
Total: ${total.toFixed(2)} credits`;
}

// src/models.ts
var OMP_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];
function tokenCost(cost) {
  return {
    input: cost.input,
    output: cost.output,
    cacheRead: cost.cache_read ?? 0,
    cacheWrite: cost.cache_write ?? 0
  };
}
function modelCost(cost) {
  let mapped = tokenCost(cost), tiers = (cost.tiers ?? []).filter(({ tier }) => tier?.type === "context").sort((a, b) => a.tier.size - b.tier.size);
  if (tiers.length)
    mapped.longContext = {
      ...tokenCost(tiers[0]),
      inputThreshold: tiers[0].tier.size
    };
  return mapped;
}
function mapForgeModels(catalog) {
  return Object.values(catalog).map((model) => {
    let effortValues = model.reasoning_options?.filter((option) => option.type === "effort").flatMap((option) => option.values) ?? [], efforts = OMP_EFFORTS.filter((effort) => effortValues.includes(effort)), thinking = model.reasoning && efforts.length ? { mode: "effort", efforts } : void 0, reasoningCompat = {
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
      requiresReasoningContentForToolCalls: model.reasoning,
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
      name: model.name,
      reasoning: model.reasoning,
      thinking,
      input: model.modalities.input.filter((type) => type === "text" || type === "image"),
      supportsTools: model.tool_call,
      cost: modelCost(model.cost),
      contextWindow: model.limit.context,
      maxTokens: model.limit.output,
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

// src/index.ts
var UNAVAILABLE = "Forge is unavailable or returned an invalid catalog. Start Forge, then run /forge refresh.";
async function forgePlugin(pi) {
  let loadError;
  function show(content) {
    pi.sendMessage({ customType: "forge", content, display: !0 }, { triggerTurn: !1 });
  }
  async function refresh() {
    let [providers, catalog] = await Promise.all([readForge("/providers"), readForge("/models")]), options = providers.forge.options, models = mapForgeModels(catalog);
    return pi.registerProvider("forge", {
      baseUrl: options.baseURL,
      api: "openai-completions",
      apiKey: options.apiKey,
      headers: options.headers,
      models
    }), loadError = void 0, models.length;
  }
  pi.registerCommand("forge", {
    description: "Forge: /forge usage; /forge models [model-id]; /forge refresh",
    handler: async (args, ctx) => {
      let [command, ...rest] = args.trim().split(/\s+/);
      if (command === "usage" && rest.length === 0) {
        try {
          show(await readForgeUsage());
        } catch {
          show("Forge balance unavailable. Start Forge Desktop and wait for its usage snapshot, then run /forge usage again.");
        }
        return;
      }
      if (command === "models") {
        if (rest.length > 1) {
          show("Usage: /forge models [model-id]");
          return;
        }
        try {
          let catalog = await readForge("/models"), id = rest[0], model = id ? catalog[id] ?? Object.values(catalog).find((entry) => entry.id === id) : catalog;
          if (model === void 0) {
            show(`Forge model not found: ${id}. Use /forge models to inspect the full catalog.`);
            return;
          }
          show(`Forge ${id ?? "model catalog"}

\`\`\`json
${JSON.stringify(model, null, 2)}
\`\`\``);
        } catch {
          show(UNAVAILABLE);
        }
        return;
      }
      if (command === "refresh" && rest.length === 0) {
        await ctx.waitForIdle();
        let current = ctx.models.current();
        try {
          let count = await refresh();
          if (current?.provider === "forge") {
            let updated = ctx.models.list().find((model) => model.provider === "forge" && model.id === current.id);
            if (!updated) {
              show(`Refreshed ${count} Forge models. The selected model is no longer in Forge's catalog; select another with /model.`);
              return;
            }
            if (!await pi.setModel(updated)) {
              show(`Refreshed ${count} Forge models, but could not update the selected model. Select it again with /model.`);
              return;
            }
          }
          show(`Refreshed ${count} Forge models and the current Forge connection.`);
        } catch {
          show(`${UNAVAILABLE} Refresh failed; select a Forge model again after a successful refresh.`);
        }
        return;
      }
      show(`/forge usage \u2014 show available and total daily credits from Forge Desktop.
/forge models [model-id] \u2014 inspect current, complete Forge metadata as JSON.
/forge refresh \u2014 reload the Forge endpoint, credential and native model catalog; update the selected Forge model.
After restarting Forge, run /forge refresh and /mcp reload, or restart OMP.
OMP supports text/image inputs and one long-context pricing tier. Other Forge metadata remains available in /forge models. Use /extended-context on for full advertised context windows.
CLI on OMP 18.6.1: --model forge/openai/gpt-6-luna --thinking low (not --model forge/openai/gpt-6-luna:low).`);
    }
  }), pi.on("session_start", (_event, ctx) => {
    if (loadError)
      ctx.ui.notify(loadError, "error");
  });
  try {
    await refresh();
  } catch {
    loadError = UNAVAILABLE, console.error(`[forge] ${loadError}`);
  }
}
export {
  forgePlugin as default
};
