import { describe, expect, test } from "bun:test";
import type { Effort } from "@oh-my-pi/pi-ai";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { cfgModelRoles } from "@oh-my-pi/pi-coding-agent/config/model-settings";
import { cfgDefaultThinkingLevel } from "@oh-my-pi/pi-coding-agent/session/settings";
import { installPresetRoles, restoreOverrides } from "./presets.ts";

describe("session preset roles", () => {
  test("omitted roles mask parent assignments without changing sibling sessions or persisted layers", () => {
    const parent = Settings.isolated();
    parent.writeValue(
      cfgModelRoles,
      { default: "provider/old", judge: "provider/judge" },
      "global",
    );
    const session = parent.overlay();
    const sibling = parent.overlay();
    const before = parent.getGlobalSettings();
    installPresetRoles(session, { modelRoles: { default: "provider/new", slow: "@default" } });
    expect(session.getModelRoles()).toEqual({ default: "provider/new", slow: "@default" });
    expect(sibling.getModelRoles()).toEqual({ default: "provider/old", judge: "provider/judge" });
    expect(parent.getGlobalSettings()).toEqual(before);
  });

  test("restoring runtime overrides preserves original CLI roles and thinking", () => {
    const settings = Settings.isolated({
      modelRoles: { default: "provider/cli" },
      defaultThinkingLevel: "high",
    });
    const before = settings.overlayLayers().overrides;
    installPresetRoles(settings, {
      modelRoles: { default: "provider/new", smol: "provider/small" },
      defaultThinkingLevel: "low" as Effort,
    });
    restoreOverrides(settings, before);
    expect(settings.getModelRoles()).toEqual({ default: "provider/cli" });
    expect(cfgDefaultThinkingLevel.get(settings)).toBe("high" as Effort);
  });

  test("restoring absent overrides reveals current persisted values rather than pinning stale values", () => {
    const settings = Settings.isolated();
    settings.writeValue(cfgModelRoles, { default: "provider/old" }, "global");
    const before = settings.overlayLayers().overrides;
    installPresetRoles(settings, {
      modelRoles: { default: "provider/session" },
      defaultThinkingLevel: "low" as Effort,
    });
    settings.writeValue(cfgModelRoles, { default: "provider/updated" }, "global");
    restoreOverrides(settings, before);
    expect(settings.getModelRoles()).toEqual({ default: "provider/updated" });
    expect(cfgDefaultThinkingLevel.provenance(settings)).not.toBe("runtime");
  });
});
