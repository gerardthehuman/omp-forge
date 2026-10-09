import type { Effort, Model } from "@oh-my-pi/pi-ai";
import type { ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";

type ModelDefinition = ProviderModelConfig & Pick<Model, "supportsTools" | "cost">;
type ModelCost = Model["cost"];
type Compatibility = NonNullable<ProviderModelConfig["compat"]>;

export interface OpenRouterPricing {
  prompt?: string | number;
  completion?: string | number;
  input_cache_read?: string | number;
  input_cache_write?: string | number;
  overrides?: (OpenRouterPricing & { min_prompt_tokens: number })[];
}

export interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  top_provider?: { max_completion_tokens?: number };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
  reasoning?: { supported_efforts?: string[] };
  pricing?: OpenRouterPricing;
}

export interface OpenRouterCatalog {
  data: OpenRouterModel[];
}

const OMP_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as readonly Effort[];

function price(value: unknown, field: string, optional = false) {
  if (optional && value == null) return 0;
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid OpenRouter price: ${field}`);
  return number * 1_000_000;
}

function tokenCosts(pricing: OpenRouterPricing): ModelCost {
  return {
    input: price(pricing.prompt, "prompt"),
    output: price(pricing.completion, "completion"),
    cacheRead: price(pricing.input_cache_read, "input_cache_read", true),
    cacheWrite: price(pricing.input_cache_write, "input_cache_write", true),
  };
}

function tokenLimit(value: number | undefined, field: string): number {
  if (value === undefined || !Number.isSafeInteger(value) || value <= 0)
    throw new Error(`Invalid OpenRouter token limit: ${field}`);
  return value;
}

// Router API owns availability; OpenRouter supplies metadata for those IDs only.
export function selectCatalog(catalog: OpenRouterCatalog, routerIds: string[]): OpenRouterModel[] {
  if (!Array.isArray(catalog?.data)) throw new Error("Invalid OpenRouter catalog");
  const byId = new Map(catalog.data.map((model) => [model.id, model]));
  return [...new Set(routerIds)].map((id) => {
    const model = byId.get(id);
    if (!model) throw new Error(`Router model missing from OpenRouter metadata: ${id}`);
    return model;
  });
}

export function mapOpenRouterModels(data: OpenRouterModel[]): ModelDefinition[] {
  return data
    .filter((model) => {
      const output = model.architecture?.output_modalities;
      if (!Array.isArray(output) || output.length === 0)
        throw new Error(`Missing OpenRouter output modalities: ${model.id}`);
      return output.includes("text") || output.includes("decisions");
    })
    .map((model) => {
      const parameters = model.supported_parameters ?? [];
      const reasoning = parameters.includes("reasoning") || parameters.includes("reasoning_effort");
      const efforts = OMP_EFFORTS.filter((effort) =>
        model.reasoning?.supported_efforts?.includes(effort),
      );
      const input = model.architecture?.input_modalities?.filter(
        (type) => type === "text" || type === "image",
      );
      if (!input?.includes("text")) throw new Error(`Unsupported OpenRouter input: ${model.id}`);
      const cost = tokenCosts(model.pricing ?? {});
      const tiers = (model.pricing?.overrides ?? [])
        .filter(
          (tier) => Number.isSafeInteger(tier.min_prompt_tokens) && tier.min_prompt_tokens > 0,
        )
        .sort((a, b) => a.min_prompt_tokens - b.min_prompt_tokens);
      if (tiers.length) {
        cost.longContext = {
          ...tokenCosts({ ...model.pricing, ...tiers[0] }),
          inputThreshold: tiers[0].min_prompt_tokens,
        };
      }
      // A direct router URL (or vendor lineage) must not select a native-vendor
      // reasoning dialect. Apply the same OpenRouter wire contract when thinking.
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
        requiresReasoningContentForToolCalls: reasoning,
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
        api: model.architecture!.output_modalities!.includes("decisions")
          ? "openrouter-decisions"
          : "openai-completions",
        name: model.name!,
        reasoning,
        thinking: reasoning && efforts.length ? { mode: "effort", efforts } : undefined,
        input,
        supportsTools: parameters.includes("tools"),
        cost,
        contextWindow: tokenLimit(model.context_length, "context_length"),
        maxTokens: tokenLimit(model.top_provider?.max_completion_tokens, "max_completion_tokens"),
        compat: {
          ...reasoningCompat,
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
