import type { ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import type { Effort, Model } from "@oh-my-pi/pi-ai";

type ModelCost = Model["cost"];
type Compatibility = NonNullable<ProviderModelConfig["compat"]>;

interface TokenCost {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
}

interface CostTier extends TokenCost {
  tier: { type: string; size: number };
}

export interface ForgeModel {
  id: string;
  name: string;
  reasoning: boolean;
  reasoning_options?: { type: string; values: string[] }[];
  modalities: { input: string[] };
  tool_call: boolean;
  cost: TokenCost & { tiers?: CostTier[] };
  limit: { context: number; output: number };
}

export type ForgeCatalog = Record<string, ForgeModel>;

const OMP_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as readonly Effort[];

function tokenCost(cost: TokenCost): ModelCost {
  return {
    input: cost.input,
    output: cost.output,
    cacheRead: cost.cache_read ?? 0,
    cacheWrite: cost.cache_write ?? 0,
  };
}

function modelCost(cost: ForgeModel["cost"]): ModelCost {
  const mapped = tokenCost(cost);
  // OMP can represent one long-context rate card. Keep any additional tiers
  // verbatim in the full Forge catalog exposed by /forge models.
  const tiers = (cost.tiers ?? [])
    .filter(({ tier }) => tier?.type === "context")
    .sort((a, b) => a.tier.size - b.tier.size);
  if (tiers.length) {
    mapped.longContext = {
      ...tokenCost(tiers[0]),
      inputThreshold: tiers[0].tier.size,
    };
  }
  return mapped;
}

export function mapForgeModels(
  catalog: ForgeCatalog,
): (ProviderModelConfig & Pick<Model, "supportsTools">)[] {
  return Object.values(catalog).map((model) => {
    const effortValues =
      model.reasoning_options
        ?.filter((option) => option.type === "effort")
        .flatMap((option) => option.values) ?? [];
    // "none" is OMP's separate "off" control, not a thinking effort.
    const efforts = OMP_EFFORTS.filter((effort) => effortValues.includes(effort));
    const thinking: ProviderModelConfig["thinking"] =
      model.reasoning && efforts.length ? { mode: "effort", efforts } : undefined;
    // The endpoint speaks OpenRouter, even when model lineage or its loopback
    // URL would make OMP infer a native vendor/local-serving dialect.
    const reasoningCompat: Compatibility = {
      thinkingFormat: "openrouter",
      reasoningDisableMode: "openrouter-enabled-false",
      supportsReasoningParams: true,
      supportsReasoningEffort: efforts.length > 0,
      omitReasoningEffort: efforts.length === 0,
      reasoningEffortMap: Object.fromEntries(efforts.map((effort) => [effort, effort])),
      disableReasoningOnForcedToolChoice: false,
      disableReasoningOnToolChoice: false,
      disableReasoningWithTools: false,
      requiresThinkingAsText: false,
      requiresReasoningContentForToolCalls: model.reasoning,
      requiresReasoningContentForAllAssistantTurns: false,
      allowsSyntheticReasoningContentForToolCalls: true,
      reasoningContentField: "reasoning",
      replayReasoningContent: false,
      qwenPreserveThinking: false,
      qwenTemplateReasoningEffort: false,
      extraBody: {},
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
        // Override lineage-specific thinking variants as well as the baseline.
        whenThinking: reasoningCompat,
        isOpenRouterHost: true,
        wireModelIdMode: "raw",
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsMultipleSystemMessages: true,
        supportsUsageInStreaming: true,
        maxTokensField: "max_tokens",
        clampOutputToModelMax: true,
        alwaysSendMaxTokens: false,
      },
    };
  });
}
