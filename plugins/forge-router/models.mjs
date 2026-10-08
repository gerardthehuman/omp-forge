const OMP_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];

function price(value, field, optional = false) {
  if (optional && value == null) return 0;
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid OpenRouter price: ${field}`);
  return number * 1_000_000;
}

function tokenCosts(pricing) {
  return {
    input: price(pricing.prompt, "prompt"),
    output: price(pricing.completion, "completion"),
    cacheRead: price(pricing.input_cache_read, "input_cache_read", true),
    cacheWrite: price(pricing.input_cache_write, "input_cache_write", true),
  };
}

function tokenLimit(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid OpenRouter token limit: ${field}`);
  return value;
}

// Router API owns availability; OpenRouter supplies metadata for those IDs only.
export function selectCatalog(catalog, routerIds) {
  if (!Array.isArray(catalog?.data)) throw new Error("Invalid OpenRouter catalog");
  const byId = new Map(catalog.data.map(model => [model.id, model]));
  return [...new Set(routerIds)].map(id => {
    const model = byId.get(id);
    if (!model) throw new Error(`Router model missing from OpenRouter metadata: ${id}`);
    return model;
  });
}

export function mapOpenRouterModels(data) {
  return data.filter(model => {
    const output = model.architecture?.output_modalities;
    if (!Array.isArray(output) || output.length === 0) throw new Error(`Missing OpenRouter output modalities: ${model.id}`);
    return output.includes("text");
  }).map(model => {
    const parameters = model.supported_parameters ?? [];
    const reasoning = parameters.includes("reasoning") || parameters.includes("reasoning_effort");
    const efforts = OMP_EFFORTS.filter(effort => model.reasoning?.supported_efforts?.includes(effort));
    const input = model.architecture?.input_modalities?.filter(type => type === "text" || type === "image");
    if (!input?.includes("text")) throw new Error(`Unsupported OpenRouter input: ${model.id}`);
    const cost = tokenCosts(model.pricing);
    const tiers = (model.pricing.overrides ?? [])
      .filter(tier => Number.isSafeInteger(tier.min_prompt_tokens) && tier.min_prompt_tokens > 0)
      .sort((a, b) => a.min_prompt_tokens - b.min_prompt_tokens);
    if (tiers.length) {
      cost.longContext = {
        ...tokenCosts({ ...model.pricing, ...tiers[0] }),
        inputThreshold: tiers[0].min_prompt_tokens,
      };
    }
    // A direct router URL (or vendor lineage) must not select a native-vendor
    // reasoning dialect. Apply the same OpenRouter wire contract when thinking.
    const reasoningCompat = {
      thinkingFormat: "openrouter",
      reasoningDisableMode: "openrouter-enabled-false",
      supportsReasoningParams: true,
      supportsReasoningEffort: efforts.length > 0,
      omitReasoningEffort: efforts.length === 0,
      reasoningEffortMap: Object.fromEntries(efforts.map(effort => [effort, effort])),
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
      name: model.name,
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
