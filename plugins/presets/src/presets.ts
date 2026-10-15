import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
  acquireModelRoleMutation,
  getModelPreset,
} from "@oh-my-pi/pi-coding-agent/config/model-presets";
import { cfgModelRoles, type ModelPreset } from "@oh-my-pi/pi-coding-agent/config/model-settings";
import {
  pickDefaultAvailableModel,
  resolveModelRoleValue,
} from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import type { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { cfgDefaultThinkingLevel } from "@oh-my-pi/pi-coding-agent/session/settings";

export const SESSION_ENTRY = "native-presets/session";

export function roleOverrides(
  settings: Settings,
  preset: ModelPreset,
): Record<string, string | null> {
  const roles: Record<string, string | null> = {};
  for (const role of Object.keys(settings.getModelRoles())) roles[role] = null;
  return Object.assign(roles, preset.modelRoles);
}

export function installPresetRoles(settings: Settings, preset: ModelPreset): void {
  // Records merge across layers: null tombstones prevent omitted roles leaking in.
  settings.writeValue(cfgModelRoles, roleOverrides(settings, preset), "override");
  if (preset.defaultThinkingLevel !== undefined) {
    cfgDefaultThinkingLevel.override(settings, preset.defaultThinkingLevel);
  }
}

export async function activatePreset(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  settings: Settings,
  name: string,
): Promise<ModelPreset> {
  const release = await acquireModelRoleMutation();
  try {
    const lookup = getModelPreset(settings, name);
    if (lookup.kind === "missing") throw new Error(`Preset not found: ${name}`);
    if (lookup.kind === "invalid")
      throw new Error(`Preset "${name}" is malformed: ${lookup.reason}`);
    const { preset } = lookup;
    const candidates = ctx.models.list();
    const preview = settings.overlay();
    installPresetRoles(preview, preset);
    const selector = preset.modelRoles.default;
    const resolved = selector
      ? resolveModelRoleValue(selector, candidates, { settings: preview })
      : undefined;
    const model = selector
      ? resolved?.model
      : pickDefaultAvailableModel(
          candidates.filter((candidate) => ctx.modelRegistry.hasConfiguredAuth(candidate)),
          (provider) => ctx.modelRegistry.hasConcreteAuth(provider),
        );
    if (!model) throw new Error(`Preset "${name}" has no available default model`);
    if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
      throw new Error(`No credentials for ${model.provider}/${model.id}`);
    }
    const previous = settings.overlayLayers().overrides;
    installPresetRoles(settings, preset);
    try {
      // The host API emits model_changed and records model_change via AgentSession.setModel.
      if (!(await pi.setModel(model)))
        throw new Error(`Could not select ${model.provider}/${model.id}`);
      const thinking = resolved?.explicitThinkingLevel
        ? resolved.thinkingLevel
        : (preset.defaultThinkingLevel ?? cfgDefaultThinkingLevel.get(settings));
      if (thinking !== undefined && thinking !== "inherit") {
        // Host accepts configured levels (including auto); its extension type omits auto.
        pi.setThinkingLevel(thinking as Parameters<ExtensionAPI["setThinkingLevel"]>[0]);
      }
    } catch (error) {
      restoreOverrides(settings, previous);
      throw error;
    }
    pi.appendEntry(SESSION_ENTRY, preset);
    return preset;
  } finally {
    release();
  }
}

export function restoreOverrides(settings: Settings, overrides: Record<string, unknown>): void {
  for (const setting of [cfgModelRoles, cfgDefaultThinkingLevel]) {
    const value = overrides[setting.id];
    if (value === undefined) settings.clearOverrideValue(setting);
    else settings.writeValue(setting, value, "override");
  }
}
