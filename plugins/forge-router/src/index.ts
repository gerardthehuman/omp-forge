import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import {
  discoverCatalog,
  fetchRouterCatalog,
  readStartupCatalog,
  writeStartupCatalog,
} from "./catalog.ts";
import { mapOpenRouterModels } from "./models.ts";

const PROVIDER = "forge-router";
const DEFAULT_BASE_URL = "https://forge.forgeworkspace.dev/functions/v1/forge-api/v1";

export default async function forgeRouterPlugin(pi: ExtensionAPI) {
  const baseUrl = (process.env.FORGE_ROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const cacheDirectory = join(pi.pi.getAgentDir(), "cache", "forge-router");
  const cachePath = join(cacheDirectory, "openrouter.json");
  const auth = await pi.pi.discoverAuthStorage(pi.pi.getAgentDir());
  let startupKey: string | undefined;
  try {
    startupKey = await auth.keys.peek(PROVIDER);
  } finally {
    auth.close();
  }
  let catalog = startupKey
    ? await readStartupCatalog(cacheDirectory, baseUrl, startupKey)
    : undefined;
  let registered = false;
  let refresh: Promise<void> | undefined;

  function show(content: string) {
    pi.sendMessage({ customType: PROVIDER, content, display: true }, { triggerTurn: false });
  }

  function catalogSummary() {
    const registered = mapOpenRouterModels(catalog!.data);
    const chatCount = registered.filter((model) => model.api === "openai-completions").length;
    const judgeCount = registered.length - chatCount;
    const registeredIds = new Set(registered.map((model) => model.id));
    const unsupported = catalog!.data.filter((model) => !registeredIds.has(model.id));
    const detail = unsupported.length
      ? ` Unavailable native roles: ${unsupported.map((model) => `${model.id} [${model.architecture!.output_modalities!.join(", ")}]`).join("; ")}. Forge Router has no compatible image/video endpoints; OMP has no video role.`
      : "";
    return `${chatCount} chat and ${judgeCount} judge models from ${catalog!.data.length} API-discovered models.${detail}`;
  }

  async function discover(key: string | undefined, force = false) {
    if (!key) throw new Error("Log in to Forge Router with /login before discovering models.");
    const updated = await discoverCatalog(baseUrl, key, cachePath, force);
    await writeStartupCatalog(cacheDirectory, baseUrl, key, updated);
    catalog = updated;
    register();
  }

  function register() {
    // Replacing the provider also clears removed and empty static catalogs.
    if (registered) pi.unregisterProvider(PROVIDER);
    pi.registerProvider(PROVIDER, {
      baseUrl,
      api: "openai-completions",
      authHeader: true,
      models: catalog ? mapOpenRouterModels(catalog.data) : [],
      // Native discovery publishes this snapshot authoritatively, including empty catalogs.
      fetchDynamicModels: async () => (catalog ? mapOpenRouterModels(catalog.data) : []),
      oauth: {
        name: "Forge Router (API key)",
        async login(callbacks) {
          const key = await callbacks.onPrompt({
            message: `Forge Router API key for ${baseUrl}`,
            secret: true,
          });
          if (!key?.trim()) throw new Error("Forge Router login cancelled: no API key supplied.");
          await fetchRouterCatalog(baseUrl, key, {
            fetcher: callbacks.fetch ?? fetch,
            signal: callbacks.signal,
          });
          await discover(key);
          // A string tells native /login to persist an API-key credential.
          return key;
        },
      },
    });
    registered = true;
  }

  // Without a snapshot, discover before OMP resolves its configured default.
  if (!catalog && startupKey) {
    try {
      await discover(startupKey);
    } catch {
      // Startup remains usable offline; /forge-router sync reports discovery errors.
    }
  }
  if (!registered) register();

  pi.on("session_start", (_event, ctx) => {
    ctx.setTimeout(() => {
      refresh ??= (async () => {
        try {
          // Replace any older native discovery cache with the startup snapshot first.
          await ctx.modelRegistry.refreshRuntimeProviders("online");
          const key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER, undefined, {
            baseUrl,
          });
          if (key) {
            await discover(key);
            await ctx.modelRegistry.refreshRuntimeProviders("online");
          }
        } catch (error) {
          ctx.ui.notify(
            `Forge Router refresh failed; cached models retained: ${error instanceof Error ? error.message : String(error)}`,
            "warning",
          );
        } finally {
          refresh = undefined;
        }
      })();
    }, 0);
  });

  pi.registerCommand(PROVIDER, {
    description: "Forge router: /forge-router models [id]; /forge-router sync",
    handler: async (args, ctx) => {
      const [command, ...rest] = args.trim().split(/\s+/);
      if (command === "models" && rest.length <= 1) {
        try {
          if (!catalog) {
            const key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER, undefined, {
              baseUrl,
            });
            await discover(key);
          }
          const model = rest.length
            ? catalog!.data.find((model) => model.id === rest[0])
            : catalog!;
          if (!model) {
            show(
              `Model not returned by Forge Router: ${rest[0]}. Use /forge-router sync to refresh availability.`,
            );
            return;
          }
          const usage =
            rest.length && "architecture" in model
              ? model.architecture?.output_modalities?.includes("decisions")
                ? "\nNative judge model: available to the Judge role, not the chat picker."
                : !model.architecture?.output_modalities?.includes("text")
                  ? "\nNon-chat model: metadata only; no compatible Forge endpoint/native OMP role."
                  : ""
              : "";
          show(
            `Forge Router metadata — OpenRouter upstream estimates, fetched ${catalog!.fetchedAt}; router discovered ${catalog!.discoveredAt}\n${catalogSummary()}${usage}\n\n\`\`\`json\n${JSON.stringify(model, null, 2)}\n\`\`\``,
          );
        } catch (error) {
          show(
            `Forge Router discovery failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return;
      }
      if (command === "sync" && rest.length === 0) {
        await ctx.waitForIdle();
        const current = ctx.models.current();
        try {
          await refresh;
          const key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER, undefined, {
            baseUrl,
          });
          await discover(key, true);
          await ctx.modelRegistry.refreshRuntimeProviders("online");
          if (current?.provider === PROVIDER) {
            const model = ctx.modelRegistry.find(PROVIDER, current.id);
            if (!model) {
              show(
                `Synced ${catalogSummary()} The selected model is no longer chat-compatible or served; select another with /model.`,
              );
              return;
            }
            if (!(await pi.setModel(model))) {
              show(
                `Synced ${catalogSummary()} Could not update the selected model. Select it again with /model.`,
              );
              return;
            }
          }
          show(
            `Synced ${catalogSummary()} Prices are OpenRouter upstream estimates, not Forge billing.`,
          );
        } catch (error) {
          show(
            `Forge Router sync failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return;
      }
      show(
        "/login → Forge Router (API key) — save your router key in OMP.\n/forge-router models [id] — inspect all API-discovered models, including non-chat metadata.\n/forge-router sync — refresh API availability and all-modality OpenRouter metadata; register chat and native judge models.\nAssign Jev to the Judge role in OMP's model browser; it stays out of chat. Image/video metadata remains inspectable, but Forge has no compatible native generation endpoints and OMP has no video role.\nThe plugin registers its last validated catalog before default-model selection and refreshes availability after session startup. Failed refreshes retain cached models. New installations require login and a successful online discovery. Forge Desktop is not required.\nUse /extended-context on for full advertised context windows. Prices are OpenRouter estimates, not Forge billing.",
      );
    },
  });
}
