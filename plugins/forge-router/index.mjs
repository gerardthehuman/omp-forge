import { join } from "node:path";
import { loadCatalog, syncCatalog } from "./catalog.mjs";
import { mapOpenRouterModels } from "./models.mjs";

const PROVIDER = "forge-router";
const DEFAULT_BASE_URL = "https://forge.forgeworkspace.dev/functions/v1/forge-api/v1";

export default async function forgeRouterPlugin(pi) {
  const baseUrl = (process.env.FORGE_ROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const cachePath = join(pi.pi.getAgentDir(), "cache", "forge-router", "catalog.json");
  let catalog;

  function show(content) {
    pi.sendMessage({ customType: PROVIDER, content, display: true }, { triggerTurn: false });
  }

  const oauth = {
    name: "Forge Router (API key)",
    async login(callbacks) {
      const key = await callbacks.onPrompt({ message: `Forge Router API key for ${baseUrl}`, secret: true });
      if (!key?.trim()) throw new Error("Forge Router login cancelled: no API key supplied.");
      let response;
      try {
        response = await (callbacks.fetch ?? fetch)(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: callbacks.signal
            ? AbortSignal.any([callbacks.signal, AbortSignal.timeout(10000)])
            : AbortSignal.timeout(10000),
          redirect: "error",
        });
      } catch {
        throw new Error("Forge Router login could not reach the configured endpoint; no credential was saved.");
      }
      if (!response.ok) throw new Error(`Forge Router rejected the API key (HTTP ${response.status}); no credential was saved.`);
      // Returning a string makes OMP store a plain API-key credential, not a
      // fabricated OAuth token. Native /login owns persistence and /logout.
      return key;
    },
  };

  function register() {
    pi.registerProvider(PROVIDER, {
      baseUrl,
      api: "openai-completions",
      oauth,
      models: mapOpenRouterModels(catalog.data),
    });
  }

  pi.registerCommand(PROVIDER, {
    description: "Forge router: /forge-router models [id]; /forge-router sync OpenRouter metadata",
    handler: async (args, ctx) => {
      const [command, ...rest] = args.trim().split(/\s+/);
      if (command === "models" && rest.length <= 1) {
        const model = rest.length ? catalog.data.find(model => model.id === rest[0]) : catalog;
        if (!model) {
          show(`Model not in the curated Forge Router roster: ${rest[0]}. Use /forge-router models.`);
          return;
        }
        show(`Forge Router metadata — OpenRouter upstream estimates, fetched ${catalog.fetchedAt}\n\n\`\`\`json\n${JSON.stringify(model, null, 2)}\n\`\`\``);
        return;
      }
      if (command === "sync" && rest.length === 0) {
        await ctx.waitForIdle();
        const current = ctx.models.current();
        try {
          const updated = await syncCatalog(cachePath);
          catalog = updated;
          register();
          if (current?.provider === PROVIDER) {
            const model = ctx.models.list().find(model => model.provider === PROVIDER && model.id === current.id);
            if (!model || !await pi.setModel(model)) {
              show(`Synced ${catalog.data.length} models, but could not update the selected model. Select it again with /model.`);
              return;
            }
          }
          show(`Synced ${catalog.data.length} curated Forge Router models from OpenRouter at ${catalog.fetchedAt}. Prices are upstream estimates, not Forge billing.`);
        } catch (error) {
          show(`Forge Router metadata sync failed: ${error.message}`);
        }
        return;
      }
      show("/login → Forge Router (API key) — save your router key in OMP.\n/forge-router models [id] — inspect the curated roster and raw OpenRouter metadata.\n/forge-router sync — refresh metadata and the selected router model without expanding the roster.\nMetadata refreshes after 24 hours on startup; the last snapshot works offline. Forge Desktop is not required.\nUse /extended-context on for full advertised context windows. Prices are OpenRouter upstream estimates, not Forge billing.");
    },
  });

  const loaded = await loadCatalog(cachePath);
  catalog = loaded.catalog;
  register();
  pi.on("session_start", (_event, ctx) => {
    if (loaded.warning) ctx.ui.notify(loaded.warning, "warning");
  });
}
