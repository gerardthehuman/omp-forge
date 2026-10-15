import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
  applyModelPreset,
  deleteModelPreset,
  formatModelPresetSwitch,
  getModelPreset,
  getModelPresetNames,
  isCleanModelPresetSwitch,
  modelPresetSavedMessage,
  saveModelPreset,
  type ModelPresetSession,
} from "@oh-my-pi/pi-coding-agent/config/model-presets";
import { findScopedSettings, type Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { activatePreset, installPresetRoles, restoreOverrides, SESSION_ENTRY } from "./presets.ts";

const ACTIONS = ["save", "list", "delete", "switch"];

export default function presetsPlugin(pi: ExtensionAPI) {
  let currentSettings: Settings | undefined;
  let baseline: Record<string, unknown> | undefined;
  let activeSession: string | undefined;

  function settingsFor(ctx: ExtensionContext): Settings {
    const settings = findScopedSettings(ctx.cwd);
    if (!settings) throw new Error("No session-scoped OMP settings are available");
    currentSettings = settings;
    return settings;
  }

  function restoreSession(ctx: ExtensionContext) {
    const settings = settingsFor(ctx);
    const sessionId = ctx.sessionManager.getSessionId();
    if (activeSession === sessionId) return;
    if (baseline) restoreOverrides(settings, baseline);
    baseline = undefined;
    activeSession = sessionId;
    // Store a snapshot, not a preset name: edits/deletion must not change a resumed session.
    const entry = ctx.sessionManager
      .getBranch()
      .findLast((entry) => entry.type === "custom" && entry.customType === SESSION_ENTRY);
    if (entry?.type === "custom" && entry.data) {
      const preview = settings.overlay({ modelPresets: { restored: entry.data } });
      const lookup = getModelPreset(preview, "restored");
      if (lookup.kind === "found") {
        baseline = settings.overlayLayers().overrides;
        installPresetRoles(settings, lookup.preset);
      }
    }
  }

  pi.on("session_start", (_event, ctx) => restoreSession(ctx));
  pi.on("session_switch", (_event, ctx) => restoreSession(ctx));
  pi.on("session_tree", (_event, ctx) => {
    activeSession = undefined;
    restoreSession(ctx);
  });

  pi.registerCommand("preset", {
    description:
      "Apply native model presets to this session; save/list/delete/switch manage native presets",
    getArgumentCompletions(prefix) {
      const settings = currentSettings ?? findScopedSettings();
      if (!settings) return null;
      const names = getModelPresetNames(settings);
      const match = /^(switch|delete)\s+(.*)$/.exec(prefix);
      if (match) {
        return names
          .filter((name) => name.startsWith(match[2]!))
          .map((name) => ({
            value: `${match[1]} ${name}`,
            label: name,
          }));
      }
      if (/\s/.test(prefix)) return null;
      return [...new Set([...names, ...ACTIONS])]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ value: name, label: name }));
    },
    async handler(args, ctx) {
      try {
        restoreSession(ctx);
        const settings = settingsFor(ctx);
        const [action = "", ...rest] = args.trim().split(/\s+/);
        const name = rest.join(" ");
        const notify = (text: string, error = false) =>
          ctx.ui.notify(text, error ? "warning" : "info");
        if (action === "list") {
          const names = getModelPresetNames(settings);
          notify(
            names.length
              ? `Model presets: ${names.join(", ")}`
              : "No model presets saved. Use /preset save <name> to create one.",
          );
          return;
        }
        if (action === "save") {
          if (!name) throw new Error("Usage: /preset save <name>");
          saveModelPreset(settings, name);
          await settings.flush();
          notify(modelPresetSavedMessage(settings, name));
          return;
        }
        if (action === "delete") {
          if (!name) throw new Error("Usage: /preset delete <name>");
          const result = deleteModelPreset(settings, name);
          await settings.flush();
          notify(
            result === "deleted"
              ? `Deleted model preset "${name}"`
              : result === "project"
                ? `Preset "${name}" is defined by a project or --config file; remove it there`
                : `Preset not found: ${name}`,
            result !== "deleted",
          );
          return;
        }
        if (action === "switch") {
          if (!name) throw new Error("Usage: /preset switch <name>");
          const previous = settings.overlayLayers().overrides;
          if (baseline) restoreOverrides(settings, baseline);
          const session: ModelPresetSession = {
            modelRegistry: ctx.modelRegistry,
            scopedModels: [],
            getAvailableModels: () => ctx.models.list(),
            setModel: async (model) => {
              if (!(await pi.setModel(model))) throw new Error("Could not switch model");
              return { switched: true };
            },
            setThinkingLevel: (level) =>
              pi.setThinkingLevel(level as Parameters<typeof pi.setThinkingLevel>[0]),
          };
          let result;
          try {
            result = await applyModelPreset(settings, session, name);
          } catch (error) {
            restoreOverrides(settings, previous);
            throw error;
          }
          if (result.kind === "switched" || result.kind === "failed") {
            baseline = undefined;
            pi.appendEntry(SESSION_ENTRY, null);
            await settings.flush();
          } else restoreOverrides(settings, previous);
          notify(formatModelPresetSwitch(name, result), !isCleanModelPresetSwitch(result));
          return;
        }
        let target = action;
        if (!target) {
          const names = getModelPresetNames(settings);
          if (!names.length) {
            notify("No model presets saved. Use /preset save <name> to create one.");
            return;
          }
          if (!ctx.hasUI) throw new Error("Usage: /preset <name> (picker requires interactive UI)");
          target =
            (await ctx.ui.select(
              "Model presets · session only",
              names.map((name) => {
                const lookup = getModelPreset(settings, name);
                return {
                  label: name,
                  description:
                    lookup.kind === "found"
                      ? ["default", "slow", "smol"]
                          .map((role) => `${role}: ${lookup.preset.modelRoles[role] ?? "(unset)"}`)
                          .join("\n")
                      : "Invalid preset",
                };
              }),
            )) ?? "";
          if (!target) return;
        } else if (rest.length) throw new Error("Usage: /preset <name>");
        const previous = settings.overlayLayers().overrides;
        await activatePreset(pi, ctx, settings, target);
        baseline ??= previous;
        notify(`Using preset "${target}" for this session only`);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
