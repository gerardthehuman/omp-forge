import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { readForge, readForgeUsage } from "./forge.ts";
import { mapForgeModels } from "./models.ts";

const UNAVAILABLE =
  "Forge is unavailable or returned an invalid catalog. Start Forge, then run /forge refresh.";

export default async function forgePlugin(pi: ExtensionAPI) {
  let loadError: string | undefined;

  function show(content: string) {
    pi.sendMessage({ customType: "forge", content, display: true }, { triggerTurn: false });
  }

  async function refresh() {
    const [providers, catalog] = await Promise.all([readForge("/providers"), readForge("/models")]);
    const options = providers.forge.options;
    const models = mapForgeModels(catalog);
    pi.registerProvider("forge", {
      // OMP appends /chat/completions itself; Forge does not use /v1.
      baseUrl: options.baseURL,
      api: "openai-completions",
      apiKey: options.apiKey,
      headers: options.headers,
      models,
    });
    loadError = undefined;
    return models.length;
  }

  pi.registerCommand("forge", {
    description: "Forge: /forge usage; /forge models [model-id]; /forge refresh",
    handler: async (args, ctx) => {
      const [command, ...rest] = args.trim().split(/\s+/);
      if (command === "usage" && rest.length === 0) {
        try {
          show(await readForgeUsage());
        } catch {
          show(
            "Forge balance unavailable. Start Forge Desktop and wait for its usage snapshot, then run /forge usage again.",
          );
        }
        return;
      }
      if (command === "models") {
        if (rest.length > 1) {
          show("Usage: /forge models [model-id]");
          return;
        }
        try {
          const catalog = await readForge("/models");
          const id = rest[0];
          const model = id
            ? (catalog[id] ?? Object.values(catalog).find((entry) => entry.id === id))
            : catalog;
          if (model === undefined) {
            show(`Forge model not found: ${id}. Use /forge models to inspect the full catalog.`);
            return;
          }
          show(
            `Forge ${id ?? "model catalog"}\n\n\`\`\`json\n${JSON.stringify(model, null, 2)}\n\`\`\``,
          );
        } catch {
          show(UNAVAILABLE);
        }
        return;
      }
      if (command === "refresh" && rest.length === 0) {
        await ctx.waitForIdle();
        const current = ctx.models.current();
        try {
          const count = await refresh();
          // The session holds its selected Model object; replace it as well as
          // the registry entry so a changed port/key reaches the next request.
          if (current?.provider === "forge") {
            const updated = ctx.models
              .list()
              .find((model) => model.provider === "forge" && model.id === current.id);
            if (!updated) {
              show(
                `Refreshed ${count} Forge models. The selected model is no longer in Forge's catalog; select another with /model.`,
              );
              return;
            }
            if (!(await pi.setModel(updated))) {
              show(
                `Refreshed ${count} Forge models, but could not update the selected model. Select it again with /model.`,
              );
              return;
            }
          }
          show(`Refreshed ${count} Forge models and the current Forge connection.`);
        } catch {
          show(
            `${UNAVAILABLE} Refresh failed; select a Forge model again after a successful refresh.`,
          );
        }
        return;
      }
      show(
        "/forge usage — show available and total daily credits from Forge Desktop.\n/forge models [model-id] — inspect current, complete Forge metadata as JSON.\n/forge refresh — reload the Forge endpoint, credential and native model catalog; update the selected Forge model.\nAfter restarting Forge, run /forge refresh and /mcp reload, or restart OMP.\nOMP supports text/image inputs and one long-context pricing tier. Other Forge metadata remains available in /forge models. Use /extended-context on for full advertised context windows.\nCLI on OMP 18.6.1: --model forge/openai/gpt-6-luna --thinking low (not --model forge/openai/gpt-6-luna:low).",
      );
    },
  });

  pi.on("session_start", (_event, ctx) => {
    if (loadError) ctx.ui.notify(loadError, "error");
  });

  try {
    await refresh();
  } catch {
    // A missing gateway must not abort loading unrelated extensions. A fixed
    // message also avoids exposing credentials from endpoint/error payloads.
    loadError = UNAVAILABLE;
    console.error(`[forge] ${loadError}`);
  }
}
