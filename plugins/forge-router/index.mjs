import { join } from "node:path";
import { discoverCatalog, fetchRouterCatalog } from "./catalog.mjs";
import { mapOpenRouterModels } from "./models.mjs";

const PROVIDER = "forge-router";
const DEFAULT_BASE_URL = "https://forge.forgeworkspace.dev/functions/v1/forge-api/v1";

export default function forgeRouterPlugin(pi) {
  const baseUrl = (process.env.FORGE_ROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const cachePath = join(pi.pi.getAgentDir(), "cache", "forge-router", "openrouter.json");
  let catalog;
  let forceSync = false;
  let discoveryError;

  function show(content) {
    pi.sendMessage({ customType: PROVIDER, content, display: true }, { triggerTurn: false });
  }

  function catalogSummary() {
    const specialized = catalog.data.filter(model => !model.architecture.output_modalities.includes("text"));
    const chatCount = catalog.data.length - specialized.length;
    const detail = specialized.length ? ` Non-chat models (metadata only): ${specialized.map(model => `${model.id} [${model.architecture.output_modalities.join(", ")}]`).join("; ")}.` : "";
    return `${chatCount} chat models from ${catalog.data.length} API-discovered models.${detail}`;
  }

  async function discover(key) {
    try {
      const updated = await discoverCatalog(baseUrl, key, cachePath, forceSync);
      const models = mapOpenRouterModels(updated.data);
      catalog = updated;
      discoveryError = undefined;
      return models;
    } catch (error) {
      discoveryError = error.message;
      throw error;
    }
  }

  pi.registerProvider(PROVIDER, {
    baseUrl,
    api: "openai-completions",
    authHeader: true,
    oauth: {
      name: "Forge Router (API key)",
      async login(callbacks) {
        const key = await callbacks.onPrompt({ message: `Forge Router API key for ${baseUrl}`, secret: true });
        if (!key?.trim()) throw new Error("Forge Router login cancelled: no API key supplied.");
        await fetchRouterCatalog(baseUrl, key, { fetcher: callbacks.fetch ?? fetch, signal: callbacks.signal });
        // A string tells native /login to persist an API-key credential.
        return key;
      },
    },
    fetchDynamicModels: discover,
  });

  pi.registerCommand(PROVIDER, {
    description: "Forge router: /forge-router models [id]; /forge-router sync API roster and OpenRouter metadata",
    handler: async (args, ctx) => {
      const [command, ...rest] = args.trim().split(/\s+/);
      if (command === "models" && rest.length <= 1) {
        try {
          if (!catalog) {
            const key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER, undefined, { baseUrl });
            await discover(key);
          }
          const model = rest.length ? catalog.data.find(model => model.id === rest[0]) : catalog;
          if (!model) {
            show(`Model not returned by Forge Router: ${rest[0]}. Use /forge-router sync to refresh availability.`);
            return;
          }
          const usage = rest.length && !model.architecture.output_modalities.includes("text") ? "\nNon-chat model: metadata only; not registered in OMP's chat picker." : "";
          show(`Forge Router metadata — OpenRouter upstream estimates, fetched ${catalog.fetchedAt}; router discovered ${catalog.discoveredAt}\n${catalogSummary()}${usage}\n\n\`\`\`json\n${JSON.stringify(model, null, 2)}\n\`\`\``);
        } catch (error) {
          show(`Forge Router discovery failed: ${error.message}`);
        }
        return;
      }
      if (command === "sync" && rest.length === 0) {
        await ctx.waitForIdle();
        const current = ctx.models.current();
        try {
          forceSync = true;
          discoveryError = undefined;
          await ctx.modelRegistry.refreshRuntimeProviders("online");
          if (discoveryError) throw new Error(discoveryError);
          if (!catalog) throw new Error("Forge Router discovery did not return a catalog.");
          if (current?.provider === PROVIDER) {
            const model = ctx.modelRegistry.find(PROVIDER, current.id);
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
          show(`Forge Router sync failed: ${error.message}`);
        } finally {
          forceSync = false;
        }
        return;
      }
      show("/login → Forge Router (API key) — save your router key in OMP.\n/forge-router models [id] — inspect all API-discovered models, including non-chat metadata.\n/forge-router sync — refresh API availability and all-modality OpenRouter metadata; register text-output models in the chat picker.\nOMP caches discovered chat models for 24 hours and preserves its last catalog when discovery fails. New installations require login and a successful online discovery. Forge Desktop is not required.\nUse /extended-context on for full advertised context windows. Prices are OpenRouter estimates, not Forge billing.");
    },
  });
}
